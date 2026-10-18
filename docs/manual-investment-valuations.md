# Dated manual investment values

Epic #123, child #129; follows migrations 018/019 and the [accounting contract](investment-accounting.md).

## What an appraisal changes

`investment_valuations` stores one observation per holding and effective calendar date. `kind` is `total` for a manual-category asset, or `per_unit` for a manually priced ETF/stock/crypto. Each row records its actual fiat currency, source, version and creation/correction timestamps. Zero is known zero; missing observations are unknown.

An appraisal changes neither cash, units, opening cost nor contributions. The current mirror is the latest observation: `accounts.balance` for an owned total asset; `manual_price`/`manual_price_date` for a unit holding. A backdated correction cannot replace a later current value. Total assets that are unowned/disposed retain current value zero regardless of later price observations. All writes use a financial-revision/snapshot claim and one D1 batch for history, mirror and before/after audit. Failed or conflicting writes change none of these.

A same-date correction updates the existing observation, incrementing its version and auditing old/new values. Dates, identity, kind and currency cannot be relabelled. The expected row ID plus version protects an editor even if a trade edit removes/replaces an acquisition-generated observation. Exact retry after a lost successful response is a no-op. There is no independent hard-delete appraisal API; correct an incorrect observation on its recorded date.

`GET /accounts/:id/valuations` returns up to 100 observations (maximum 200 using `limit`), a `next_cursor`, and `valuation_at`. Use `before=<next_cursor>` for older pages and `at=YYYY-MM-DD` for the latest known value at or before a past/current date. No future price fills earlier history. The step chart carries the last observation forward through the response date. It shows asset appraisals/unit prices; portfolio ownership/return history is #132.

`PUT /accounts/:id/valuations` accepts:

```json
{
  "effective_date": "2026-01-15",
  "amount": 120.25,
  "expected_id": null,
  "expected_version": 0
}
```

For a correction, supply the exact observation's ID and version. An absent date uses null/0, not the version of a carried earlier observation. The Worker validates the browser's `X-Client-Date` (UTC fallback), rejects future dates, and preserves supported holding precision (12 fractional / 15 significant digits, maximum 1 trillion).

`manual_valuation` in API account reads and MCP account/portfolio reads contains the latest observation, as-of date, age in calendar days, status and `stale_after_days: 90`. The reminder starts at age 90. It does not invalidate a last known appraisal. API account list ages use the client calendar; MCP uses its UTC reporting calendar. Missing legacy cost remains explicit coverage in shared investment metrics; a known current appraisal does not establish historical costs or returns.

## Ownership and cash events

A total manual asset is one indivisible ITEM. An opening anchor can explicitly record `owned: true` even at a zero appraisal, or `owned: false` with zero current value for an asset awaiting purchase. New setup defaults to owned for a nonzero value and unowned for zero. Legacy nonzero observed anchors establish ownership only at that observed boundary; legacy zero anchors without an explicit ownership flag have unknown ownership and require reconciliation before trading. A new unowned opening cannot carry positive remaining cost; an owned asset appraised at zero can. Confirming previously unknown ownership activates the latest saved appraisal in the same guarded account/anchor/audit batch. Unknown ownership is exposed as unverified coverage, rather than a reconciled empty holding.

The existing cash transfer composer records purchases/sales through `/investment-trades`, with exactly one ITEM, an executed **total** price in the asset's saved valuation currency, and the actual separate cash paid/received (including fees). The normal settlement, version, receipt, lock and source-revision safeguards remain. Cross-currency cash settlement is supported without inventing historical FX. `investment_transactions.asset_event` explicitly distinguishes `acquisition`/`disposal` from old unverified history and ordinary unit trades.

An acquisition supplies an initial price observation on its execution date when no appraisal already exists there. It is separate from its exact cash/cost facts. Later user corrections become independent appraisals. Editing/removing an acquisition replaces/removes only its uncorrected acquisition-generated observation, auditing the change; a user appraisal is preserved. Source trade IDs are historical provenance and may refer to a trade retained only in its deletion audit.

Every ownership prefix must be valid: no double acquisition, disposal before ownership or partial disposal. Editing/deleting an earlier event cannot invalidate a later disposal. Edits cannot move manual events onto another holding or turn unit trades into total assets. Reversing a sale restores ownership and its latest known appraisal, reversing the linked cash once. A confirmed full disposal with zero executed price/proceeds and known zero fee is supported through `/investment-trades`; the legacy `/transfers` adapter still requires positive legs. A zero appraisal alone never disposes of an asset or permits archive. Archive requires known unowned/disposed state; an unknown legacy zero must first be reconciled. Openings cannot replace recorded asset events or erase known ownership. Imported opening cost never creates a second cash debit.

## Upgrade, export and safeguards

Apply **020-manual-investment-valuations.sql** after 019 before deploying either Worker or the client. It adds the durable observation table, nullable anchor ownership and nullable trade event marker. All pre-existing columns, row IDs, balances, quantities, links, costs, timestamps, audits and financial-source revision are unchanged by the migration. Locks/archives remain protected; triggers cover valuation writes, metadata identity, manual events and archive of an owned zero-value asset.

Existing total manual balances become observations at the UTC upgrade boundary, with unknown earlier appraisal/cost history. Existing valid past per-unit price dates are retained; otherwise the current saved price is observed at upgrade. Unsupported negative/out-of-range legacy total values are preserved on their account and left without a fabricated valid appraisal. No legacy trade is labelled acquisition/disposal automatically.

JSON export includes every valuation, the new anchor/trade fields and audits. Subsequent valuation changes invalidate forecast source revision. MCP remains read-only for investments; no valuation/trade write tool is added.

Verification covers fresh and populated upgrades, pre-existing-column preservation, exact API/client/MCP value semantics, backdated/same-day corrections, retries/stale editors, calendar-age boundaries, known zero ownership, cash pairs, ownership prefixes, locks/archives, exports and injected rollback failures. The user export is rehearsed only in a disposable D1 copy with outbound requests blocked; private rows/copies are never committed or published. Final epic integration still belongs to #135, including the previously tracked mixed-writer concurrency audit.
