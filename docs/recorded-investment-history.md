# Recorded investment history

Issue #150 changes the opening policy after user testing: the normal unit-holding workflow is to start at zero and record every buy/sell with its actual execution date. A separate dated starting position is needed for units imported without their trade history. Investment buys/sells still use reciprocal cash transfers; they do not become ordinary spending/income or MCP investment writes.

## Read provenance and safeguards

For a unit holding whose latest saved anchor is an observation (or absent), the shared read model can expose `holding_position.recorded_history`. It requires the complete ledger within the 10,000-trade global read bound, real nonfuture dates, distinct positive effective order and IDs, supported positive quantities, nonnegative chronological prefixes, and an exact final quantity matching the saved balance. Only the existing tightly bounded ledger-supported decimal residue rule permits a tiny discrepancy. A mismatch, missing units, unsupported precision/order or exceeded bound retains explicit unavailable coverage.

The calculated zero boundary is the end of the day before the first recorded trade. Empty zero-unit holdings have an observed zero state until their first trade establishes that date. Earlier dated first purchases or backdated purchases extend the calculated boundary; all later prefixes are replayed to prevent overselling. Explicit imported openings and corrections are preserved and never replaced by inference. Manual total assets keep their ownership/appraisal workflow.

`recorded_history` means the application's recorded ledger explains its current units. It does not certify missing external broker activity. Add omitted trades or an explicit imported starting position when that ledger is incomplete. The saved observation, account balance and old trades remain unchanged; calculated history is never inserted as an acquisition or opening. Current units with supported tiny residue have a canonical calculated quantity alongside the original saved balance. A financial mutation retains the existing audited recovery and atomic guards.

Account reads, API metrics/history, trade previews and independent MCP readers use the same unit provenance. The history engine combines dated quantities with actual dated prices/FX and preserves market-event, source and missing-value coverage. Matching units do not bypass unknown corporate actions or source limits.

## Legacy cash and costs

The shared metrics/history adapters may read actual cash from an old reciprocal pair only when both IDs point back, dates match, the cash row is posted, its account is a cash account, signs match buy/sell, and no duplicate reverse claim exists. Existing explicit saved settlement facts take precedence. API cash currency edits are blocked for reciprocal investment payments, with the existing source-revision claim protecting the check against concurrent financial writes. Derived trade cash is marked `cash_source: linked_transaction`. This is read-only evidence: no old row/link is rewritten, no new cash movement is created and no standalone trade gains a fake cash leg.

Actual cash and its account currency can support reporting net invested, remaining basis and gains using dated FX, including any fee already inside that payment. They do not prove execution currency or a fee breakdown. Native execution metrics retain their stricter requirements. An unlinked old buy may have a known date, quantity and recorded gross total while its exact settlement/currency remains unavailable; its quantity/value history can still be displayed. Missing cash/cost prompts trade review rather than an unrelated opening form.

## Entry and verification

New zero-unit accounts omit opening inputs; the API saves the observed zero state and derives dated history from purchases. Nonzero imported units require a valid dated opening. Users can explicitly supply a zero opening too; its date remains authoritative. Existing protections, strict decimal input, privacy, failed drafts, archive and atomic source-revision guards remain in force. No schema migration or durable preference is added.

Pure tests cover proof limits, precision, invalid dates/order, negative prefixes and explicit boundaries. Real Worker/D1 tests cover historical values, read isolation, API/MCP parity, exact verified cash, refused ambiguous/pending cash, first backdated purchases, previews and oversell/deletion protection. Component tests cover zero-start creation and targeted guidance. Both private supplied exports are rehearsed on disposable copies; public fixtures contain no personal financial records.

## Confirming standalone historical payment details

`GET /investment-trades/:id/legacy-details` reads a saved standalone unit purchase/sale. `PUT` accepts only `expected_version`, confirmed execution/payment currencies, actual total paid/received and an optional explicitly known included fee. Existing `cash_amount`/`cash_currency` columns hold confirmed external historical settlement, not an instruction to debit a cash account. Shared reporting reads mark this provenance `cash_source: confirmed_legacy`; audit records use `source: confirmed_legacy_details`. Ordinary JSON exports include the stored trade fields and audit, so no new durable table or migration is needed.

The confirmation/correction preserves the original ID, date, quantity, price, recorded total, event order, account balances, anchors and cash rows. It cannot add links, post cash, correct units or replace a bad saved price. Linked/ambiguous rows, unsupported manual-total assets, invalid/future history and inconsistent original totals require their own existing review paths. A valid currency/amount does not repair an inconsistent quantity history or missing historical market/FX coverage.

The API validates currencies and settlement precision, fee state, same-currency known-fee settlement and positive cross-currency gross cash. Unknown fees remain unknown; explicit zero is accepted only as a known fee. A revision/version-guarded D1 update and before/after audit commit atomically; locks/archive are rechecked. A stale or repeated old-version request returns 409 without another audit; reopen to refresh. Concurrent attempts can commit once. MCP continues to read these facts through shared metrics/history but has no investment write tool.

Holding history and Dashboard's unlinked investment edit action open **Confirm historical trade details**, rather than the cash Income/Expense form. The form displays saved facts, has no market-price auto-fetch, requires explicit payment inputs and confirmation, hides values in privacy mode, preserves failed drafts and refreshes dependent snapshots only after a successful save. It never creates a duplicate purchase or cash debit. Existing linked trades retain their normal edit flow.
