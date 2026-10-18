# Investment rework: integrated validation and rollout

This is the #135 checkpoint for epic #123. Feature children #122 and #126–#134 are integrated into `epic/123-investment-rework`. This child targets that epic too. Review and merge this checkpoint before preparing the final epic-to-main PR. Main, remote migrations and production deployment remain separate user-authorized steps.

## Acceptance and evidence map

| Requirement | Implementation / evidence |
| --- | --- |
| Preserve cash ↔ holding and both ledgers | `InvestmentTradeService`, exact settlement fields, reciprocal pair edits/deletion and versioned receipts; `investment-trades`, `investment-detail`, `investment-transfer-links` integration suites |
| Preserve quantities, legacy unknowns and fractional units | Additive migrations 017–020; holding metadata, manual valuation and trade migration suites; no guessed USD, fees, historical cost or backdated opening purchase |
| Current native/reporting values and cost/gain definitions | Shared metrics engine and independent API/MCP read adapter; reviewed accounting fixture examples, metric/overview integration and complete/partial FX tests |
| Combined historical values and estimated returns | Dated units × raw prices × dated FX, manual steps, archived ownership, explicit gaps and geometric daily factors; history engine/service/Worker suites |
| Overview, allocation, filters and holding details | Page-owned snapshots, bounded trends/detail histories, direct-cash editor, responsive UI and common privacy/theme controls; client component/navigation tests and browser review |
| Protected accounts, pending work, exports, source revision | Existing lock/archive/MCP review suites plus new mixed-writer, stale pending confirmation/decline and every-trade-field revision checks |
| Fresh schema, upgrade, failures and private export | `investment-epic-migrations.test.ts`, preceding-schema suites, and `scripts/rehearse-investment-upgrade.mjs`; sanitized rehearsal summary below |
| Bounded requests and computation | Real Worker/D1 50-holding fixture, shared source cache checks, existing history/source work limits; no per-date provider waterfall |

Production investment components and shared calculators contain no generated fixture prices, fixed conversion rates or mock save paths. Synthetic fixtures are confined to tests and temporary local browser setup. The version 1 accounting document retains its explicitly dated pre-implementation audit; current behavior is described in the holding/trade/manual/source/metrics/history/overview/detail documents.

## Defects found and repaired in this audit

1. **Mixed cash writers could lose a committed trade.** The old cash paths read a balance, wrote ledger rows separately and later assigned that old balance plus their own delta. A trade between those steps could be overwritten; later SQL failures could leave a partial ledger. `CashLedgerRepository` now commits ordinary creation/edit/deletion, cash-transfer pairs, account corrections and recurring occurrence consumption atomically with audit. Decimal balance plans claim account balance/timestamp snapshots and retry changed balances while keeping original row/schedule snapshots pinned; active/unlocked account identity checks protect edits/deletions. Cash corrections additionally require an unchanged source revision, and the browser pins its original saved balance/version through refresh. Direct overwrite remains an explicit non-ledger correction; split adjustments must sum to the requested difference and cannot post future rows.
2. **Pending races could post a stale amount or cancel a posted row.** Ordinary confirmation now claims the saved account/amount/date/version and rechecks account protection inside the batch; its audit is part of the same batch. Decline claims the pending row through the cash batch. Repeated confirmation remains idempotent and uses the client calendar. Concurrent edits/confirmation/decline cannot silently leave balance and status inconsistent.
3. **An old opening could imply verified cost beyond the event window.** Current value remains independently readable, but nonzero remaining basis/average cost and gains are withheld when corporate-action coverage does not reach the position boundary. API and independent MCP share this rule; historical replay likewise refuses to treat matching current units as proof of earlier raw units. An empty position still has independently known zero remaining basis.
4. **Default history repeated otherwise reusable provider requests.** The quote fetch now warms 40 days, covering a clamped month, its opening close and carry margin. Recent-opening overview/history/MCP reads reuse that window. Older boundaries and wider ranges still expand it deliberately.
5. **Execution markers could hide the daily price curve.** Recharts prioritizes item-level data for mixed series. The daily Area now supplies its own points alongside Scatter data; empty buy/sell series are omitted so they cannot fall back to daily prices and invent markers. Tests use the real chart/axes/selectors with only physical container sizing replaced for jsdom. Browser verification confirms both daily prices and executions remain in view.

