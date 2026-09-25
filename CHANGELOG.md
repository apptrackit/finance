# Changelog

This file covers every published [GitHub release](https://github.com/apptrackit/finance/releases) through **v3.0**, newest first. Release dates are GitHub publication dates in UTC. Entries summarize the release notes, linked pull requests, and changes between tags.

Intermediate package/UI version bumps are grouped under the next published GitHub release, rather than presented as separately published releases. The former README's **v1.6.3** notes are retained under v1.7, the release that included them.

## Unreleased

### Added

- The Finance MCP can list unresolved MCP review drafts and prepare user-confirmed edits or declines. Apply rejects stale previews and makes bounded batches atomic and idempotent; neither action posts transactions or changes balances.
- Migration `013-mcp-review-corrections.sql` stores expiring correction proposals and completed runs, indexes the active review queue, and keeps draft-only changes from marking financial forecasts stale.

### Fixed

- Removed the empty SQL statement generated between a migration and its history insert, which blocked D1 remote imports of migration 013.

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
