# Direct cash investment trades

Epic #123 child #128 implements the trade facts from the [accounting contract](investment-accounting.md). A buy links a cash debit to a unit purchase; a sale links a cash credit to a unit disposal. No broker cash wallet is required. The shared metrics, [responsive overview](investment-overview.md) and [holding detail/editor](investment-detail.md) build on this same writer.

## Recording a trade

Use Investments → Record trade or a unit holding’s Buy/Sell actions for the [dedicated editor](investment-detail.md). The existing transaction composer remains available: choose Transfer, and select one cash account and one ETF/stock/crypto holding. Cash → holding records a purchase; holding → cash records a sale. Enter exact units and the actual paid/received cash, then confirm the executed unit price/currency and included fee. Unit amounts are never generated from a current quote or market FX estimate. Unsupported manually priced ETF/stock/crypto holdings use the same unit trade flow. Total-value manual asset acquisition/disposal belongs to #129.

`POST /investment-trades` accepts:

```json
{
  "idempotency_key": "00000000-0000-4000-8000-000000000128",
  "holding_account_id": "synthetic-holding",
  "cash_account_id": "synthetic-cash",
  "type": "buy",
  "quantity": 2,
  "price": 50,
  "execution_currency": "EUR",
  "cash_amount": 40400,
  "fee_status": "known",
  "fee_amount": 400,
  "date": "2026-01-10"
}
```

This records gross EUR 100, an exact HUF 40,400 cash debit and an included HUF 400 fee. The fee is not a second expense. The implied gross settlement ratio is 400 HUF/EUR; it is not a market FX rate and does not determine actual cash. Execution currency is recorded per trade, independently of the current account quote metadata.

Known fees include an explicit zero. Unknown cross-currency breakdown uses `fee_status: "unknown"` and null/omitted fee amount; it does not infer fees from differing amounts. New same-currency trades require a known fee and exact cash equal to settled gross plus the buy fee or minus the sale fee. All supported cash currencies (including HUF) use two settlement decimals, with positive half-up gross settlement rounding. Units/prices retain the declared 12 fractional / 15 significant digit limit and finite 1e12 range; unsupported precision, overflow, underflow and lost unit increments are rejected.

Cash balance changes use [decimal arithmetic](decimal-balances.md), preserving genuine sub-cent openings separately from settlement precision. A narrowly verified legacy floating residue can be recovered during the successful guarded trade and audited without rewriting old trades or position anchors. This does not increase accepted input precision or infer missing opening/cost history.

The result names `trade_id`, `cash_transaction_id` and direction. `PUT /investment-trades/:id` accepts either linked ID and the complete replacement payload, plus the saved `expected_version`. It retains both IDs and effective order, increments `trade_version`, and rejects a stale editor. Deletion through either trade/cash endpoint removes the pair and reverses each delta once. A future-dated investment cannot be posted, and no pending investment lifecycle is added. Dates use the valid local-calendar `X-Client-Date`, with UTC fallback.

The lazy `GET /investment-trades/:id` editor read verifies the reciprocal cash account and saved version without a financial mutation. The dedicated editor uses `DELETE /investment-trades/:id?expected_version=N` to reject deletion after a concurrent edit; existing callers may omit that query. See the [detail contract](investment-detail.md).

## Atomicity, replay and supported history

The writer reads the financial source revision before its account/history snapshot. A unique operation claim checks that revision inside the same D1 batch as account balances, both ledgers, optional observed anchors, event sequence, audits and receipt. A concurrent lock, correction, net-zero history edit or other financial mutation invalidates the claim. It retries a bounded number of fresh snapshots; failed claims and failed statements apply no partial trade. Both accounts must be active and unlocked.

Create/edit request keys are UUIDs scoped to the canonical operation payload and target. Successful receipts last 24 hours; the same key/payload returns the original result, while changed content returns 409. The client retains its key and draft after a failed/uncertain save; changed details or a successful new submission use a new key. The database admits at most 1,000 active receipts and refuses further mutations with 429 until capacity returns. Expired receipts are cleaned in the guarded batch. After the replay window, inspect history before resubmitting an uncertain old request. Receipts are transient and excluded from exports; durable event sequence, trades, cash and audits are included.

Each affected holding replays its supported suffix by local date, durable effective order, then ID. Every intermediate quantity must remain nonnegative, including after moving/reducing a purchase, backdating a sale, or deleting a purchase that funds later sales. Confirmed openings are end-of-day boundaries; new events must be later. An explicit correction or an observation without complete matching history supports only subsequent ordered events, including later same-day events. Complete matching recorded history instead replays every recorded trade from a calculated zero start and validates all prefixes, including earlier linked edits/deletions. It does not require a manual opening; explicit imported openings/corrections stay fixed. The saved current mirror must already reconcile with its supported suffix, rather than being replaced with a shorter trade sum.

## Compatibility and migration 019

Apply migration 019 after 018 before updated Workers/client. It adds nullable execution/gross/fee/net-cash facts, durable event order, a mutation version, the monotonic sequence and expiring receipts. Existing relative rowid order is copied into effective order. Existing anchor rowid boundaries receive matching order boundaries. Pre-existing column values, row IDs, quantities, amounts, links, timestamps and financial revision remain unchanged; no legacy execution currency, fee, cash contribution or acquisition is inferred. Old inconsistencies remain explicit coverage reasons. New financial fields invalidate forecasts; transient receipt/sequence housekeeping does not.

Both API and MCP read the stored facts and coverage. A current account quote currency is not evidence of an old fill currency. MCP adds no investment writes. Cash currency edits that would relabel recorded settlement history are rejected. Existing unlinked trades and legacy cash rows on holdings remain readable/exported and read-only until an explicit reconciliation path establishes their impact; no synthetic cash leg is attached.

The old `/transfers` investment adapter delegates to this writer and requires the same confirmed fields. Cash-side linked edits/deletes also delegate. Standalone investment POSTs are rejected. Ordinary cash-row edits, pending confirmation and cash-transfer retargeting cannot bypass the unit writer. New recurring investment posting is rejected; legacy investment schedules are skipped without consuming occurrences or advancing the processing date, and can be paused. Normal cash schedules/review drafts retain their existing behavior.

Fresh/upgrade Worker/D1 regression tests cover exact cash/units, fees, currencies, event order, stale versions, concurrent/repeated requests, backdated overselling, locks/archive, legacy read-only behavior and injected rollback failures. Migration 019 was also rehearsed on a disposable copy of the supplied October 12 export, preserving all existing columns/row IDs across 16 application tables and financial revision. Integrity, foreign keys, account/export reads and rollback of an injected migration-history failure passed. The source checksum was unchanged, outbound calls were blocked and the private copy was removed. Production migration/deployment remains separate and requires authorization.

The next foundation, [dated manual investment values](manual-investment-valuations.md), implements #129 and migration 020: independent appraisals, explicit total-asset ownership/events and guarded history. Performance and full page/detail redesign remain later epic children.
