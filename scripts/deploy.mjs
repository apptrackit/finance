import { spawn } from 'node:child_process'
import { chmod, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const targets = ['all', 'client', 'api', 'mcp', 'migrations']
export const help = `Usage: npm run deploy -- [all|client|api|mcp|migrations] [options]

  npm run deploy                 Full release: migrations, API, optional MCP, client
  npm run deploy:client          Client only
  npm run deploy:api             API only; requires an up-to-date database
  npm run deploy:mcp             MCP only; requires an up-to-date database
  npm run deploy:migrations      Pending database migrations only

Options:
  --migrations     Apply pending migrations with an API/MCP-only deployment
  --with-mcp       Include MCP in a full release and save that preference
  --no-mcp         Skip MCP in a full release and save that preference
  --plan           Print the scope without commands, prompts, or file changes
  --yes            Confirm deployment from a non-main branch (production)
  --help           Show this help

--client, --api and --mcp are aliases for their respective targets.
Use npm run deploy:client or npm run deploy -- --client, not npm run deploy --client.
Configuration is read from the repository's gitignored .deploy-config.
`

export function parseArgs(args, env = {}) {
  for (const flag of ['client', 'api', 'mcp', 'migrations', 'with_mcp', 'no_mcp', 'plan']) {
    if (env[`npm_config_${flag}`] !== undefined) {
      throw new Error(`npm consumed a deployment flag. Use npm run deploy -- --${flag.replaceAll('_', '-')} or a deploy:<target> command.`)
    }
  }
  const options = { target: 'all', migrations: false, mcp: undefined, plan: false, yes: false, help: false }
  let selected = false
  for (const arg of args) {
    const target = ['--client', '--api', '--mcp'].includes(arg) ? arg.slice(2) : arg
    if (targets.includes(target)) {
      if (selected) throw new Error('Choose one deployment target; use all for a full release.')
      options.target = target
      selected = true
    } else if (arg === '--migrations') options.migrations = true
    else if (arg === '--plan') options.plan = true
    else if (arg === '--yes') options.yes = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--with-mcp' || arg === '--no-mcp') {
      if (options.mcp !== undefined) throw new Error('Choose only one of --with-mcp and --no-mcp.')
      options.mcp = arg === '--with-mcp'
    } else throw new Error(`Unknown deployment argument: ${arg}. Run npm run deploy -- --help.`)
  }
  if (options.target !== 'all' && options.mcp !== undefined) throw new Error('--with-mcp/--no-mcp apply only to a full release.')
  if (options.migrations && !['all', 'api', 'mcp'].includes(options.target)) throw new Error('--migrations applies only to an API, MCP, or full deployment.')
  return options
}

export function parseConfig(text) {
  const config = {}
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)
    if (match) config[match[1]] = match[2]
  }
  return config
}

async function optionalFile(path) {
  try { return await readFile(path, 'utf8') }
  catch (error) { if (error.code === 'ENOENT') return ''; throw error }
}

async function saveConfig(path, config) {
  const original = await optionalFile(path)
  const written = new Set()
  const lines = (original ? original.split(/\r?\n/) : []).filter(line => {
    const key = line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1]
    if (!key || !(key in config)) return true
    if (written.has(key)) return false
    written.add(key)
    return true
  }).map(line => {
    const key = line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1]
    return key && key in config ? `${key}=${config[key]}` : line
  })
  for (const [key, value] of Object.entries(config)) if (!written.has(key)) lines.push(`${key}=${value}`)
  while (lines.at(-1) === '') lines.pop()
  const updated = `${lines.join('\n')}\n`
  if (updated === original) return
  const temporary = `${path}.${process.pid}.tmp`
  try {
    await writeFile(temporary, updated, { mode: 0o600, flag: 'wx' })
    await rename(temporary, path)
    await chmod(path, 0o600)
  } finally { await rm(temporary, { force: true }) }
}

