import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { apiOrigin, d1Rows, deploy, deploymentPlan, parseArgs, parseConfig, runCommand } from './deploy.mjs'

const script = fileURLToPath(new URL('./deploy.mjs', import.meta.url))
const fixtureConfig = {
  PROJECT_NAME: 'test-client', DATABASE_ID: '00000000-0000-4000-8000-000000000001', DATABASE_NAME: 'test-db',
  API_WORKER_NAME: 'test-api', API_SECRET: 'test-only-key=$with\\special#chars',
  ALLOWED_ORIGINS: 'https://finance.test', API_URL: 'https://api.finance.test', DEPLOY_MCP: 'false',
  MCP_WORKER_NAME: 'test-mcp', MCP_ACCESS_TEAM_DOMAIN: 'test-team.cloudflareaccess.com',
  MCP_ACCESS_AUD: 'test-audience', MCP_ALLOWED_EMAIL: 'tester@example.com',
}
const json = rows => JSON.stringify([{ success: true, results: rows }])

async function fixture(t, { config = fixtureConfig, applied = ['001-init', '002-change'], fail, branch = 'main', answer = 'n' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'finance-deploy-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  for (const dir of ['api/migrations', 'mcp', 'client/dist/assets']) await mkdir(join(root, dir), { recursive: true })
  await writeFile(join(root, '.deploy-config'), Object.entries(config).map(([key, value]) => `${key}=${value}`).join('\n') + '\n')
  await writeFile(join(root, 'api/migrations/001-init.sql'), 'CREATE TABLE example (id TEXT);')
  await writeFile(join(root, 'api/migrations/002-change.sql'), 'ALTER TABLE example ADD COLUMN value TEXT;')
  // Existing user files must survive both successful and failed deployments.
  const localFiles = ['api/wrangler.toml', 'api/wrangler.prod.toml', 'mcp/wrangler.toml', 'client/.env.production', 'client/.env.local']
  for (const file of localFiles) await writeFile(join(root, file), `private original ${file}\n`)
  const calls = [], logs = [], configs = [], tempDirs = new Set(), sqlFiles = []
  const run = async (command, args, options) => {
    const kind = command === 'git' ? 'git' : args[0]?.endsWith('wrangler.js') ? 'wrangler' : args[0]?.endsWith('/tsc') ? 'tsc' : 'npm'
    const argv = ['git', 'npm'].includes(command) ? args : args.slice(1)
    const call = { kind, argv, options }
    calls.push(call)
    if (argv.includes('--config')) {
      const path = argv[argv.indexOf('--config') + 1]
      tempDirs.add(dirname(path))
      call.config = JSON.parse(await readFile(path, 'utf8'))
      configs.push(call.config)
    }
    if (argv.includes('--secrets-file')) {
      const path = argv[argv.indexOf('--secrets-file') + 1]
      assert.equal((await stat(path)).mode & 0o777, 0o600)
      call.secrets = JSON.parse(await readFile(path, 'utf8'))
    }
    if (fail) await fail(call)
    if (kind === 'git') return branch
    if (kind === 'npm' && argv.includes('build') && argv.includes('client')) {
      await writeFile(join(root, 'client/dist/assets/app.js'), `const api = ${JSON.stringify(options.env.VITE_API_DOMAIN)}`)
      await writeFile(join(root, 'client/dist/_headers'), "/*\n  Content-Security-Policy: connect-src 'self' DEPLOY_API_ORIGIN\n")
    }
    if (kind === 'wrangler' && argv[0] === 'whoami') { assert.ok(argv.includes('--json')); return '{"loggedIn":true}' }
    if (kind === 'wrangler' && argv[0] === 'd1') {
      if (argv.includes('--file')) {
        sqlFiles.push(await readFile(argv[argv.indexOf('--file') + 1], 'utf8'))
        return json([])
      }
      const query = argv[argv.indexOf('--command') + 1]
      if (query.includes('sqlite_master')) return json(applied === null ? [] : [{ name: 'migration_history' }])
      if (query.startsWith('SELECT migration_name')) return json(applied.map(migration_name => ({ migration_name })))
      return json([])
    }
    if (kind === 'wrangler' && argv[0] === 'deploy' && !argv.includes('--dry-run')) return 'Deployed https://test-api.example.workers.dev'
    return ''
  }
  const execute = args => deploy(parseArgs(args), { root, run, ask: async () => answer, log: message => logs.push(message) })
  const mutations = () => calls.filter(({ kind, argv }) => kind === 'wrangler' && (
    (argv[0] === 'deploy' && !argv.includes('--dry-run')) || argv[0] === 'pages' ||
    (argv[0] === 'd1' && (argv.includes('--file') || !argv[argv.indexOf('--command') + 1].startsWith('SELECT')))
  ))
  const assertClean = async () => {
    for (const file of localFiles) assert.equal(await readFile(join(root, file), 'utf8'), `private original ${file}\n`)
    for (const dir of tempDirs) await assert.rejects(access(dir), { code: 'ENOENT' })
    assert.ok(!logs.join('\n').includes(config.API_SECRET || 'unused-secret-sentinel'))
  }
  return { root, calls, logs, configs, sqlFiles, execute, mutations, assertClean }
}

test('CLI rejects ambiguous targets, unknown flags, and npm-consumed flags before doing work', () => {
  assert.equal(parseArgs(['--client']).target, 'client')
  assert.equal(parseArgs(['--mcp']).target, 'mcp')
  assert.throws(() => parseArgs(['--api', '--client']), /one deployment target/)
  assert.throws(() => parseArgs(['client', '--migrations']), /applies only/)
  assert.throws(() => parseArgs(['mcp', '--with-mcp']), /full release/)
  assert.throws(() => parseArgs(['--with-mcp', '--no-mcp']), /only one/)
  assert.throws(() => parseArgs(['--typo']), /Unknown/)
  assert.throws(() => parseArgs([], { npm_config_client: 'true' }), /npm consumed/)
  assert.deepEqual(deploymentPlan(parseArgs(['api'])), { api: true, client: false, mcp: false, migrations: false })
  assert.deepEqual(deploymentPlan(parseArgs([]), true), { api: true, client: true, mcp: true, migrations: true })
})

test('config parsing preserves literal secrets; URLs and D1 output fail closed', () => {
  assert.deepEqual(parseConfig('# comment\nAPI_SECRET=old\r\nAPI_SECRET=$key\\value=#text \r\n'), { API_SECRET: '$key\\value=#text ' })
  assert.equal(apiOrigin('https://api.example.com/'), 'https://api.example.com')
  for (const url of ['http://api.test', 'https://api.test/path', 'https://u:p@api.test', 'https://api.test?x=1']) assert.throws(() => apiOrigin(url), /HTTPS origin/)
  for (const output of ['bad JSON', '[]', '[{"success":false,"results":[]}]', '[{"success":true}]']) assert.throws(() => d1Rows(output))
})

test('client-only needs no database/MCP config and deploys only the client to main', async t => {
  const f = await fixture(t, { config: { PROJECT_NAME: 'test-client', API_URL: 'https://api.finance.test', API_SECRET: fixtureConfig.API_SECRET } })
  await f.execute(['client'])
  assert.equal(f.mutations().length, 1)
  assert.equal(f.mutations()[0].argv[0], 'pages')
  assert.deepEqual(f.mutations()[0].argv.slice(-2), ['--branch', 'main'])
  assert.equal(f.calls.filter(call => call.argv[0] === 'd1').length, 0)
  const build = f.calls.find(call => call.kind === 'npm' && call.argv.includes('build'))
  assert.deepEqual(build.options.env, { VITE_API_DOMAIN: 'api.finance.test', VITE_API_KEY: fixtureConfig.API_SECRET })
  assert.ok((await readFile(join(f.root, 'client/dist/_headers'), 'utf8')).includes('https://api.finance.test'))
  await f.assertClean()
})

for (const target of ['api', 'mcp']) {
  test(`${target}-only checks schema and deploys just its Worker`, async t => {
    const keys = target === 'api' ? ['DATABASE_ID', 'API_SECRET', 'ALLOWED_ORIGINS'] : ['DATABASE_ID', 'MCP_ACCESS_TEAM_DOMAIN', 'MCP_ACCESS_AUD', 'MCP_ALLOWED_EMAIL']
    const f = await fixture(t, { config: Object.fromEntries(keys.map(key => [key, fixtureConfig[key]])) })
    await f.execute([target])
    assert.equal(f.mutations().length, 1)
    assert.equal(f.mutations()[0].config.name, `finance-${target}`)
    assert.ok(!f.calls.some(call => call.kind === 'npm' && call.argv.includes('client')))
    if (target === 'api') assert.deepEqual(f.mutations()[0].secrets, { API_SECRET: fixtureConfig.API_SECRET, ALLOWED_ORIGINS: fixtureConfig.ALLOWED_ORIGINS })
    else {
      assert.equal(f.mutations()[0].config.workers_dev, false)
      assert.equal(f.mutations()[0].config.vars.DISABLE_ACCESS_AUTH, undefined)
    }
    assert.equal(parseConfig(await readFile(join(f.root, '.deploy-config'), 'utf8')).DEPLOY_MCP, undefined)
    await f.assertClean()
  })
  test(`${target}-only refuses pending migrations without making remote changes`, async t => {
    const f = await fixture(t, { applied: ['001-init'] })
    await assert.rejects(f.execute([target]), /Pending migrations: 002-change.sql/)
    assert.equal(f.mutations().length, 0)
    await f.assertClean()
  })
}

test('explicit migrations are applied before a targeted Worker, with history in the same submission', async t => {
  const f = await fixture(t, { applied: ['001-init'] })
  await f.execute(['api', '--migrations'])
  assert.equal(f.sqlFiles.length, 1)
  assert.match(f.sqlFiles[0], /ALTER TABLE example ADD COLUMN value TEXT/)
  assert.match(f.sqlFiles[0], /INSERT INTO migration_history .*'002-change'/)
  assert.deepEqual(f.mutations().map(call => call.argv[0]), ['d1', 'd1', 'deploy'])
  await f.assertClean()
})

test('migration-only deployment initializes an empty database without building or deploying applications', async t => {
  const f = await fixture(t, { config: { DATABASE_ID: fixtureConfig.DATABASE_ID }, applied: null })
  await f.execute(['migrations'])
  assert.equal(f.sqlFiles.length, 2)
  assert.ok(f.mutations().every(call => call.argv[0] === 'd1'))
  assert.ok(!f.calls.some(call => ['npm', 'tsc'].includes(call.kind)))
  await f.assertClean()
})

test('full release preserves MCP preference and completes checks before any remote mutation', async t => {
  const f = await fixture(t, { config: { ...fixtureConfig, DEPLOY_MCP: 'true' }, applied: ['001-init'] })
  await f.execute([])
  const remote = f.mutations()
  assert.deepEqual(remote.map(call => call.argv[0]), ['d1', 'd1', 'deploy', 'deploy', 'pages'])
  assert.deepEqual(remote.filter(call => call.argv[0] === 'deploy').map(call => call.config.name), ['test-api', 'test-mcp'])
  const firstWrite = f.calls.indexOf(remote[0])
  assert.ok(f.calls.slice(firstWrite).every(call => call.kind === 'wrangler'))
  assert.equal(parseConfig(await readFile(join(f.root, '.deploy-config'), 'utf8')).API_URL, fixtureConfig.API_URL)
  await f.assertClean()
})

test('first full release discovers the API URL and rebuilds client with it, skipping MCP when requested', async t => {
  const config = { ...fixtureConfig, DEPLOY_MCP: 'true' }
  delete config.API_URL
  const f = await fixture(t, { config })
  await f.execute(['--no-mcp'])
  const builds = f.calls.filter(call => call.kind === 'npm' && call.argv.includes('build') && call.argv.includes('client'))
  assert.deepEqual(builds.map(call => call.options.env.VITE_API_DOMAIN), ['finance-api.invalid', 'test-api.example.workers.dev'])
  assert.equal(f.mutations().filter(call => call.argv[0] === 'deploy').length, 1)
  const saved = parseConfig(await readFile(join(f.root, '.deploy-config'), 'utf8'))
  assert.equal(saved.API_URL, 'https://test-api.example.workers.dev')
  assert.equal(saved.DEPLOY_MCP, 'false')
  await f.assertClean()
})

for (const stage of ['bundle', 'history', 'migration', 'api-deploy']) {
  test(`failure in ${stage} stops later writes and cleans temporary files`, async t => {
    const f = await fixture(t, { applied: [], fail: call => {
      if ((stage === 'bundle' && call.argv.includes('--dry-run')) ||
          (stage === 'history' && call.argv.includes('SELECT migration_name FROM migration_history')) ||
          (stage === 'migration' && call.argv.includes('--file')) ||
          (stage === 'api-deploy' && call.argv[0] === 'deploy' && !call.argv.includes('--dry-run'))) {
        throw new Error(`Injected ${stage} failure ${fixtureConfig.API_SECRET}`)
      }
    } })
    await assert.rejects(f.execute(['--with-mcp']), error => error.message.includes(`Injected ${stage} failure`) && !error.message.includes(fixtureConfig.API_SECRET))
    assert.ok(!f.mutations().some(call => call.argv[0] === 'pages' || call.config?.name === 'test-mcp'))
    if (['bundle', 'history'].includes(stage)) assert.equal(f.mutations().length, 0)
    await f.assertClean()
  })
}

test('branch cancellation and --plan perform no writes; plan does not execute commands or save flags', async t => {
  const f = await fixture(t, { branch: 'feature/test', answer: 'n' })
  const original = await readFile(join(f.root, '.deploy-config'), 'utf8')
  await assert.rejects(f.execute(['api']), /cancelled/)
  assert.equal(f.calls.length, 1)
  await f.execute(['--with-mcp', '--plan'])
  assert.equal(f.calls.length, 1)
  assert.equal(await readFile(join(f.root, '.deploy-config'), 'utf8'), original)
})

test('npm target aliases and argument forwarding cannot silently expand to a full deploy', async t => {
  const root = await mkdtemp(join(tmpdir(), 'finance-npm-deploy-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const actual = JSON.parse(await readFile(resolve(dirname(script), '../package.json'), 'utf8'))
  await mkdir(join(root, 'scripts'))
  await writeFile(join(root, 'scripts/deploy.mjs'), await readFile(script))
  await writeFile(join(root, 'package.json'), JSON.stringify({ private: true, scripts: actual.scripts }))
  for (const args of [
    ['run', 'deploy:client', '--', '--plan'], ['run', 'deploy', '--', '--client', '--plan'],
    ['run', 'deploy:api', '--', '--plan'], ['run', 'deploy:mcp', '--', '--plan'], ['run', 'deploy:migrations', '--', '--plan'],
  ]) {
    const result = spawnSync('npm', args, { cwd: root, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    const scope = result.stdout.split('\n').find(line => line.startsWith('Deployment scope:'))
    assert.ok(scope && !scope.includes(','), result.stdout)
  }
  // Even if npm accepts the malformed invocation, our CLI must reject it.
  const consumed = spawnSync('npm', ['run', 'deploy', '--client', '--', '--plan'], { cwd: root, encoding: 'utf8' })
  assert.notEqual(consumed.status, 0)
  assert.ok(!consumed.stdout.includes('Deployment scope:'))
})

test('generated Worker configs bundle the real API and MCP with Wrangler dry-run', async t => {
  const repository = resolve(dirname(script), '..')
  const f = await fixture(t, { fail: async call => {
    if (call.kind === 'wrangler' && call.argv.includes('--dry-run')) {
      await runCommand(process.execPath, [join(repository, 'node_modules/wrangler/bin/wrangler.js'), ...call.argv], {
        cwd: f.root, env: { WRANGLER_SEND_METRICS: 'false' },
      })
    }
  } })
  for (const workspace of ['api', 'mcp']) {
    for (const entry of ['src', 'tsconfig.json']) await symlink(join(repository, workspace, entry), join(f.root, workspace, entry))
  }
  await symlink(join(repository, 'node_modules'), join(f.root, 'node_modules'))
  await writeFile(join(f.root, 'package.json'), await readFile(join(repository, 'package.json')))
  await f.execute(['api'])
  await f.execute(['mcp'])
  await f.assertClean()
})