These fixes add no migration, durable table, dependency or MCP write capability. Existing investment and MCP review writers retain their guarded batches. The unused legacy clone helper is not scheduled or routed; the real cron uses `RecurringScheduleService`.

The follow-up #148 fixes binary arithmetic residue in those active writers, including pending confirmation and investment cash. [Decimal balance rules](decimal-balances.md) describe exact recorded-decimal addition, bounded retries and conservative audited recovery. Both supplied schema-016 exports were rehearsed again through fresh creation, upgrade/failure rollback, cash/holding round trips, all four investment categories, recurring execution and independent MCP reads. Supported legacy residue required no manual balance correction; old ledger facts and anchors remained unchanged. Genuine fractional openings and unsupported unit precision retain their separate checks.

## Database rehearsal

The October 12 SQL export was the newest supplied-folder backup available during this audit. It is schema **016-account-archive**, not evidence for later production activity. All work used disposable local D1 storage with inline synthetic Worker configuration; no production binding, private Wrangler file or deployment configuration was loaded.

- Fresh creation applied every file 001–021 and passed integrity/foreign-key checks.
- The export upgrade applied 017–021 in filename order, with each history marker submitted with its migration. After **each** migration all pre-existing columns and row IDs across 15 application tables matched their original hashes, including cash balances, investment quantities, audits, schedules, existing links and financial source revision. Prior migration-history rows were preserved.
- After upgrade, full exports, overview/metrics, six history ranges and deliberately stale legacy-pair deletions retained the new financial baseline. Unknown cost, execution currency and lifetime cash stayed unknown. Provider requests were intercepted; zero outbound network requests occurred in the export rehearsal. The original SQL hash was unchanged and the private copy was removed.
- Synthetic late-failure tests inject a failure in each migration's final history insertion and verify rollback of DDL, rows, revision, triggers and marker in the real local D1 batch. Each migration then applies successfully. This is local D1 evidence, not an assertion that an interrupted remote import has already been recovered.

Intentional additive changes are limited to:

| Migration | Intentional additions/backfills |
| --- | --- |
| 017 | Reverse links for uniquely verified reciprocal posted cash/trade pairs; ambiguous links remain unfilled |
| 018 | Explicit category/pricing/unit/provider metadata and current observed position anchors; unknown historical cost/date stays unknown |
| 019 | Stable legacy row order, version zero and sequence baseline; execution/fee/settlement facts remain nullable and unverified |
| 020 | Dated current manual total/per-unit baseline observations, ownership/event fields; appraisal creates no cash movement |
| 021 | Empty reconstructible provider cache, explicitly excluded from financial JSON export |

Rerun against a fresh schema-016 SQL backup before a production rollout:

```bash
node scripts/rehearse-investment-upgrade.mjs \
  --export /absolute/path/to/backup.sql \
  --report /absolute/path/to/sanitized-report.json
```

Use pinned Node 22 and installed root dependencies. The report contains check outcomes and a source hash, never source rows, identifiers or amounts. The helper removes only its newly created private temporary directory, suppresses database exception details that could contain source SQL, and changes no remote resource. JSON exports remain a bounded data download; the app does not implement JSON restore.

## Loading and performance evidence

The real Worker/D1 fixture contains 50 holdings sharing 10 symbols with recent supported boundaries. Cold overview, monthly history and independent MCP reads together issued **10 Yahoo requests**, at most **4 concurrently**. Subsequent warm overview/MCP reads issued no additional Yahoo requests. The local measured read sequence took about **0.1 seconds** with deterministic intercepted provider responses, excluding seeding and Worker startup. This is a request-budget regression, not a promise about live-provider latency. Current FX calls are measured separately from instrument requests.