function preference(value) {
  if (value === undefined || value === '') return undefined
  if (['true', 'yes', 'y', '1'].includes(value)) return true
  if (['false', 'no', 'n', '0'].includes(value)) return false
  throw new Error('DEPLOY_MCP must be true or false in .deploy-config.')
}

export function deploymentPlan(options, deployMcp = false) {
  return {
    api: ['all', 'api'].includes(options.target),
    client: ['all', 'client'].includes(options.target),
    mcp: options.target === 'mcp' || (options.target === 'all' && deployMcp),
    migrations: ['all', 'migrations'].includes(options.target) || options.migrations,
  }
}

export function apiOrigin(value) {
  let url
  try { url = new URL(value) } catch { throw new Error('API_URL must be a valid HTTPS origin.') }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('API_URL must be an HTTPS origin without credentials, a path, query, or fragment.')
  }
  return url.origin
}

export function d1Rows(output) {
  let result
  try { result = JSON.parse(output) } catch { throw new Error('D1 returned invalid JSON; refusing to assume migrations are pending.') }
  if (!Array.isArray(result) || result.length === 0 || result.some(item => item.success !== true || !Array.isArray(item.results))) {
    throw new Error('D1 query failed or returned an unexpected result; deployment stopped.')
  }
  return result.flatMap(item => item.results)
}

async function prompt(label, { secret = false, signal } = {}) {
  if (!process.stdin.isTTY) throw new Error(`${label} is required. Set it in .deploy-config before running non-interactively.`)
  const output = secret ? new Writable({ write(_chunk, _encoding, done) { done() } }) : process.stdout
  const readline = createInterface({ input: process.stdin, output, terminal: true })
  if (secret) process.stdout.write(`${label}: `)
  try { return await readline.question(secret ? '' : `${label}: `, { signal }) }
  finally { readline.close(); if (secret) process.stdout.write('\n') }
}

export function runCommand(command, args, { cwd, env, signal } = {}) {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, signal, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolveCommand(stdout)
      else reject(new Error(`${command} exited with ${code ?? 'a signal'}\n${stdout}${stderr}`))
    })
  })
}

export function createDeploymentReporter(log, { color = false } = {}) {
  const paint = (code, value) => color ? `\u001b[${code}m${value}\u001b[0m` : value
  const rule = paint('2', '─'.repeat(46))
  return {
    title() {
      log('')
      log(paint('1;36', 'Finance deployment'))
      log(rule)
    },
    detail(label, value) { log(`  ${label.padEnd(12)} ${value}`) },
    section(name) {
      log('')
      log(paint('1;36', name))
      log(rule)
    },
    start(label) { log(`  ${paint('36', '→')} ${label}…`) },
    success(label, elapsed) {
      const duration = elapsed === undefined ? '' : paint('2', ` (${(elapsed / 1000).toFixed(1)}s)`)
      log(`  ${paint('32', '✓')} ${label}${duration}`)
    },
    failure(label) { log(`  ${paint('31', '✗')} ${label} failed`) },
    note(message) { log(`  ${message}`) },
    finish() {
      log('')
      log(rule)
      log(paint('1;32', '✓ Deployment complete'))
    },
  }
}

