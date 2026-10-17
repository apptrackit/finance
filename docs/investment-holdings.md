# Holding metadata and opening positions

Implemented by epic #123 child #127. The [accounting contract](investment-accounting.md) remains the calculation specification; this step implements identity, current-unit coverage and account setup. Trading, dated valuation series and performance calculations remain separately scoped to #128–#132.

## What is stored

`accounts` retains its existing fields and current balance. Migration 018 adds:

| Field | Meaning |
| --- | --- |
| `asset_type` (existing field) | `etf`, `stock`, `crypto`, or `manual`; existing categories are preserved, not guessed from names. |
| `pricing_method` | `market` or `manual`, independently of category. |
| `unit` | `SHARE`, the coin unit, or `ITEM` for a total manual asset. Separate from fiat `quote_currency`. |
| `provider`, `exchange` | Yahoo and an optional exchange for market pricing; a canonical listing symbol remains in `symbol`. |
| `manual_price`, `manual_price_date` | A current per-unit manual price and its actual as-of date for manually priced ETF/stock/crypto holdings. Zero is distinct from unknown. These are not a historical series. |

A manual-category asset retains a **monetary** balance in its existing fiat currency, with total value applied once. Its `unit` is ITEM, and `holding_position.quantity` is null. A manually priced ETF/stock/crypto retains a **unit** balance, including fractional coins; its value is units × saved per-unit price in quote currency. Changing pricing does not turn shares into money.

Migration 018 also adds `investment_position_anchors`, an exported durable table. Each record has account, kind, effective end-of-day date, balance snapshot, optional known remaining cost/currency, trade rowid boundary and creation time. Anchor rows are immutable; a correction appends a record and keeps its predecessors.

- `observed`: migration-time observation of the existing balance. The date is when observed, not an invented acquisition date. Cost and prior opening remain unknown.
- `opening`: a user-confirmed dated opening. Subsequent dated trade quantities must reconcile to the current mirror. It can establish supported unit history from that boundary, not earlier deposits or realized gains.
- `correction`: a current balance correction with no cash or ordinary income/expense record. It does not automatically verify earlier history. A total manual value correction preserves an already known opening cost, without declaring a new contribution.

The current read model always uses stored units, not a shorter sum of investment activity. `holding_position` exposes those units, signed activity, residual, latest anchor, whether history protects identity, and reconciliation status/reasons. A zero residual alone does not prove complete legacy history. A reconciled opening is unit coverage since its boundary, not a claim of complete lifetime cost/cash/return coverage.

## Account setup and reconciliation

The Accounts editor supports explicit category and pricing selection. Market search recognizes ETFs and retains their exchange and canonical symbol. Manual pricing supports units and a fiat price without requiring an API symbol. A manual total asset does not require a symbol either. Empty Investments links into the existing Accounts flow with Investment preselected; opening warnings link back to that account's editor.

New nonzero positions require an opening date. A zero start defaults to the day before the client's local today; the form translates its displayed today zero-start default to that prior boundary so a trade today is allowed. Select an earlier opening date when recording earlier trades. Opening dates are end of day: a new trade must be strictly after the opening date, not silently included in it twice.

A new manually priced ETF can be submitted as:

```json
{
  "name": "Synthetic manual ETF",
  "type": "investment",
  "asset_type": "etf",
  "pricing_method": "manual",
  "balance": 2.125,
  "currency": "SHARE",
  "quote_currency": "EUR",
  "manual_price": 120.25,
  "manual_price_date": "2026-01-15",
  "opening": { "balance": 2.125, "date": "2026-01-10" }
}
```

For an existing account, `PUT /accounts/:id` accepts `opening` to confirm an earlier boundary and optional known cost. For example, a current holding of five units with two units bought after January 10 can confirm an opening of three units on January 10. A different opening is rejected; no trade or cash row is created to make it fit. Future-dated legacy activity must be resolved before this confirmation.

Current quantity/value corrections use `balance` plus `expected_balance` (and optional `expected_updated_at`) from the saved account snapshot. `correction_date`, if supplied, must be the client's today. The UI retains these original guards even if refreshed account props change while the draft is open. A stale save returns 409 and preserves the draft. An investment account cannot use ordinary `adjustWithTransaction` or split income/expense adjustments.

