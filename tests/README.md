# Testing and CI

Use the Node 22 LTS version in `.node-version` and install from the repository root with `npm ci`.

```bash
npm test                       # workspace, deployment, and Worker/D1 tests
npm test --workspaces           # fast unit/component suites only
npm run test:integration        # compiled Workers and disposable shared D1
npm run test:deploy             # deployment scope/failure cases and local bundles
npm run typecheck              # API, client, MCP, and integration harness
npm run lint -w client -- --max-warnings=0
VITE_API_KEY=ci-placeholder VITE_API_DOMAIN=localhost:8787 npm run build

# Run one integration scenario while developing
npm run test:integration -- -t 'rolls back'
```

## What CI protects

| Check | Main purpose |
| --- | --- |
| API, client, and MCP unit/component tests | Fast business-rule, validation, calculation, and UI regressions |
| Client tests (Node 26) | Catch client test/runtime issues that appear with the local Node 26 runtime but not the pinned Node 22 |
| API/MCP TypeScript checks and client production build | Contract/type errors, bundling, and PWA generation |
| Client lint | Errors and warnings under the project's enabled rules |
| Worker/D1 integration | Real entry points, HTTP/RPC routing, authentication, SQL, triggers, and cross-workspace behavior |
| Deployment tests | Target isolation, npm argument forwarding, pending migrations, cleanup, failures, and generated Worker bundles |
| Workflow validation | Invalid Actions syntax, expressions, and shell commands |
| CI passed | One stable check that requires every preceding job to succeed |

The workflow runs on pull requests and pushes to `main`, merge queues, and manual dispatch. It cancels superseded runs, uses timeouts and read-only repository permissions, pins Actions to commits, and uploads JUnit reports for seven days. Failed integration tests print the harness's Worker logs. Reports use synthetic fixtures only.

Require **CI passed** in GitHub branch protection or a ruleset to make these checks block merging. Adding the workflow does not itself change repository protection settings. The original four check names are retained for existing rules.

## Integration design

[`integration/harness.ts`](integration/harness.ts) uses Cloudflare's [Wrangler test harness](https://developers.cloudflare.com/workers/testing/test-harness/get-started/) to build and run the real API and MCP entry points in `workerd`. Both bind to one local D1 database, as they do in production. Each test gets fresh storage. Inline configs use synthetic values, and the harness never invokes deployment scripts or the development database reset script.

The MCP authentication bypass is **not enabled**: tests sign real RSA JWTs and intercept the public-key request. They exercise valid tokens, invalid claims and tampered signatures. FX responses are deterministic; any unexpected Worker network request fails the test, even if application code catches it.

Migrations run in order using Wrangler's SQL parser so trigger bodies remain intact. The helper mirrors the repository's filename-based `migration_history` convention, including names without `.sql`. Tests cover both an empty database and populated legacy data upgraded through the preceding schema to the latest one. Deployment orchestration is tested separately in `scripts/deploy.test.mjs`: all remote commands use a fake runner, while Wrangler dry-run checks compile both generated Worker configurations. Those tests never deploy or query a real database.

The financial scenarios assert both API responses and persisted balances/rows. They cover:

- Future dates and the browser calendar, duplicate confirmations, and rollback after an injected SQL failure.
- MCP proposal creation/retries, atomic batch and audit writes, review isolation from projections, edits and confirmation provenance.
- Account locks, decline behavior, cash-transfer edits/deletion, and fractional investment purchases deleted through the cash transaction endpoint.
- Recurring transactions/transfers skipped while locked, then processed once after unlocking.
- FX conversion with explicit warnings and exclusion of unavailable currencies.
- Data preservation during upgrades, budget retirement, immutable forecast records and financial revision triggers.

## Adding a regression

Choose a unit test for a pure calculation or validation rule. Choose integration when correctness depends on SQL, migrations, multiple writes, bindings, authentication, or API/MCP agreement. Reproduce the failure before fixing it; assert the resulting financial state, including what must remain unchanged on failure. Avoid tests that reimplement the production SQL in a mock.

Keep fixtures synthetic, external calls intercepted, and assertions independent of test order. Add a populated upgrade fixture when introducing a migration. Keep harness runtime flags and compatibility dates aligned with `api/wrangler.toml.example` and `mcp/wrangler.toml.example`. Do not regenerate baselines or disable checks merely to obtain a green run.

## Boundaries

These are local runtime tests, not proof of deployed Cloudflare Access/OAuth configuration, real market-data availability, every concurrent financial operation, or browser/PWA behavior. Client tests use jsdom; desktop/mobile visual and interaction checks still matter. The next useful additions are focused browser tests for failed saves/review confirmation and broader failure-injection coverage of other multi-write operations. Coverage percentages alone are not a quality target.

`npm run test:staging -w mcp` remains a separate, explicit operation: it writes a real review draft to a configured staging database and is not part of CI.

Node 22 LTS is pinned because the current Miniflare transport can encounter the upstream [Undici `setTypeOfService EINVAL` socket bug](https://github.com/nodejs/undici/issues/5544) on macOS with newer Node runtimes. Node 22 does not expose the affected socket API. Keep Worker/D1 integration and the primary CI jobs on `.node-version` until the transport dependency includes the fix. The additional Node 26 client job covers the local runtime used by some contributors without running Miniflare. Vitest must continue failing on unhandled errors; do not suppress them to make a run pass.
