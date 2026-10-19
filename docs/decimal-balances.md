# Decimal balance arithmetic

Cash postings, edits, deletions, transfers, pending confirmation, account adjustments and recurring execution use `shared/decimal-balance.ts`. It adds the shortest recorded decimal representations with integer coefficients, then checks that the result survives conversion back to an API/D1 number. For example, `0.1 + 0.2` saves `0.3`. A lost increment or nonfinite result rejects the complete mutation instead of saving mismatched ledger and balance values.

This changes arithmetic, not storage: balances remain SQLite REAL/API numbers, with no new migration or dependency. It does not provide arbitrary precision. Genuine sub-cent cash is preserved; balances are not globally rounded to two decimals. Trade settlement retains its separate two-decimal cash rule. Holding quantities retain the declared 12 fractional / 15 significant digit input limit, so nine-decimal crypto quantities remain supported.

## Atomicity and concurrent writes

`CashLedgerRepository` plans decimal balance changes and claims the original account balance/timestamp, identity and protection state inside the same D1 batch as the ledger, audit and optional recurring occurrence. A failed account claim can refresh account balances and retry up to five times. Original transaction and schedule snapshots stay pinned throughout; a stale editor cannot silently overwrite newer facts. Explicit account corrections retain their original source-revision guard and do not retry a changed correction snapshot.

Pending ordinary confirmation and linked MCP review-pair confirmation use this writer too. Repeated confirmation posts once; future dates, protected accounts and stale row changes remain guarded. MCP itself gains no posting or account-balance write capability. Investment trades retain their existing revision/version/receipt guards and use decimal cash addition in that batch.

The trade editor keeps strict validation for entered units. When a stored holding mirror has unsupported precision, it requests the authoritative server preview instead of rounding locally or blocking the request before evidence can be checked. Save remains disabled until that preview supplies valid resulting units and cash; refused or unavailable previews preserve the draft and block posting.

## Conservative recovery of old arithmetic residue

Reads and migrations do not clean balances. A successful financial mutation may recover a tiny legacy residue only when recorded ledger evidence supports it:

- Cash must exceed the existing 15-significant-digit precision check. Its complete posted ledger must contain at most 10,000 rows, each already expressed in whole cents, and replaying those rows with the old binary addition must reproduce the raw stored balance exactly. Valid sub-cent openings and balances merely near a cent total are left intact.
- A holding balance must fail the existing unit precision check. Its recorded signed quantities must support a representable candidate; the candidate must still pass the original unit validator. The observed/opening boundary and supported suffix must also reconcile. This does not permit new inputs with unsupported precision.
- Both paths cap the difference by the floating arithmetic error budget `Number.EPSILON × (row count + 8) × (absolute balance + sum of absolute flows)` and by `supported quantum / 1024` (cash quantum `0.01`, holding quantum `1e-12`). Missing, incomplete, materially different or excessive evidence does not authorize recovery.

The write records the raw balance, recovered value and evidence count in its atomic audit. Recovery evidence is protected by the financial source revision; failed saves roll it back with the rest of the mutation. Old transactions, execution facts, position anchors and unknown historical costs are not rewritten. A tiny recovered residue does not establish a verified opening, complete history or investment return.

`decimal-balances.test.ts` exercises real Workers and disposable shared D1, including ordinary/transfer/trade/recurring paths, repeated pending confirmation, mixed concurrent writers, failed-write rollback, preserved sub-cent openings, genuine unsupported units and lost increments. The unit suite independently checks decimal addition and recovery bounds. Private-export rehearsals also exercise the existing holdings/cash, migrations, source reads, protections and round trips without manual balance corrections; only sanitized outcomes belong in review evidence.

Main integration (#169) routes split create/edit/undo/delete and pending confirmation/decline through the same decimal CashLedgerRepository. Split metadata and complete membership snapshots join its account/row claim, and old members detach only inside that guarded batch so cleanup triggers cannot remove metadata mid-replacement. Bounded account retries retain the original split/line snapshots and any requested adjustment balance. Pending edits/declines do not change balances; confirmation applies exact line sums once.