The earlier 75,000-position pure-history benchmark and current bounds remain: 100 holdings / 10,000 trades, 75,000 daily holding positions, 150,000 source days, ten-year market horizon, four provider requests at a time, bounded queues/deadlines, 600 default chart points (maximum 1,200), 12 session-memory history/detail entries. Exceeding work limits returns a recoverable error; it never publishes a truncated ledger or fabricated return. Long-standing holdings may need a newer reconciled position boundary for covered history/cost; missing corporate actions never become an assumed no-event history.

## Original #135 verification checkpoint

Local full checks: **435 client tests**, **191 API tests**, **51 MCP tests**, **237 Worker/D1 tests** with two existing skips, **26 deployment tests**, workspace/integration typechecks, client lint and production build. The exact-commit CI outcome is recorded in the MR. The existing client bundle-size warning remains.

Browser review uses disposable synthetic accounts with the real API Worker and D1. Instrument/daily-FX responses are synthetic; public current FX is used consistently with the existing browser cash layer. No personal export records enter the browser, fixture code or screenshots. Desktop (1440/1013 px) and mobile (390 px) layouts, dark/light themes, privacy, linked fractional buy/partial sale/edit/delete, failed appraisal retry and stale-refresh recovery were checked. Browser outcomes and screenshots are captured in the Codex verification artifact; accounting correctness is asserted separately by the Worker/D1 suites above.

The #148 follow-up adds decimal arithmetic and real Worker/D1 regression suites. Its MR records current full-suite and exact-head CI results separately from this original checkpoint. This backend change does not alter the reviewed UI flows or add a migration.

## Release order and recovery

1. Merge this validation child into the epic after user verification. Prepare the final `epic/123-investment-rework` → `main` PR with this evidence and rollout notes; rerun exact-head CI. Do not merge it or publish a release without the user's explicit approval. This checkpoint does not change the package version or published release history.
2. Before any approved production action, retain a **fresh SQL backup** and rehearse it locally. Arrange a write-free maintenance window covering browser/API/MCP clients and scheduled execution. There is no repository maintenance-mode switch; do not assume opening a new client tab pauses the old writer or cron.
3. Review the read-only deployment plan. The deployment CLI applies pending filenames **017 → 018 → 019 → 020 → 021**, verifies each history marker, then deploys **API → MCP → client** when all are selected. Keep both Workers on the same migrated D1 schema. API/MCP-only deployment refuses pending migrations; do not bypass that check. The final approved full rollout can use the documented root `npm run deploy -- --with-mcp` workflow; planning is `npm run deploy -- --plan --with-mcp`.
4. Verify posted/pending balances and reciprocal links, current/unknown legacy coverage, a controlled read refresh, manual as-of dates, exports and source-revision freshness. Existing holdings do not need to be recreated. Stock/ETF classification can be corrected explicitly; unknown old execution/cash/cost is not inferred. Manual history starts at its observed baseline unless the user supplies earlier observations.
5. On a failed migration or inconsistent post-release check, stop financial writes and preserve the current database before remediation. Inspect the custom `migration_history` and actual schema; never replay an unrecorded `ALTER TABLE` blindly or edit applied SQL files. A newer binary may rely on additive tables/guards, so rolling only the client/Worker back to an older writer is not a proven database rollback. Rehearse recovery on a copy; a full SQL restore would discard any post-backup activity and needs a separate explicit decision. Reconstructible market cache can be refreshed independently of user financial records.

Known boundaries remain unofficial/free market availability, a bounded history horizon, conservative holiday/session rules, unsupported automated corporate-action/dividend posting, no tax-lot engine or broker cash wallet, and unavailable lifetime returns where complete daily history is absent. Live Access/OAuth, provider uptime and production migration execution are not certified by local tests.