// All subprocesses go through run, so scope/failure tests never invoke Cloudflare.
export async function deploy(options, { root = repositoryRoot, run = runCommand, ask = prompt, log = console.log, signal } = {}) {
  const configPath = join(root, '.deploy-config')
  const config = parseConfig(await optionalFile(configPath))
  const report = createDeploymentReporter(log, {
    color: log === console.log && Boolean(process.stdout.isTTY && process.env.NO_COLOR === undefined && process.env.TERM !== 'dumb'),
  })
  let temporary
  const redact = text => config.API_SECRET ? String(text).replaceAll(config.API_SECRET, '[redacted]') : String(text)
  const command = async (label, executable, args, extra = {}) => {
    report.start(label)
    const started = Date.now()
    try {
      const result = await run(executable, args, { cwd: root, signal, ...extra })
      report.success(label, Date.now() - started)
      return result
    } catch (error) {
      report.failure(label)
      throw new Error(`${label} failed.\n${redact(error.message)}`)
    }
  }
  const wrangler = (label, args) => command(label, process.execPath, [join(root, 'node_modules/wrangler/bin/wrangler.js'), ...args])
  const npm = (label, args, extra) => process.env.npm_execpath
    ? command(label, process.execPath, [process.env.npm_execpath, ...args], extra)
    : command(label, 'npm', args, extra)
  const need = async (key, fallback, secret = false) => {
    config[key] ||= fallback || await ask(key, { secret, signal })
    if (!config[key] || /[\r\n]/.test(config[key])) throw new Error(`${key} must be a nonempty, single-line value.`)
    return config[key]
  }

  try {
    // A plan never prompts, saves preferences, builds, or contacts Cloudflare.
    let deployMcp = options.target === 'all' ? options.mcp ?? preference(config.DEPLOY_MCP) : false
    if (!options.plan && options.target === 'all' && deployMcp === undefined) {
      deployMcp = /^y(es)?$/i.test(await ask('Include MCP in full deployments? (y/N)', { signal }))
    }
    const plan = deploymentPlan(options, deployMcp)
    const selectedTargets = [['migrations', 'Migrations'], ['api', 'API'], ['mcp', 'MCP'], ['client', 'Client']]
      .filter(([name]) => plan[name]).map(([, label]) => label).join(' · ')
    report.title()
    report.detail('Scope', selectedTargets)
    if (plan.api || plan.mcp || plan.migrations) report.detail('Database', plan.migrations ? 'Apply pending migrations' : 'Verify migration history only')
    if (plan.client) report.detail('Pages', 'main (production)')
    if (options.plan) {
      if (options.target === 'all' && deployMcp === undefined) report.note('MCP preference is unset; the first full deploy will ask whether to include it.')
      report.note('Plan only: no checks or deployments run.')
      return plan
    }

    report.section('Local checks')
    const branch = (await command('Checking branch', 'git', ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
    if (branch !== 'main' && !options.yes && !/^y(es)?$/i.test(await ask(`Deploy branch ${branch} to production? (y/N)`, { signal }))) {
      throw new Error('Deployment cancelled.')
    }
    if (options.target === 'all') config.DEPLOY_MCP = String(Boolean(deployMcp))
    if (plan.api || plan.mcp || plan.migrations) {
      await need('DATABASE_ID')
      await need('DATABASE_NAME', 'finance-db')
    }
    if (plan.api) {
      await need('API_WORKER_NAME', 'finance-api')
      await need('API_SECRET', undefined, true)
      await need('ALLOWED_ORIGINS')
    }
    if (plan.client) {
      await need('PROJECT_NAME')
      await need('API_SECRET', undefined, true)
      if (!plan.api) await need('API_URL')
    }
    if (plan.mcp) {
      const legacy = await optionalFile(join(root, 'mcp/wrangler.toml'))
      const legacyValue = key => legacy.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"\\r\\n]*)"`, 'm'))?.[1]
      await need('MCP_WORKER_NAME', legacyValue('name') || 'finance-mcp')
      await need('MCP_ACCESS_TEAM_DOMAIN', legacyValue('CF_ACCESS_TEAM_DOMAIN'))
      await need('MCP_ACCESS_AUD', legacyValue('CF_ACCESS_AUD'))
      await need('MCP_ALLOWED_EMAIL', legacyValue('ALLOWED_EMAIL'))
      const team = config.MCP_ACCESS_TEAM_DOMAIN
      config.MCP_ACCESS_TEAM_DOMAIN = apiOrigin(team.includes('://') ? team : `https://${team}`)
    }
    if (config.API_URL && (plan.api || plan.client)) config.API_URL = apiOrigin(config.API_URL)
    await saveConfig(configPath, config)

    temporary = await mkdtemp(join(tmpdir(), 'finance-deploy-'))
    const writeJson = async (name, value) => {
      const file = join(temporary, name)
      await writeFile(file, JSON.stringify(value, null, 2), { mode: 0o600 })
      return file
    }
    const database = { binding: 'DB', database_name: config.DATABASE_NAME, database_id: config.DATABASE_ID }
    const apiConfig = (plan.api || plan.mcp || plan.migrations) ? await writeJson('api.json', {
      name: config.API_WORKER_NAME || 'finance-api', main: join(root, 'api/src/index.ts'),
      compatibility_date: '2024-09-23', compatibility_flags: ['nodejs_compat'],
      define: { __dirname: "'/'" }, workers_dev: true,
      d1_databases: [database], triggers: { crons: ['0 0 * * *'] },
    }) : undefined
    const mcpConfig = plan.mcp ? await writeJson('mcp.json', {
      name: config.MCP_WORKER_NAME, main: join(root, 'mcp/src/index.ts'),
      compatibility_date: '2026-07-01', workers_dev: false,
      d1_databases: [database],
      vars: { CF_ACCESS_TEAM_DOMAIN: config.MCP_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD: config.MCP_ACCESS_AUD, ALLOWED_EMAIL: config.MCP_ALLOWED_EMAIL },
    }) : undefined

    const buildClient = async origin => {
      await npm('Client build', ['run', 'build', '-w', 'client'], { env: { VITE_API_DOMAIN: new URL(origin).host, VITE_API_KEY: config.API_SECRET } })
      const assets = join(root, 'client/dist/assets')
      const bundled = await Promise.all((await readdir(assets)).filter(file => file.endsWith('.js')).map(file => readFile(join(assets, file), 'utf8')))
      if (!bundled.some(contents => contents.includes(new URL(origin).host))) throw new Error('API domain was not included in the client build.')
      const headerPath = join(root, 'client/dist/_headers')
      const headers = await readFile(headerPath, 'utf8')
      if (!headers.includes('DEPLOY_API_ORIGIN')) throw new Error('Client build is missing its CSP origin placeholder.')
      await writeFile(headerPath, headers.replaceAll('DEPLOY_API_ORIGIN', origin))
    }

    // Complete selected local checks before the first remote mutation.
    for (const workspace of ['api', 'mcp', 'client'].filter(name => plan[name])) {
      await npm(`${workspace.toUpperCase()} tests`, ['test', '-w', workspace])
    }
    if (plan.api) await command('API typecheck', process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '-p', join(root, 'api/tsconfig.json')])
    if (plan.mcp) await npm('MCP typecheck', ['run', 'build:mcp'])
    for (const [name, file] of [['api', plan.api && apiConfig], ['mcp', mcpConfig]]) {
      if (file) await wrangler(`${name.toUpperCase()} bundle check`, ['deploy', '--dry-run', '--minify', '--no-autoconfig', '--config', file, '--tsconfig', join(root, name, 'tsconfig.json'), '--outdir', join(temporary, `${name}-bundle`)])
    }
    const buildOrigin = config.API_URL || 'https://finance-api.invalid'
    if (plan.client) await buildClient(buildOrigin)
    report.section(plan.api || plan.mcp || plan.migrations ? 'Cloudflare and database' : 'Cloudflare checks')
    await wrangler('Checking Cloudflare authentication', ['whoami', '--json'])

    if (plan.api || plan.mcp || plan.migrations) {
      const d1 = async (label, args) => d1Rows(await wrangler(label, ['d1', 'execute', 'DB', '--remote', '--yes', '--json', '--config', apiConfig, ...args]))
      const migrations = (await readdir(join(root, 'api/migrations'))).filter(file => file.endsWith('.sql')).sort()
      if (migrations.some(file => !/^\d{3}-[a-z0-9-]+\.sql$/.test(file))) throw new Error('Migration filenames must use NNN-description.sql.')
      const tables = await d1('Checking migration history', ['--command', "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'migration_history'"])
      const history = tables.length ? await d1('Reading applied migrations', ['--command', 'SELECT migration_name FROM migration_history']) : []
      if (history.some(row => typeof row.migration_name !== 'string')) throw new Error('Invalid migration history; deployment stopped.')
      const applied = new Set(history.map(row => row.migration_name))
      const pending = migrations.filter(file => !applied.has(file.slice(0, -4)))
      if (pending.length && !plan.migrations) {
        throw new Error(`Pending migrations: ${pending.join(', ')}. Run npm run deploy:migrations or add -- --migrations to deploy:${options.target}.`)
      }
      if (plan.migrations && pending.length) {
        await d1('Initializing migration history', ['--command', 'CREATE TABLE IF NOT EXISTS migration_history (id TEXT PRIMARY KEY, migration_name TEXT NOT NULL UNIQUE, executed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'])
        for (const file of pending) {
          const name = file.slice(0, -4)
          const sql = await readFile(join(root, 'api/migrations', file), 'utf8')
          const migrationFile = join(temporary, file)
          // Record success in the same SQL submission, rather than ignoring a
          // separate history-write failure and replaying ALTERs on the next run.
          await writeFile(migrationFile, `${sql}\n;\nINSERT INTO migration_history (id, migration_name) VALUES ('${name}', '${name}');\n`, { mode: 0o600 })
          await d1(`Applying ${name}`, ['--file', migrationFile])
        }
      } else report.success('Migrations up to date')
    }

    if (plan.api || plan.mcp || plan.client) report.section('Deployment')
    if (plan.api) {
      const secrets = await writeJson('api-secrets.json', { API_SECRET: config.API_SECRET, ALLOWED_ORIGINS: config.ALLOWED_ORIGINS })
      const result = await wrangler('Deploying API', ['deploy', '--minify', '--no-autoconfig', '--config', apiConfig, '--tsconfig', join(root, 'api/tsconfig.json'), '--secrets-file', secrets])
      if (!config.API_URL) {
        const reported = result.match(/https:\/\/[a-z0-9.-]+\.workers\.dev\b/i)?.[0]
        if (reported) config.API_URL = apiOrigin(reported)
        else if (plan.client) throw new Error('API deployed, but its URL could not be determined. Set API_URL in .deploy-config, then run npm run deploy:client.')
      }
      await saveConfig(configPath, config)
    }
    if (plan.mcp) await wrangler('Deploying MCP', ['deploy', '--minify', '--no-autoconfig', '--config', mcpConfig, '--tsconfig', join(root, 'mcp/tsconfig.json')])
    if (plan.client) {
      // On the first full release, Wrangler supplies the URL after API creation.
      if (config.API_URL !== buildOrigin) await buildClient(config.API_URL)
      await wrangler('Deploying client', ['pages', 'deploy', join(root, 'client/dist'), '--project-name', config.PROJECT_NAME, '--branch', 'main'])
    }
    report.finish()
    return plan
  } catch (error) {
    throw new Error(redact(error.message))
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true })
  }
}

async function main() {
  const controller = new AbortController()
  const interrupt = () => controller.abort()
  process.once('SIGINT', interrupt)
  process.once('SIGTERM', interrupt)
  try {
    const options = parseArgs(process.argv.slice(2), process.env)
    if (options.help) console.log(help)
    else await deploy(options, { signal: controller.signal })
  } catch (error) {
    console.error(controller.signal.aborted ? 'Deployment interrupted.' : error.message)
    process.exitCode = controller.signal.aborted ? 130 : 1
  } finally {
    process.removeListener('SIGINT', interrupt)
    process.removeListener('SIGTERM', interrupt)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
