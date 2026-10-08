# Changelog

This file covers every published [GitHub release](https://github.com/apptrackit/finance/releases) through **v3.2**, newest first. Release dates are GitHub publication dates in UTC. Entries summarize the release notes, linked pull requests, and changes between tags.

Intermediate package/UI version bumps are grouped under the next published GitHub release, rather than presented as separately published releases. The former README's **v1.6.3** notes are retained under v1.7, the release that included them.

## Unreleased

### Added

- Compact sidebar account shares pair thin bars with percentages, comparing active cash and investment groups independently using converted values. Shares follow the Accounts page's positive-balance rules, include accounts excluded from totals, and respect privacy and unavailable valuations.

### Changed

- Redesigned account creation with type cards, an embedded starting-balance currency selector, inclusion switches, and a compact footer; market asset search and manual investment setup remain available.
- Redesigned the account editor with a balance-first layout, signed adjustment preview, transaction/overwrite choices, inclusion switches, grouped management actions, inline protected deletion, and an unsaved-changes footer with Revert.
- Add and edit transfers use compact account-and-amount cards with account swapping, conversion controls, privacy-aware balance previews, and edit revert feedback. Posted edit previews undo the original transfer before applying the replacement; MCP review drafts retain explicit native amounts and confirmation-only previews.

## v3.2 — 2026-10-06

[GitHub release](https://github.com/apptrackit/finance/releases/tag/v3.2) · [Compare v3.1…v3.2](https://github.com/apptrackit/finance/compare/v3.1...v3.2)

### Highlights

- A refreshed app with a desktop sidebar, mobile navigation, independent light/dark mode, and a dedicated Accounts page.
- Archive empty accounts while keeping their history and preventing new activity; restore them when needed with recurring schedules still paused.
- Search across the full financial history and bookmark app pages and Dashboard/Analytics filters.
- Cash charts retain daily movements in all-time history, and account balance edits default to recording a transaction.

### Added

- Account archive/restore keeps historical records and exports while removing archived accounts from active choices and current valuations. Archiving requires an unlocked account with zero balance/holding and no pending or MCP review rows, pauses all schedules using it, and records an audit entry; archived accounts remain read-only across API, MCP, and D1 until restored. Restore leaves schedules paused. [#98](https://github.com/apptrackit/finance/pull/98)
- A dedicated Accounts page groups cash, investments, and archived accounts by converted reporting-currency value, with privacy-aware balance-share bars and red lock indicators. Centered account dialogs and anchored action menus expose Lock/Unlock, Archive/Restore, and permanent deletion that requires typing the account name. [#98](https://github.com/apptrackit/finance/pull/98)
- Search everything (sidebar/header button or Cmd/Ctrl+K) searches full posted cash/investment history, pending transactions, accounts, categories, and recurring schedules by text, native amounts/currencies, and dates. Results open read-only transaction details, existing editors, or filtered full-history lists; N and the plus buttons still create transactions. [#98](https://github.com/apptrackit/finance/pull/98)
- App sections have browser URLs, with bookmarkable Dashboard/Analytics filters, Back/Forward navigation, and protection for unfinished financial editors. Dashboard is always available and opens at the root URL and on fresh PWA launches; explicit URLs and resumed tabs retain their view. [#97](https://github.com/apptrackit/finance/pull/97)

### Changed

- Refreshed every page with a shared visual system, desktop sidebar, mobile New transaction/More navigation, and centered content with equal wide-screen gutters. Light/dark mode is independent of color themes; compact sidebar account groups show balances, sort by value, and save their collapse choices alongside appearance preferences in JSON export. [#98](https://github.com/apptrackit/finance/pull/98)
- Locked accounts require unlocking before edits or deletion. Permanent account deletion is blocked when linked transfers exist to protect the other leg; archive instead to preserve history. Settings can hide the Accounts page, and navigation preference saves are validated by the API. [#98](https://github.com/apptrackit/finance/pull/98)
- Account balance edits default to “Adjust balance with a transaction instead of direct update,” preserving a ledger record unless the option is unchecked. [#91](https://github.com/apptrackit/finance/pull/91)
- Maintenance: added a release preparation/publication guide with short version-only release titles and refreshed contributor documentation and regression coverage for navigation, search, account management, and archive safety. Removed obsolete redesign documentation and images. [#100](https://github.com/apptrackit/finance/pull/100), [#102](https://github.com/apptrackit/finance/pull/102), [#97](https://github.com/apptrackit/finance/pull/97), [#98](https://github.com/apptrackit/finance/pull/98), [design cleanup](https://github.com/apptrackit/finance/commit/5d72566c6ddf8a0a8395a1fb7bc5f702beb4bc60)
- Bumped the root application version to **3.2**, used by the API version endpoint and Settings.

### Fixed

- All-time AI cash history retains saved daily movements from the past year and labels older monthly samples. The main Cash Balance Trend respects cash-balance exclusions and elapsed dates; actual cash lines no longer smooth away changes, while saved forecast snapshots and projections stay unchanged. [#95](https://github.com/apptrackit/finance/pull/95)
- Account create/edit persists investment trading (quote) currency and separate exclusion settings, and API account flags are returned as JSON booleans. [#98](https://github.com/apptrackit/finance/pull/98)
- Ordinary AI review drafts keep their available actions visible on desktop and mobile without hovering or tapping, matching linked transfer drafts. Confirmation date eligibility and account locks remain enforced. [#89](https://github.com/apptrackit/finance/pull/89)

### Removed

- Removed the seasonal Cash Balance Forecast widget and its customization toggle; AI Financial Forecast remains the supported forecast widget. [#93](https://github.com/apptrackit/finance/pull/93)
- Removed saved last-page startup behavior and the `finance_last_view` browser preference. Page URLs now preserve explicit views, and fresh launches open Dashboard. [#97](https://github.com/apptrackit/finance/pull/97)

### Migration and upgrade notes

- Apply `016-account-archive.sql` before updating API/MCP Workers. It adds `accounts.archived_at` and D1 triggers enforcing archive requirements, read-only archived accounts and ledgers, paused schedules, and account deletion safety for both Workers. [#98](https://github.com/apptrackit/finance/pull/98)
- Restoring an account does not reactivate its recurring schedules; resume them explicitly after review. Accounts with pending work or a nonzero balance/holding must resolve those items before archiving. [#98](https://github.com/apptrackit/finance/pull/98)
- The PWA now generates one manifest with `/dashboard` as its launch URL. Existing installations receive manifest updates on their browser's schedule, and cached offline navigation still requires available financial data. Retired last-page, sidebar-preview, and seasonal forecast preferences are ignored. [#97](https://github.com/apptrackit/finance/pull/97), [#98](https://github.com/apptrackit/finance/pull/98), [#93](https://github.com/apptrackit/finance/pull/93)

## v3.1 — 2026-10-01

[GitHub release](https://github.com/apptrackit/finance/releases/tag/v3.1) · [Compare v3.0…v3.1](https://github.com/apptrackit/finance/compare/v3.0...v3.1)

### Highlights

- More trustworthy financial totals: missing exchange rates are explicit, failed reads retain the last successful data, yearly schedules keep their selected month, and JSON exports cover all durable app data.
- Cash transfer review drafts and previewed corrections through MCP, with both transfer legs handled together and no balance changes until confirmation in the app.
- Richer evidence for AI forecasts and 12-month/all-time cash history views alongside the existing 90-day projection.

### Fixed — financial correctness and recovery

- Missing, zero, negative, nonnumeric, or nonfinite exchange rates make affected dashboard, calendar, analytics, and portfolio totals unavailable instead of mixing raw foreign amounts. Warnings identify missing currencies and offer retry; native balances, quantities, and account charts remain available. API net worth and converted account balances return null when incomplete, spending estimates fail explicitly, and MCP retains warned partial totals. Rate snapshots are tied to their base currency. [#83](https://github.com/apptrackit/finance/pull/83)
- Investment display conversion uses the selected reporting currency; manual asset values and returns keep consistent units. [#83](https://github.com/apptrackit/finance/pull/83)
- Failed financial reads show accessible errors and Retry actions. Failed refreshes retain each dataset's last successful values with a stale-data notice; partial failures keep successful sections usable, older requests cannot overwrite newer results, and forms remain mounted during refresh. [#82](https://github.com/apptrackit/finance/pull/82)
- Yearly recurring schedules retain their selected month across saves, reloads, API execution, client calendars/previews, and MCP projections. Legacy schedules keep their creation-month fallback until edited. [#84](https://github.com/apptrackit/finance/pull/84)
- Settings JSON now exports a consistent, versioned snapshot of all durable financial records, saved app/browser preferences, audit logs, forecast history, source revision, and MCP batch/replay records. Coverage, row counts, migrations, exclusions, and restore support are explicit. CSV describes its posted cash ledger scope and preserves IDs, transfer links, native currencies, signed amounts, and spending exclusions. Failed, incomplete, unsupported, or oversized reads block downloads. [#85](https://github.com/apptrackit/finance/pull/85)
- Removed routine browser-console logging of accounts, balances, investment/market responses, and recurring details; affected failure logs contain operation/status information. Investment detail charts, holding prices, and secondary transaction amounts respect hidden privacy mode. [#80](https://github.com/apptrackit/finance/pull/80)
- Removed outdated investment guidance that confused share/coin quantities with dollar amounts and assumed all holdings used USD. [#81](https://github.com/apptrackit/finance/pull/81)

### Added — MCP review workflows

- Preview and create cash-to-cash transfer review drafts through MCP. Same-currency legs must match; cross-currency transfers require explicit sent and received amounts. The displayed effective rate does not infer either amount or a separate fee. Proposals expire after 24 hours and creation supports duplicate warnings and idempotent retries. [#78](https://github.com/apptrackit/finance/pull/78)
- The app and MCP list show each linked transfer pair once, with both accounts and exact native amounts. The app edits, confirms, or declines both legs atomically, with locks, date checks, stale guards, and audit records. Pending edits and declines leave balances and forecasts unchanged; confirmation applies both balance deltas once. [#78](https://github.com/apptrackit/finance/pull/78)
- List unresolved MCP income/expense review drafts with cursor pagination, provenance, account/currency context, flags, and truncation metadata. Prepare complete before/after previews for batches of edits or declines, then apply after explicit user confirmation with expiry, stale-preview rejection, atomic writes, and idempotent retries. [#75](https://github.com/apptrackit/finance/pull/75)
- Separate MCP transfer correction tools preview and atomically edit or decline both unresolved legs after explicit confirmation, preserving exact cross-currency amounts. Ordinary correction tools remain limited to unlinked review drafts. [#78](https://github.com/apptrackit/finance/pull/78)
- Draft-only changes no longer mark published financial forecasts stale; review drafts remain outside balances and upcoming projections until posted in the app. [#75](https://github.com/apptrackit/finance/pull/75), [#78](https://github.com/apptrackit/finance/pull/78)

### Changed — forecasts and analytics

- MCP forecast context includes up to a year of named posted income, recurring income/expense candidates, monthly totals with complete-month flags, conversion/truncation metadata, and narratives from the five most recent snapshots. Forecast instructions use repeated evidence for future pay and bills, avoid double-counting recorded upcoming activity, and distinguish assumptions and prior plans from observed facts. Existing snapshots are unchanged; this improves the evidence and instructions rather than guaranteeing a particular model forecast. [#71](https://github.com/apptrackit/finance/pull/71)
- AI cash forecasts offer 90-day, 12-month, and all-time actual history ranges, each followed by the existing 90-day projection and anchored to the selected snapshot's generation date. New snapshots retain daily history for the prior year and monthly history from the first eligible cash transaction. Older snapshots can reconstruct longer history from their saved balance and the current posted ledger, with visible ledger-edit/FX caveats. The chart's generation marker no longer has an overlapping label. [#74](https://github.com/apptrackit/finance/pull/74)
- Analytics shows Projected mode only when the selected period contains eligible ordinary upcoming transactions, excluding MCP review drafts and investments. Period navigation returns to Actual; removing the final eligible row hides the switch. Calendar dates are interpreted locally so period eligibility and charts agree. [#79](https://github.com/apptrackit/finance/pull/79)

### Changed — deployment, tests, and contributor workflow

- Deployment output groups local checks, Cloudflare/database work, and publishing into phases, with command start/result, elapsed time, target order, and restrained interactive-terminal color. Redirected output stays plain. [#52](https://github.com/apptrackit/finance/pull/52)
- D1 migration submissions no longer add an empty SQL statement before the history insert, fixing remote import of migration 013. Files must end with a semicolon. File-import progress is handled separately from JSON query results, and each successful import is followed by a read verifying its history row. [#77](https://github.com/apptrackit/finance/pull/77), [follow-up fix](https://github.com/apptrackit/finance/commit/ef3f80b)
- CI runs client tests on pinned Node 22 and Node 26; both jobs are required by `CI passed`. Browser-style test local storage also lets the client deployment gate run under Node 26. Worker/D1 integration remains on the pinned Node 22 runtime. [#78](https://github.com/apptrackit/finance/pull/78)
- Added regression coverage for transfer review/corrections, forecast evidence/history, missing FX, failed reads, complete exports and limits, yearly recurrence, and fresh/upgrade migrations. [#71](https://github.com/apptrackit/finance/pull/71), [#74](https://github.com/apptrackit/finance/pull/74), [#75](https://github.com/apptrackit/finance/pull/75), [#78](https://github.com/apptrackit/finance/pull/78), [#82](https://github.com/apptrackit/finance/pull/82), [#83](https://github.com/apptrackit/finance/pull/83), [#84](https://github.com/apptrackit/finance/pull/84), [#85](https://github.com/apptrackit/finance/pull/85)
- Standardized issue-first branches and completed issue/PR templates, with functional issue references first in PR bodies. Contributor guidance now covers native issue Type/Priority, existing labels, milestones, projects, and actual dependency relationships. The README/changelog also record v3.0's publication. [#67](https://github.com/apptrackit/finance/pull/67), [#72](https://github.com/apptrackit/finance/pull/72), [#51](https://github.com/apptrackit/finance/pull/51)
- Bumped the root application version to **3.1**, used by the API version endpoint and Settings.

### Migration and upgrade notes

- Apply these migrations in order before updating API/MCP Workers:
  - `013-mcp-review-corrections.sql`: expiring draft correction proposals, replay records, review queue indexing, and revision triggers that ignore draft-only changes.
  - `014-mcp-transfer-review-corrections.sql`: expiring transfer-pair correction proposals and replay records.
  - `015-yearly-recurring-month.sql`: nullable zero-based month for yearly schedules, retaining the legacy creation-month fallback.
- **JSON is a data archive; import/restore remains unsupported.** Exports contain unmasked values, exclude credentials and expiring proposal capabilities, and reject tables above 10,000 rows or JSON above 16 MiB. CSV uses the same export endpoint and limits; use a D1 export for larger datasets. [#85](https://github.com/apptrackit/finance/pull/85)
- MCP publishes immutable HUF forecasts with the existing 91-point daily path. Richer evidence and longer saved history apply to new snapshots; reconstructed history for older snapshots may change after ledger, account-setting, or exchange-rate changes. [#71](https://github.com/apptrackit/finance/pull/71), [#74](https://github.com/apptrackit/finance/pull/74)

## v3.0 — 2026-09-24

[GitHub release](https://github.com/apptrackit/finance/releases/tag/v3.0) · [Compare v2.11…v3.0](https://github.com/apptrackit/finance/compare/v2.11...v3.0) · [PR #50](https://github.com/apptrackit/finance/pull/50)

### Added

- A list/calendar switch for transactions. The monthly calendar shows daily income, expenses, transfers, a balance trend, and a selected day's transactions, with compact and detailed views.
- Money Map analytics widget showing how income flows into spending and surplus.
- Income vs Expenses Trend widget with selectable time resolution and net-income data.
- MCP review balance previews that show the effect of accepting drafts without changing actual balances.
- A client-only deployment command using the saved project/API configuration.
- Compiled API/MCP integration tests against disposable shared D1, covering migration upgrades, authentication, retries, rollback, transfers, recurring execution, and draft isolation; client request/error regression tests.
- A repository-wide `AGENTS.md` guide, replacing `CLAUDE.md`.

### Changed

- Consolidated deployment into `scripts/deploy.mjs` with separate client, API, MCP, and migration commands. API/MCP-only deployments check pending migrations; applying them requires an explicit option. Removed root shell wrappers, preserved local config/env files, and added deployment tests to CI. `npm run deploy:mcp` now deploys only MCP; use `npm run deploy -- --with-mcp` for a full release including MCP.
- CI now checks all three workspaces, real Worker/D1 integration, client lint, and workflow syntax on pinned Node 22, with pinned Actions, bounded runs, retained test reports, and an aggregate `CI passed` check. Use the pinned Node 22 LTS runtime for local release checks.
- Financial forecasts now require 91 daily points for days 0–90, retain 90 days of actual cash history, and validate dated movements and unrealistic straight-line predictions. The chart joins actual history to the projection; report selection and date controls were refined.
- Refreshed the default blue appearance, borders, icons, and account allocation display. The available themes are Original, Monochrome, and Red Filter.
- Simplified startup privacy settings to show values, hide all values, or hide net worth.
- Improved transaction presentation, date-picker accessibility, chart focus styling, sticky analytics filters, and recent-transaction badges.
- Rewrote the README around current setup, deployment, API routes, and financial behavior; moved release history here.

### Fixed

- Recurring schedules no longer consume occurrences or deactivate when execution is skipped because an account is locked.
- Deleting the cash side of an investment transfer now atomically reverses cash and holding quantities and removes both records, while respecting account locks and duplicate requests.
- Stabilized calendar transaction linking to prevent duplicate entries.
- Refined chart animations and forecast rendering order.

### Removed

- Retired budget management across the API, client, and MCP, including its navigation entry and MCP budget reporting.

### Migration and upgrade notes

- **Back up any budget data you need before upgrading.** Migration `012-remove-budgets.sql` permanently drops the budget tables and removes the saved budget navigation preference.
- Update MCP forecast publishers for the 91-point daily path and dated movement validation. Use the pinned Node 22 LTS runtime for local builds, tests, and deployment.

## v2.11 — 2026-09-10

[GitHub release](https://github.com/apptrackit/finance/releases/tag/v2.11) · [Compare v2.5…v2.11](https://github.com/apptrackit/finance/compare/v2.5...v2.11)

### Added

- Two-step MCP transaction entry: preview proposed income/expense items, then create pending review drafts after approval. The app gained a separate MCP Review section with edit, confirm, and decline actions. Unconfirmed drafts stay out of balances and projected analytics. Draft provenance, duplicate warnings, audit records, and idempotency accompany the workflow. [#46](https://github.com/apptrackit/finance/pull/46)
- MCP-published HUF financial forecasts with immutable snapshots, source-revision checks, read-only latest/history API endpoints, and an Analytics widget showing 7/30/90-day ranges, expected cash paths, freshness, privacy masking, and report history. Forecast publication does not change source financial records. [#48](https://github.com/apptrackit/finance/pull/48)
- Quote-currency metadata and improved investment unit/currency validation. [#45](https://github.com/apptrackit/finance/pull/45)

### Changed

- Improved amount formatting and validation, including balance-adjustment entry and the single-transaction adjustment flow. [#44](https://github.com/apptrackit/finance/pull/44)
- Improved investment purchase-price and transfer handling, and allowed PATCH in API CORS responses. [#45](https://github.com/apptrackit/finance/pull/45)
- Replaced signed MCP proposal tokens with opaque IDs backed by canonical D1 proposals that expire after 24 hours. Creation consumes proposals atomically while retaining idempotent retries. Removed the signing-secret/HMAC flow and added a staging smoke test. [#49](https://github.com/apptrackit/finance/pull/49)
- Dedicated account trend charts now display each account's native currency; aggregate analytics retain the reporting currency. [#49](https://github.com/apptrackit/finance/pull/49)
- Replaced the legacy Analytics spending-estimate widget with the configurable AI forecast widget. [#48](https://github.com/apptrackit/finance/pull/48)

### Fixed

- Prevented the Edit Account form from briefly reappearing while a balance adjustment is being confirmed. The adjustment dialog stays disabled during the save, blocks duplicate confirmation clicks, and remains open on failure. [#49](https://github.com/apptrackit/finance/pull/49)
- Improved MCP review ordering, date grouping, and pending-action feedback during the release cycle. [Tagged changes](https://github.com/apptrackit/finance/compare/v2.5...v2.11)

### Migrations

- `008-investment-quote-currency.sql`: separate fiat pricing currency from investment holding units.
- `009-mcp-review-drafts.sql`: review provenance/flags and idempotent draft-batch records.
- `010-financial-outlook.sql`: immutable forecast snapshots and financial-source revision tracking.
- `011-mcp-stored-proposals.sql`: canonical expiring proposals referenced by opaque IDs.

## v2.5 — 2026-07-12

[GitHub release](https://github.com/apptrackit/finance/releases/tag/v2.5) · [Compare v2.4…v2.5](https://github.com/apptrackit/finance/compare/v2.4...v2.5)

### Added

- A separate Finance MCP Worker for read-only financial analysis, using a direct D1 binding and Cloudflare Access authentication. Draft and forecast writes were added later in v2.11. [#43](https://github.com/apptrackit/finance/pull/43)
- Optional MCP deployment in the root deployment flow, with a saved preference and reuse of existing MCP configuration. [#43](https://github.com/apptrackit/finance/pull/43)

### Changed

- Cleaned up deployment configuration and addressed MCP deployment/performance review findings. [#43](https://github.com/apptrackit/finance/pull/43)

### Removed

- The legacy public API-key endpoint and its deployed secret. [#43](https://github.com/apptrackit/finance/pull/43)

## v2.4 — 2026-07-07

[GitHub release](https://github.com/apptrackit/finance/releases/tag/v2.4) · [Compare v1.7…v2.4](https://github.com/apptrackit/finance/compare/v1.7...v2.4)

### Added

- Persisted account locks, lock/unlock endpoints, UI controls, and enforcement in transaction, transfer, and recurring execution paths. [#41](https://github.com/apptrackit/finance/pull/41)
- Server-backed navigation visibility with local fallback, saved view selection, and configurable Analytics widget visibility. [#41](https://github.com/apptrackit/finance/pull/41)
- An appearance/theme system with preview swatches and CSS-filter themes. [#41](https://github.com/apptrackit/finance/pull/41)
- One-time upcoming transactions, separate from recurring schedules. Future income/expenses stay pending until confirmation, appear in projected views, and can be declined without changing balances. [#42](https://github.com/apptrackit/finance/pull/42)
- Upcoming/confirm/decline API endpoints, client-calendar date handling through `X-Client-Date`, and temporary New/Updated transaction badges. [#42](https://github.com/apptrackit/finance/pull/42)

### Changed

- Refined recurring schedule cards, grouping, pause/activate controls, and calendar views with occurrence/end-date limits. [#41](https://github.com/apptrackit/finance/pull/41)
- Improved collapsible dashboard sections, responsive layouts, loading indicators, alerts, modal accessibility, and navigation behavior. The API version now comes from the root package. [#41](https://github.com/apptrackit/finance/pull/41)
- Simplified deployment scripts. [#40](https://github.com/apptrackit/finance/pull/40)

### Fixed

- Linked transfer editing now updates both legs, descriptions, account selections, received/source amounts, and affected balances together. Corrected same-day transaction ordering and strengthened lock checks. [#41](https://github.com/apptrackit/finance/pull/41)
- Blocked linked transfers from the upcoming workflow and prevented early confirmation. Guarded pending confirmation against duplicate/racing balance updates and posting without a successful balance update. [#42](https://github.com/apptrackit/finance/pull/42)
- Allowed uncategorized transaction input and surfaced useful server validation failures across transaction, account, budget, and recurring forms. [#42](https://github.com/apptrackit/finance/pull/42)

### Migrations

- `005-account-lock.sql`: persisted account lock state.
- `006-app-settings.sql`: shared navigation preferences.
- `007-upcoming-transactions.sql`: transaction status and lifecycle timestamps.

The published release also includes the small maintenance PR [#39](https://github.com/apptrackit/finance/pull/39), titled “test”; it has no separately documented feature.

## v1.7 — 2026-04-19

[GitHub release](https://github.com/apptrackit/finance/releases/tag/v1.7) · [Compare v1.3.13…v1.7](https://github.com/apptrackit/finance/compare/v1.3.13...v1.7)

### Added and changed

- Budget management by account/category and customizable navigation settings. Budgets were subsequently removed after v2.11. [#35](https://github.com/apptrackit/finance/pull/35)
- Organized Settings into currency, privacy, navigation, and data-export components. [#36](https://github.com/apptrackit/finance/pull/36)
- Added yearly recurring schedules, bulk transaction entry, modal account/transaction forms, and refinements to cash trends and investment charts. [Tagged changes](https://github.com/apptrackit/finance/compare/v1.3.13...v1.7)
- Added All Time transaction filtering and a quick way to broaden searches with no results. Fixed visible/hidden transaction counts when filters change and refined date-picker presets. [#38](https://github.com/apptrackit/finance/pull/38)
- Added GitHub Actions checks for API/client tests, API typechecking, and the client build, and upgraded Wrangler from v3 to v4. [Tagged changes](https://github.com/apptrackit/finance/compare/v1.3.13...v1.7)

### Historical v1.6.3 notes — comprehensive improvements

These are the former README's “What's New” notes, consolidated here. **v1.6.3 was a development version label, not a separate published GitHub release.** The work landed in [#37](https://github.com/apptrackit/finance/pull/37) and shipped within v1.7; the [original documentation commit](https://github.com/apptrackit/finance/commit/7a21a44) recorded it on 2026-04-18.

- **Validation and errors:** introduced Zod request schemas and validation middleware, typed `AppError`/`ErrorCode` helpers, and structured validation responses.
- **Request and browser protections:** added a per-instance, per-IP rate limiter and Pages CSP, frame, content-type, referrer, and permissions headers.
- **Audit and logging:** introduced the `audit_log` table/repository and a structured JSON logger for API operations.
- **Database performance:** added eight indexes on frequently queried transaction, investment, and recurring-schedule columns.
- **Repository typing:** introduced typed D1 query parameters and raw-row mappings for SQLite boolean values.
- **Transaction UI:** added search by description/category/account, animated row skeletons, and mobile bottom navigation.
- **Client structure:** extracted shared finance-data loading and refresh behavior from `App.tsx` into `useFinanceData`.
- **Regression coverage:** introduced Vitest suites for API validators/error helpers and the client finance-data hook.

### Migrations

- `002-budgets.sql`: budget tables and relationships.
- `003-indexes.sql`: query indexes.
- `004-audit.sql`: audit records.

## v1.3.13 — 2026-01-19

[GitHub release](https://github.com/apptrackit/finance/releases/tag/v1.3.13) · [Compare v1.3.8…v1.3.13](https://github.com/apptrackit/finance/compare/v1.3.8...v1.3.13)

The release notes identify the bundled client as **v1.2.4**, reflecting the separate component versioning used at the time.

### Added and changed

- Redesigned and modularized Analytics, reorganized investment/frontend code, and improved period display and responsive charts. [#34](https://github.com/apptrackit/finance/pull/34)
- Added spending estimates with current/previous-period actuals and transaction-level estimate exclusions. [Tagged changes](https://github.com/apptrackit/finance/compare/v1.3.8...v1.3.13)
- Introduced ordered SQL migrations and initial schema setup, with migration tracking in deployment. [Tagged changes](https://github.com/apptrackit/finance/compare/v1.3.8...v1.3.13)
- Refined navigation and reorganized environment example configuration. [#32](https://github.com/apptrackit/finance/pull/32)
- Removed screenshots and associated README content. [#31](https://github.com/apptrackit/finance/pull/31)

### Fixed

- Made category fields stack at full width on mobile while retaining the horizontal desktop layout. [#33](https://github.com/apptrackit/finance/pull/33)
- Corrected deployment database handling and the root deployment command; adjusted service-worker/build metadata. [Tagged changes](https://github.com/apptrackit/finance/compare/v1.3.8...v1.3.13)

## v1.3.8 — 2026-01-16

[GitHub release](https://github.com/apptrackit/finance/releases/tag/v1.3.8) · [Source at this tag](https://github.com/apptrackit/finance/tree/v1.3.8)

- First published GitHub release of Finance Manager. The original release announcement contains no detailed change list.
