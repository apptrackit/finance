import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, expect, vi } from 'vitest'
import { createTestHarness, unstable_splitSqlQuery, type TestHarnessOptions } from 'wrangler'

const origin = 'https://finance.test'
const issuer = 'https://finance-test.cloudflareaccess.com'
const audience = 'finance-test-audience'
const migrationsDir = resolve('api/migrations')

export async function migrate(db: D1Database, through = Infinity) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS migration_history (
    id TEXT PRIMARY KEY, migration_name TEXT NOT NULL UNIQUE,
    executed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run()
  const files = (await readdir(migrationsDir)).filter(name => /^\d+-.*\.sql$/.test(name)).sort()
  for (const file of files) {
    if (Number(file.split('-')[0]) > through) continue
    const name = file.slice(0, -4)
    if (await db.prepare('SELECT id FROM migration_history WHERE migration_name = ?').bind(name).first()) continue
    // The repo uses a filename ledger, not Wrangler's d1_migrations table.
    // Wrangler's parser preserves semicolons inside trigger bodies.
    const sql = await readFile(resolve(migrationsDir, file), 'utf8')
    try {
      await db.batch(unstable_splitSqlQuery(sql).map(statement => db.prepare(statement)))
      await db.prepare('INSERT INTO migration_history (id, migration_name) VALUES (?, ?)').bind(name, name).run()
    } catch (cause) {
      throw new Error(`Migration failed: ${file}`, { cause })
    }
  }
}

export function useFinanceWorkers({ migrateBeforeEach = true } = {}) {
  // Inline configs cannot pick up a developer's private Wrangler configs or secrets.
  // Keep runtime flags/dates aligned with the tracked wrangler.toml.example files.
  const database = { binding: 'DB', database_name: 'finance-test', database_id: '00000000-0000-4000-8000-000000000001' }
  const workers: TestHarnessOptions['workers'] = [
    { config: {
      name: 'finance-api-test', main: resolve('api/src/index.ts'),
      compatibility_date: '2024-09-23', compatibility_flags: ['nodejs_compat'],
      define: { __dirname: "'/'" }, d1_databases: [database],
      vars: { API_SECRET: 'integration-test-key', ALLOWED_ORIGINS: origin },
    } },
    { config: {
      name: 'finance-mcp-test', main: resolve('mcp/src/index.ts'),
      compatibility_date: '2026-07-01', workers_dev: false, d1_databases: [database],
      vars: { CF_ACCESS_TEAM_DOMAIN: issuer, CF_ACCESS_AUD: audience, ALLOWED_EMAIL: 'tester@example.com' },
    } },
  ]
  const server = createTestHarness()
  let temporaryRoot: string | undefined
  const api = server.getWorker<{ DB: D1Database }>('finance-api-test')
  const mcp = server.getWorker('finance-mcp-test')
  let db: D1Database
  let key: CryptoKey
  let jwk: JsonWebKey
  let unexpectedRequests: string[] = []

  async function accessToken(claims: Record<string, unknown> = {}) {
    const now = Math.floor(Date.now() / 1000)
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'integration-key' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({
      iss: issuer, aud: [audience], email: 'tester@example.com', exp: now + 3600, ...claims,
    })).toString('base64url')
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${payload}`))
    return `${header}.${payload}.${Buffer.from(signature).toString('base64url')}`
  }

  beforeAll(async () => {
    const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
    key = pair.privateKey
    jwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
    // A separate config root also prevents automatic .env/.dev.vars discovery.
    temporaryRoot = await mkdtemp(join(tmpdir(), 'finance-integration-'))
    await server.update({ root: temporaryRoot, workers })
    await server.listen()
  })
  beforeEach(async () => {
    unexpectedRequests = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = input instanceof Request ? input.url : String(input)
      if (url === `${issuer}/cdn-cgi/access/certs`) return Response.json({ keys: [{ ...jwk, kid: 'integration-key' }] })
      if (url === 'https://open.er-api.com/v6/latest/HUF') return Response.json({ result: 'success', rates: { HUF: 1, EUR: 0.0025 } })
      unexpectedRequests.push(url)
      throw new Error(`Unexpected outbound request: ${url}`)
    })
    db = (await api.getEnv()).DB
    if (migrateBeforeEach) await migrate(db)
  })
  afterEach(async ({ task }) => {
    if (task.result?.state === 'fail') server.debug()
    vi.restoreAllMocks()
    await server.reset()
    // Fail even when application code swallowed an unexpected network error.
    expect(unexpectedRequests).toEqual([])
  })
  afterAll(async () => {
    try { await server.close() }
    finally { if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true }) }
  })

  return {
    get db() { return db },
    api, mcp, accessToken,
    request(path: string, method = 'GET', body?: unknown, date = '2026-01-15') {
      return api.fetch(path, { method, headers: {
        Origin: origin, 'X-API-Key': 'integration-test-key', 'X-Client-Date': date,
        'Content-Type': 'application/json',
      }, body: body === undefined ? undefined : JSON.stringify(body) })
    },
    async tool<T>(name: string, args: Record<string, unknown>): Promise<T> {
      const response = await mcp.fetch('/mcp', { method: 'POST', headers: {
        'Content-Type': 'application/json', 'Cf-Access-Jwt-Assertion': await accessToken(),
      }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) })
      expect(response.status).toBe(200)
      const body = await response.json() as { result?: { isError: boolean; structuredContent: T; content: unknown }; error?: unknown }
      if (body.error || body.result?.isError) throw new Error(JSON.stringify(body))
      expect(body.result).toBeDefined()
      return body.result!.structuredContent
    },
    async seed() {
      await db.batch([
        db.prepare("INSERT INTO accounts (id, name, type, balance, currency, updated_at) VALUES ('cash', 'Test cash', 'checking', 1000, 'HUF', 1)"),
        db.prepare("INSERT INTO accounts (id, name, type, balance, currency, updated_at) VALUES ('savings', 'Test savings', 'savings', 200, 'HUF', 1)"),
        db.prepare("INSERT INTO categories (id, name, type) VALUES ('food', 'Test food', 'expense')"),
      ])
    },
    async balances() {
      return (await db.prepare('SELECT id, balance FROM accounts ORDER BY id').all()).results
    },
  }
}