New unit/value/price inputs support up to 12 fractional and 15 significant decimal digits, with maximum 1e12 and no negative values. SQLite REAL is still finite precision. Existing records are not rounded or rejected by migration. Account/holding quantity displays support the same 12 fractional digits; display formatting never changes the saved number. Fiat cash settlement precision belongs to #128, not this non-cash opening record.

## Identity, protection and atomicity

Instrument symbol, category/unit interpretation, quote currency, pricing method, provider and exchange are protected once an account has a nonzero position, nonzero anchor or ledger history. An edit that would reinterpret it returns 409 and leaves data/audit/source revision unchanged. Stock ↔ ETF classification is the safe exception because it keeps the same units and facts. Changing between cash and investment requires a separate account. Unknown legacy quote metadata is preserved during unrelated edits, rather than defaulted to USD.

New investment creation batches account, opening anchor and audit. Investment updates claim the complete prior account snapshot using a unique audit row; account and optional anchor writes depend on that claim and commit in the same D1 batch. A changed/locked/archived account or failed anchor/audit write causes no partial correction. Both API checks and D1 guards protect the new anchor and metadata paths. Existing archive, restore, linked-transfer deletion and schedule-pause rules remain in force.

API, client and MCP share the current value/unit read rules. Manually priced unit holdings do not make market-price requests. A missing price stays unavailable; a zero-unit position contributes known zero without requiring a quote or FX. MCP remains read-only for investments and retains its warned partial converted-total policy.

## Migration, export and source revision

Apply `018-investment-holding-metadata.sql` after 017, before deploying any updated Worker/client. It adds columns/table and creates observed anchors for active, locked and archived holdings. It changes no pre-existing column value, rowid, timestamp, cash balance, unit quantity, trade link or audit. Existing stock/crypto/manual categories are kept; no ETF identity, purchase, historic cost, currency or price is fabricated.

The metadata baseline preserves `financial_data_revision`. Subsequent account metadata and anchor insert/delete changes invalidate financial forecasts through source-revision triggers. The new financial table is included in complete JSON exports. Existing archive protection is extended to all new account fields; old applied migrations are untouched.

Fresh and preceding-schema D1 checks cover preservation, new opening validation, exact small units, source revision, locks/archive, metadata rejection, API/MCP parity, idempotent migration tracking and failed/concurrent writes. A disposable copy of the supplied October 12 export was also restored and upgraded in both SQLite and the compiled Worker/D1 runtime. All old application columns and rowids, prior migration history and source revision were preserved; integrity/foreign keys passed. An injected migration-history failure rolled back the full D1 schema/data batch. The original export was unchanged, private copies were removed and outbound requests were blocked. A sanitized report is retained outside Git; no private export data belongs in the PR.

The export includes `DELETE FROM sqlite_sequence` even when it has no AUTOINCREMENT table. The rehearsal adapter omits only that internal cleanup when restoring into a blank database; it does not edit the original file or omit application records. This is a backup restore quirk, not a migration 018 repair.

## Remaining epic work

Current quantity/value and metadata work end to end. Legacy invested-capital/gain figures that depended on inferred USD, trade-only quantity or unverified cost are withheld rather than presented as verified results. The existing ledger remains readable/exported. #128 supplies the reconciled execution/cash/fee model; #129 adds dated manual valuation history; #130 normalizes market/FX inputs; #131/#132 implement the reviewed cost, returns and history calculations. The full page and detail redesign remain #133/#134.

Do not deploy an intermediate epic as the completed investment redesign. Child PRs target `epic/123-investment-rework`; stop at each for review, then integrate the completed epic into main only with explicit user authorization.

The next foundation, [direct cash investment trades](investment-trades.md), implements #128 and migration 019. It extends anchor boundaries with durable event-order boundaries, records confirmed executions and blocks unsupported cash/schedule paths from treating units as money. Dated manual values, performance and the full redesign remain later children.
