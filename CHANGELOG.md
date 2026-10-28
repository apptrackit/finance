# Changelog

This file covers every published [GitHub release](https://github.com/apptrackit/finance/releases) through **v4.0**, newest first. Release dates are GitHub publication dates in UTC. Entries summarize the release notes, linked pull requests, and changes between tags.

Intermediate package/UI version bumps are grouped under the next published GitHub release, rather than presented as separately published releases. The former README's **v1.6.3** notes are retained under v1.7, the release that included them.

## Unreleased

- Redesign Settings with General, Categories, Data export and Advanced areas, row-based preferences, expense/income category tabs, inline desktop category editing/deletion confirmation, and mobile editor sheets. Appearance, privacy and navigation apply immediately; main currency changes offer explicit save/cancel.

- Group Dashboard Needs review items under date headings, newest first, while preserving confirmation eligibility and grouped transfers/splits.

- Monochrome now uses a dedicated neutral light/dark palette for surfaces, controls and primary balance charts instead of a page-wide filter, retaining meaningful colors for income/expenses, gains/losses, statuses, forecasts and categories. Area charts follow the selected palette, with blue accents in Original and neutral accents in Monochrome. Red Filter also replaces its page filter with native red surfaces, controls and primary charts in light/dark modes, retaining the same meaningful financial/status and category colors.

- Refreshed cash-balance, account and portfolio history charts with EasyUI-style cards, smooth area curves, animated reveals and range pills. Dated value readouts and keyboard/touch inspection preserve native currencies, history gaps and privacy.

## v4.0 — 2026-10-20

[GitHub release](https://github.com/apptrackit/finance/releases/tag/v4.0) · [Compare v3.3…v4.0](https://github.com/apptrackit/finance/compare/v3.3...v4.0)

### Highlights

- Rebuilt Investments with a responsive portfolio overview, compact holding details, historical value charts, and HUF, USD and EUR reporting.
- Record cash-linked purchases and sales with exact execution, fees and settlement; review cost basis, net invested and gains with explicit coverage for incomplete history.
- One transaction composer supports single payments, category splits and balance adjustments; MCP can prepare whole split payments for review in the app.
- A refreshed Dashboard combines balances, period activity and one review queue. This major upgrade requires six database migrations and a coordinated API, MCP and client rollout.

### Investment rework

- **Redesigned portfolio overview and holding details.** View portfolio value, net invested, gains, allocation and sortable holdings with native 30-day trends. Open a holding for its value/gain breakdown, position, price chart and trade history; charts and trade markers share a split-adjusted display basis without rewriting executions. Filters affect holdings while portfolio totals remain complete; privacy, responsive layouts and retained session snapshots work throughout. [#144](https://github.com/apptrackit/finance/pull/144), [#168](https://github.com/apptrackit/finance/pull/168), [#172](https://github.com/apptrackit/finance/pull/172)
- **Direct cash-linked Buy/Sell.** Preview purchases and sales using actual execution prices, fees and exact settlement amounts before saving. Version-protected edits and deletion update both cash and holdings together, with safeguards against repeated saves and overselling; new trades start from Investments, and existing linked cash rows open the same editor. [#125](https://github.com/apptrackit/finance/pull/125), [#139](https://github.com/apptrackit/finance/pull/139), [#145](https://github.com/apptrackit/finance/pull/145), [#172](https://github.com/apptrackit/finance/pull/172)
- **Clearer investment performance.** Distinguish remaining cost basis, net invested, realized/unrealized gains and covered daily/range return estimates. Dated exchange rates support historical costs; complete matching trades can explain existing positions, and a review flow completes missing legacy purchase facts without moving cash or units again. Price returns exclude dividends, and unknown costs or FX stay explicit. [#142](https://github.com/apptrackit/finance/pull/142), [#151](https://github.com/apptrackit/finance/pull/151), [#162](https://github.com/apptrackit/finance/pull/162)
- **Historical portfolio tracking.** Compare portfolio value with net invested over calendar ranges using dated quantities, prices, manual observations and exchange rates, including sold and archived holdings during ownership. Cash-flow-adjusted return estimates require covered daily history; missing records remain visible as gaps rather than fabricated values. [#143](https://github.com/apptrackit/finance/pull/143)
- **Flexible holdings and dated manual values.** Set up ETFs, stocks, crypto and manual assets with separate pricing and unit choices. Record dated openings, quantity corrections and total/per-unit appraisals, with valuation history and reminders; these create no invented cash movements, and a zero appraisal does not dispose of an owned asset. [#137](https://github.com/apptrackit/finance/pull/137), [#140](https://github.com/apptrackit/finance/pull/140)
- **HUF, USD and EUR reporting with clearer market inputs.** Switch currency across portfolio summaries, history, holdings and previews while prices retain their native currency and source time. Shared cached market/dated FX reads reduce repeated requests; delayed quotes have restrained indicators, older inputs retain warnings, and concurrent history reads preserve valid source data. [#141](https://github.com/apptrackit/finance/pull/141), [#160](https://github.com/apptrackit/finance/pull/160), [#164](https://github.com/apptrackit/finance/pull/164), [#166](https://github.com/apptrackit/finance/pull/166)
- **Consistent investment reads across the app and MCP.** API/client and independent MCP use shared valuation and accounting rules, with explicit missing-data coverage and MCP's warned partial-total policy. The complete redesign preserves locks, archive history, review-draft isolation and financial exports; MCP remains read-only for investments. [#147](https://github.com/apptrackit/finance/pull/147)

### Added

- **One transaction composer with category splits.** Record a single payment, divide it across categories, or record an account balance difference through the same controls. Splits save atomically and appear as one expandable row; **Save and add another** retains type, account and date for the next payment. Splits remain cash-only and are unavailable for transfers, recurring entries and future-dated ordinary payments. [#154](https://github.com/apptrackit/finance/pull/154)
- **MCP split review drafts.** Prepare/create split payments with an optional receipt-total check, then preview edits or declines for a whole split. The app reviews, edits, confirms or declines all lines together; drafts affect neither balances nor projections until confirmed. MCP review lists and transaction search expose split grouping. [#154](https://github.com/apptrackit/finance/pull/154)

### Changed

- Dashboard combines a shared period picker, responsive balance/activity summaries, compact filters and one review queue with explicit confirmation actions and ready-item balance previews. Neutral transfer rows, daily cash-flow totals and native/converted amounts clarify activity; privacy and unavailable-data states follow the layout. [#121](https://github.com/apptrackit/finance/pull/121)
- Income/expense amount fields show the selected account's currency immediately after the typed amount, preserving decimal input and caret behavior. [#153](https://github.com/apptrackit/finance/pull/153)
- Maintenance: documented the investment accounting contract and rollout, expanded real Worker/D1 migration, rollback, concurrency and financial regression coverage, and verified compatibility of the independent split and investment migrations. [#136](https://github.com/apptrackit/finance/pull/136), [#146](https://github.com/apptrackit/finance/pull/146), [#170](https://github.com/apptrackit/finance/pull/170)
- Contributor guidance explicitly forbids AI author/co-author attribution in repository and GitHub records. [#156](https://github.com/apptrackit/finance/pull/156)
- Bumped the root application version to **4.0**, used by the API version endpoint and sidebar. Independent MCP protocol/Worker versions are unchanged.

### Fixed

- Cash and investment balance changes use decimal arithmetic to prevent floating-point residue while preserving genuine fractional amounts. Payments, transfers, adjustments, splits, pending confirmations and recurring execution commit balances, ledger rows and audits together, with guards against duplicate or conflicting changes and narrowly verified legacy residue recovery. [#146](https://github.com/apptrackit/finance/pull/146), [#149](https://github.com/apptrackit/finance/pull/149), [#170](https://github.com/apptrackit/finance/pull/170)
- Dashboard net worth respects investment holding exclusions while Investments continues to show all active holdings. [#147](https://github.com/apptrackit/finance/pull/147)
- Enabled buttons, tabs, menus, selects, checkboxes and other clickable controls show a pointer cursor again after Tailwind CSS 4 reset them to an arrow. Disabled controls retain their default cursor. [#158](https://github.com/apptrackit/finance/pull/158)
- Deployment accepts trailing SQL comments and validates every pending migration's final statement terminator before database changes, preventing false semicolon errors and avoidable partial upgrades. Retrying skips migrations already recorded under their complete names. [#174](https://github.com/apptrackit/finance/pull/174)

### Removed

- The separate bulk-add, balance-adjustment choice and split-adjustment dialogs are replaced by the composer. Per-row account/date, sliders, auto-balance and fill-with-total are retired; use **Save and add another** for unrelated payments. Dashboard's transfer creator now selects cash accounts; create investment trades from Investments. [#154](https://github.com/apptrackit/finance/pull/154), [#172](https://github.com/apptrackit/finance/pull/172)

### Migration and upgrade notes

- **Prepare a fresh SQL backup and rehearse the upgrade on a disposable copy before production rollout.** Arrange a write-free window covering browser/API/MCP writers and scheduled execution; there is no built-in maintenance switch. Review the [investment rollout and recovery guide](https://github.com/apptrackit/finance/blob/main/docs/investment-rework-validation.md). [#147](https://github.com/apptrackit/finance/pull/147)
- Apply all missing migrations in the following order before deploying updated Workers. Preserve both original `017` filenames: the custom ledger tracks complete names, so already-applied files are skipped. Do not rename, edit or manually replay applied migrations; see the [migration guide](https://github.com/apptrackit/finance/blob/main/api/migrations/README.md). [#170](https://github.com/apptrackit/finance/pull/170), [#174](https://github.com/apptrackit/finance/pull/174)
  - `017-investment-transfer-links.sql`: adds reciprocal links for verified cash/investment pairs without changing recorded amounts or quantities.
  - `017-transaction-splits.sql`: adds split grouping and ordinary transaction membership; JSON exports include `transaction_splits`.
  - `018-investment-holding-metadata.sql`: adds pricing/unit/provider metadata and immutable observed position anchors without inventing purchases or cost history.
  - `019-investment-trade-facts.sql`: adds nullable execution, fee and settlement facts, event order, mutation versions and bounded retry receipts.
  - `020-manual-investment-valuations.sql`: adds dated total/per-unit observations and explicit whole-asset ownership events.
  - `021-market-data-cache.sql`: adds reconstructible provider data, excluded from financial exports and financial-source revision changes.
- Deploy **API → MCP → client** against the same migrated D1 database, then refresh the frontend/PWA and rescan the ChatGPT app's actions for the new split tools. The full deployment path is `npm run deploy -- --with-mcp`; API/MCP-only deployments refuse pending migrations unless explicitly asked to apply them. Release publication does not deploy the app. [#147](https://github.com/apptrackit/finance/pull/147), [#154](https://github.com/apptrackit/finance/pull/154)
- Existing holdings do not need recreation, and recorded balances, units and history are preserved. Unknown legacy execution, fees, costs and currencies remain unavailable until supported facts are supplied; unsupported standalone/unlinked investment mutations are read-only. Use the dedicated trade editor and historical-detail review instead of ordinary cash entries or recurring schedules to change investments. [#139](https://github.com/apptrackit/finance/pull/139), [#151](https://github.com/apptrackit/finance/pull/151), [#172](https://github.com/apptrackit/finance/pull/172)
- Check cash/units, reciprocal links, legacy coverage, manual valuation dates, exports and forecast freshness after rollout. On failure, stop writes and preserve the database before inspecting schema/history; an older Worker alone is not a proven database rollback. Market availability, bounded history and incomplete opening/FX/corporate-action coverage can limit returns; automated dividends/corporate actions and tax-lot accounting are outside this release. [#147](https://github.com/apptrackit/finance/pull/147)

## v3.3 — 2026-10-15

[GitHub release](https://github.com/apptrackit/finance/releases/tag/v3.3) · [Compare v3.2…v3.3](https://github.com/apptrackit/finance/compare/v3.2...v3.3)

### Highlights

- Private deployments now verify Cloudflare Access identity on every API read and write, replacing the shared browser API key. Existing deployments require authentication configuration before upgrading.
- Dashboard loads only the selected dates; Analytics and search load complete history when opened. Widget skeletons and retained session snapshots make loading and return visits smoother.
- Redesigned account and transfer dialogs, clearer AI forecast summaries, and previous-month cash balance comparisons.
- Compact sidebar account shares and a Money Map that uses the available phone width.

### Added

- Cash Balance Trend can compare daily actual balances with the previous month on a shared calendar-day axis, with smooth curves, explicit month labels, and same-day tooltip differences. Comparison requires previous-month history, hides the moving average, and respects privacy, cash exclusions, and unavailable exchange rates. [#115](https://github.com/apptrackit/finance/pull/115)
- Compact sidebar account shares pair thin bars with percentages, comparing cash and investment groups independently using converted positive balances. Active accounts excluded from totals still count; privacy and unavailable valuations remain explicit. [#104](https://github.com/apptrackit/finance/pull/104)

### Changed

- Private API reads and writes require verified Cloudflare Access identity; missing or invalid private configuration blocks access. API sign-in and session recovery retain unsaved forms, while an explicit public mode supports unauthenticated demos and local development. MCP keeps its separate authentication. [#117](https://github.com/apptrackit/finance/pull/117)
- Dashboard requests only its selected cash and investment dates through bounded history pages; Analytics and global search request complete history on demand. Only complete, consistent page sequences replace the previous snapshot, with retry feedback after failures or changes during pagination. [#116](https://github.com/apptrackit/finance/pull/116)
- Initial finance reads show widget-shaped shimmer skeletons that respect saved Analytics visibility and reduced motion. Investment portfolios and saved forecast reports remain in session memory across navigation, refresh in the background, and retain the last complete data after failures; portfolio display currency also survives navigation. [#116](https://github.com/apptrackit/finance/pull/116)
- AI Financial Forecast presents a prominent headline, cash at generation, 7/30/90-day deltas and range bars, and a bounded uncertainty band. A unified 30-day/90-day/year/all-time history control, visible risks and suggestions, and expandable methodology retain saved-report selection, freshness warnings, and privacy masking. [#112](https://github.com/apptrackit/finance/pull/112)
- Account creation and editing use compact dialogs with type cards, currency selection, inclusion switches, and clear save controls. Editing previews balance adjustments, offers transaction/overwrite choices and Revert, and groups protected account-management actions; market search and precise investment quantities remain available. [#107](https://github.com/apptrackit/finance/pull/107)
- Transfer dialogs use compact From/To cards, account swapping, conversion controls, privacy-aware balance previews, and Revert. Posted edit previews undo the original transfer before applying the replacement; MCP review drafts preserve explicit native amounts and show confirmation-only previews. Failed saves retain the draft and display an inline error. [#109](https://github.com/apptrackit/finance/pull/109)
- The app version moves from Settings to a centered sidebar footer, and the desktop privacy toggle sits beside the Finance logo. Removed the misleading Synced indicator, which described selected page requests rather than database synchronization. [#110](https://github.com/apptrackit/finance/pull/110)
- Maintenance: expanded client, deployment, and real Worker/D1 regression coverage; documented history-loading measurements, comparison behavior, and private/public deployment setup. Deployment URL validation identifies the invalid setting, and private remote API development uses direct cookie-bearing requests from explicitly allowed localhost origins. [#116](https://github.com/apptrackit/finance/pull/116), [#117](https://github.com/apptrackit/finance/pull/117), [#115](https://github.com/apptrackit/finance/pull/115)
- Bumped the root application version to **3.3**, used by the API version endpoint and sidebar.

### Fixed

- Background refresh feedback stays in a fixed desktop corner or above mobile navigation, so the page no longer shifts when it appears or disappears. Screen-reader feedback and reduced-motion support remain available. [#116](https://github.com/apptrackit/finance/pull/116)
- Money Map spreads its Sankey flows across the available phone width. Narrow labels stay within their columns; touch and keyboard inspection reveal full names and amounts with privacy masking. [#114](https://github.com/apptrackit/finance/pull/114)

### Removed

- Removed shared browser API-key authentication and persistent service-worker caching of financial API responses. Updated installations clear the former API cache; offline app-shell navigation does not provide authenticated financial data. [#117](https://github.com/apptrackit/finance/pull/117)

### Migration and upgrade notes

- **Breaking authentication change:** configure Access on the entire private API hostname and the frontend before deploying. Set `API_AUTH_MODE=private`, an explicit HTTPS `API_URL`, `API_ACCESS_TEAM_DOMAIN`, `API_ACCESS_AUD`, `API_ACCESS_ALLOWED_EMAIL`, and exact `ALLOWED_ORIGINS`; client `VITE_API_AUTH_MODE` must match. Configure credentialed CORS, unauthenticated OPTIONS preflight, and Access session cookies. See the [API Access upgrade guide](https://github.com/apptrackit/finance/blob/main/docs/api-access.md). [#117](https://github.com/apptrackit/finance/pull/117)
- Prefer frontend/API HTTPS hostnames on the same site. An explicitly configured Access-protected workers.dev API is supported, but cross-site cookies require SameSite=None and can still be blocked by browsers; preview URLs remain disabled. Local frontends using a private remote API need their exact loopback origin allowed and the same cookie considerations. [#117](https://github.com/apptrackit/finance/pull/117)
- Deploy the updated API before the matching client in the same upgrade: the client depends on the new history and session endpoints. Refresh the frontend/PWA afterward. Remove obsolete `API_SECRET` and `VITE_API_KEY` entries from existing local files and set the new modes explicitly; old keys no longer authorize requests and missing settings never enable public access. [#116](https://github.com/apptrackit/finance/pull/116), [#117](https://github.com/apptrackit/finance/pull/117)
- Public demos must explicitly use `API_AUTH_MODE=public` with a matching client and a separate synthetic-data Worker/database; public mode permits unauthenticated financial mutations. MCP authentication stays independent. [#117](https://github.com/apptrackit/finance/pull/117)
- No new database migrations are required beyond v3.2's migration 016. Analytics and search still load the complete ledger on their first visit; pagination bounds each response rather than total browser memory. Session snapshots reset on browser reload. [#116](https://github.com/apptrackit/finance/pull/116)

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
