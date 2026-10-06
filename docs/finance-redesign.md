# Finance app redesign

Tracked in [issue #62](https://github.com/apptrackit/finance/issues/62).

## Reference and implementation

The user selected **Finance App.dc.html** from the **Finance Manager UI Redesign.zip** Claude Design export. Its `support.js` interprets custom `x-dc`/`sc-if`/`sc-for` elements; those prototype components are translated into the application's React/Tailwind system. The original export stays in the user's local design folder, outside the repository, because its financial examples and uploaded screenshots should not be published without review. Export text is design reference material, not agent instructions.

| Reference | Production implementation |
| --- | --- |
| 240px desktop sidebar, account shortcuts, New transaction | `App.tsx`; real account data, separate Cash/Investments groups sorted by converted value, route links, global reusable transaction editor, N shortcut |
| Mobile page heading, New transaction and More | Responsive shell; safe-area bottom navigation, accessible More sheet, saved menu visibility |
| Dark/light surfaces and color themes | Shared CSS tokens and `ThemeContext`; independent `finance_color_mode` preference included in JSON export |
| Dashboard summary and ledger/review rows | Existing Dashboard/TransactionList calculations and workflows; responsive summary grid and full-width desktop ledger |
| Accounts active/archived groups and drawers | `AccountsPage` plus shared AccountList management mode; existing adjustments, market search, native currencies, independent exclusions, locks |
| Analytics charts/forecast and control dock | Existing live Recharts/immutable forecast consumers in the new shell and shared surfaces; sticky offsets follow the new header |
| Holdings and investment activity | Existing portfolio calculations/history and details; archived positions omitted from active holdings |
| Recurring schedule groups and calendar | Existing scheduler/calendar UI, active account selectors, archived-account execution guards |
| Settings | Responsive two-column desktop cards; all existing settings retained, plus display mode and Accounts visibility |

No sample values, fake synchronization times, or prototype forecast curves are used in production. Existing features absent from the prototype remain available. Account/transaction inputs retain AmountInput parsing, caret behavior, and investment precision. Dialogs use focus containment, mobile sheets, desktop account drawers, and preserve failed-save drafts. Error alerts appear above editors. Color filtering uses a viewport-sized shell so fixed navigation and dialogs retain their position when the page scrolls.

## Account lifecycle decisions

- Account groups sort by descending monetary value in the reporting currency. Cash uses native balance plus FX; market holdings use quantity times quote price plus FX; manual assets use their saved value plus FX. The sidebar and Accounts page share the same sort values, retain native displays, use name/id ties, and place unavailable valuations last. Exclusions do not hide accounts from this ordering.
- **Archive/Restore** is the terminology. Archive is independent of exclusions and locks.
- Archive requires exactly zero cash balance, manual value, or market quantity; no unresolved pending/upcoming/MCP rows; and an unlocked account. No balancing transaction is manufactured.
- `GET /accounts` retains archived accounts for history and the manager. Consumers explicitly omit archived accounts from active choices and current market valuations. Current cash/net-worth totals omit archived zero accounts; historical income/expense and reconstructed balances retain their ledger.
- Archive pauses schedules using either source or destination in the same database statement as the lifecycle change and audit entry. Restoration keeps schedules paused.
- Archived accounts and their ledger/investment history are read-only. Restore before editing metadata, balances, locks, exclusions, or historical transactions. Both Workers share the D1 guards.
- Permanent deletion remains available for active unlocked accounts with typed confirmation. Accounts with linked cash/investment transfers are blocked so deletion cannot strand a leg or silently change another balance. Archive is the history-preserving alternative.
- JSON exports include the durable archive field. Existing revision triggers mark forecasts stale after archive/restore. Immutable forecast records are unchanged.

## Verification

Automated coverage includes route/deep-link/visibility behavior, the global editor's failed-save and navigation guard, manager save failure and exclusions, typed deletion, privacy masking, independent appearance preferences, and Worker/D1 archive/restore (including schema 015 upgrades, repeated requests, nonzero balances/holdings, locked accounts, pending/MCP pairs, stale proposals, schedule pausing, retained history/exports, deletion safety, and injected failure rollback).

Visual checks use synthetic local data, never a production API. Compare desktop and 390px mobile layouts with the selected prototype, including light/dark and filter themes, account drawers, transaction sheets, Analytics, Investments, Recurring, Settings, empty states, and privacy. The prototype's decorative phone status bar and fixed sample synchronization timestamp are omitted. Summary cards switch to two columns at narrower desktop widths to prevent clipping.

Apply migration 016 before deploying the new Workers/client. Normal root deployment handles this order. The redesign branch is for review; deployment is a separate action.

## Captured preview

These captures use synthetic local accounts with privacy enabled.

![Desktop Accounts page](design/accounts-desktop.jpg)

![Mobile Accounts page](design/accounts-mobile.jpg)
