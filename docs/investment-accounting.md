# Investment accounting contract — version 1

Status: implementation contract for [#126](https://github.com/apptrackit/finance/issues/126), under epic [#123](https://github.com/apptrackit/finance/issues/123). This PR changes documentation and synthetic examples only. It does not change schema, balances, endpoints, or displayed calculations. The rules below are requirements for the child implementations, not a claim that today's app already follows them.

The product keeps direct **cash ↔ holding** entry. A holding account represents one instrument or manually valued asset, not a brokerage cash wallet. `investment_transactions` remains the investment activity ledger; linked `transactions` rows remain the actual cash ledger. The completed #122 / #125 relationship is the foundation.

## 1. Evidence and implementation owners

The inventory below was traced at epic commit `ce12e97` (after #125). File links identify executable paths rather than the unused API route registry. These observations are compatibility risks, not desired behavior.

| Concern | Current implementation | Required owner |
| --- | --- | --- |
| Current units | [Investments utils](../client/src/components/investments-module/utils.ts) sums signed trade quantity and ignores starting `account.balance`. [Dashboard data](../client/src/hooks/useFinanceData.ts) and [MCP portfolio](../mcp/src/finance-service.ts) value stored balances. | #127 quantity/anchors; #131 calculations |
| Starting balance and corrections | [Account service](../api/src/services/account.service.ts) creates an account with a balance but no opening trade. An edit can overwrite balance or create ordinary adjustment rows, including on an investment account. | #127 explicit anchors/corrections; #129 manual values |
| Linked trades | [Transfer service](../api/src/services/transfer.service.ts) creates reciprocal cash-debit/buy records in the [pair repository](../api/src/repositories/investment-transfer.repository.ts). It rejects investment-source transfers. [Transaction service](../api/src/services/transaction.service.ts) edits the pair through cash and handles pair deletion; investment-side deletion also resolves the pair. | #128 linked sale/create/edit parity |
| Standalone trades | `POST /transactions` on an investment account writes history and then units as independent writes. `POST /investment-transactions` writes history without adding units; its standalone deletion subtracts units. Its supplied `total_amount` need not equal quantity × price. Investment branches do not share ordinary pending-date handling. See [transaction service](../api/src/services/transaction.service.ts), [investment service](../api/src/services/investment-transaction.service.ts), [repository](../api/src/repositories/investment-transaction.repository.ts), [live routes](../api/src/index.ts). | #128 unify writers and reject unsupported future posting |
| Currency and cost | Accounts have `currency` and optional `quote_currency`; trades have price/total but no execution currency, actual fee or reporting-date rate. Client portfolio assumes account trading currency; MCP portfolio/activity still assumes USD for market trades. Cash pair amount may differ from quantity × price. | #127 metadata; #128 execution facts; #131 parity |
| Price lookup | [Yahoo price utility](../api/src/utils/yahoo-finance.util.ts) can fall back to current price for a past transaction. [Market service](../api/src/services/market-data.service.ts) exposes individual charts; previous-close/change/session data are not a validated common contract. | #128 execution prices; #130 market inputs |
| Manual assets | Investments uses `account.balance` as value, calls it invested capital, and uses transaction net as gain. MCP uses the manual balance as value and withholds manual gain. There is no dated valuation table. | #129 valuation history; #131 metrics |
| Aggregate scope | Investments includes all active investment accounts. MCP `portfolio` omits `exclude_from_net_worth`; Dashboard investment fetch includes all active holdings and [Dashboard](../client/src/pages/DashboardPage.tsx) adds that entire investment value to cash net worth, without applying investment net-worth exclusions. | #131 explicit view policy and Dashboard exclusion fix; #133 labels |
| Missing inputs | [Shared FX](../shared/currency.ts) validates rates and returns unavailable conversion; the client withholds complete totals. MCP intentionally warns and reports partial converted totals. Some legacy missing-price paths still produce zero. | #130 source states; #131 output coverage |
| Charts | [Instrument chart](../client/src/components/investments-module/InvestmentChart.tsx) hardcodes dollars and keeps one marker per nearest quote, overwriting multiple trades. It is not a portfolio series. No combined historical quantity/FX/manual valuation path exists. | #132 portfolio series; #134 details |
| Refresh/export/revision | [Investment snapshot](../client/src/components/investments-module/data.ts) and [hook](../client/src/hooks/useInvestmentData.ts) publish complete session snapshots. [JSON export coverage](../shared/data-export.ts) names durable tables. Migrations 010/014/016/017 govern financial revisions, posted/review semantics, archives and transfer links. | All children preserve these boundaries |

## 2. Stored facts and coverage

### Holding identity and pricing

- Category is `etf`, `stock`, `crypto`, or `manual`. Pricing method is independently `market` or `manual`. A manually priced ETF remains an ETF. Existing `manual` category maps to manual pricing; existing stock/crypto categories are retained. Do not guess ETF identity from names or sample symbols.
- Unit is separate from fiat: market ETF/stock uses `SHARE`; crypto uses its coin unit. Quote/execution currency is fiat, e.g. EUR. Provider symbol includes its listing/quote pair; an account's human label can differ.
- For category `manual`, version 1 uses one indivisible asset (`ITEM`) and a **total** value in a fiat valuation currency. Metadata such as physical weight is descriptive, not an implicit share count. Partial manual-asset disposal is unsupported; full disposal must be an explicit asset event. Manually priced ETF/stock/crypto instead retain their units and store **per-unit** manual prices. Every valuation records `total` versus `per_unit`; never multiply a total property/gold value by units again.
- `accounts.balance` remains a current quantity mirror for ETF/stock/crypto, including manual pricing; for legacy manual-category assets it remains a current monetary-value mirror. Keep that compatibility explicit in all consumers; pricing method alone cannot determine the balance meaning.
- Changing category, unit, instrument or valuation currency with existing history must be blocked unless an explicit conversion/correction preserves each dated fact. Changing provider mapping for the same listing can be audited; it must not reinterpret old execution currency or apply split adjustments twice.

### Current quantities, openings and reconciliation

**Updated product decision (#150):** the user records each purchase/sale and wants matching recorded trade history used directly. The implementation can calculate a zero start immediately before the first supported trade when the complete bounded ledger explains current units and has no negative prefix. This is read provenance, not a saved imported opening or proof about an external broker. Explicit nonzero openings/corrections and material mismatches keep their boundaries. Verified reciprocal posted cash legs can supply actual cash/currency without inventing execution currency or fees. The earlier conservative migration observations below remain preserved facts; the recorded-history read policy supersedes requiring manual zero-opening confirmation for every matching legacy holding. See [current rules](recorded-investment-history.md).


Stored current quantities are recorded facts. A shorter activity list is not evidence that the rest of the position never existed. Preserve balances and ledger rows during migration.

A new nonzero holding requires an opening boundary with quantity and a user-supplied effective date; known cost is optional. The boundary is an end-of-day position, followed only by later dated events. Same-day opening/trading requires an explicit sequence or a prior-day opening; do not silently replay the opening day's trades twice. New zero-start holdings have a known zero opening before the first trade.

For an existing holding, record an **observed current anchor** at the upgrade boundary, with existing quantity/value and unknown historical cost/date coverage. This is not an acquisition, contribution or opening backdated to the first trade. A residual `stored units − signed trade units` is a reconciliation warning, not a fabricated buy. Even a zero residual does not prove complete history because legacy writers and overwrites differ.

Historical unit replay can use complete matching recorded trades under the #150 policy, or a dated opening/correction that reconciles with stored current units. Prior history stays readable while unsupported derived metrics are unavailable. Corrections are dated, audited and non-cash; neither an observed anchor nor a correction is automatically invested capital. An imported opening with known remaining basis can support unrealized gain, but does not establish earlier realized gains or lifetime cash contributions. Those remain unknown unless separately confirmed. Block a conflicting write and request explicit reconciliation instead of replacing stored units with the trade sum. Known later activity can extend the observed boundary without proving earlier history.

Use effective date, a durable per-holding same-day order, then stable ID for replay. For old rows, preserve existing relative `rowid` order in the migration; do not depend on `created_at` being present, unique or chronological. A legacy ordering conflict is flagged rather than fixed by sorting buys first. Backdated changes must replay the affected suffix and reject any negative supported quantity. Future-dated legacy rows remain readable/flagged; their inconsistent balance impact is not silently undone in a metadata upgrade.

### Trade and cash facts

A new market/unit trade records positive quantity `q`, executed unit price `p`, execution currency `E`, gross execution amount `G = q × p`, effective local date/order, and its buy/sell direction. The price is an entered/confirmed execution fact. A quote is only a suggestion; never substitute today's quote for a past fill.

A linked trade also records the **exact net cash** `M` in the cash account currency `C`, using the cash row as the authoritative ledger amount. Buy: cash delta `−M`, units `+q`. Sell: cash delta `+M`, units `−q`. Reciprocal IDs, amounts, unit delta, audits and replay marker commit together. The linked row is excluded from ordinary income/expense aggregates. A fee already included in this row is not also posted as a second expense.

Version 1 accepts an optional explicit fee `f >= 0` in **cash currency C**, included in `M`; fees in another currency/account require a future separate flow. Fee state distinguishes `known` (including explicit zero) from `unknown`. If `E == C`, known fees require buy `M = G + f`, sell `M = G − f` within the currency's settlement-rounding policy. If fee is unknown, require the user to enter/confirm it for new same-currency trades rather than classify a discrepancy automatically.

For a cross-currency trade with a known included fee, gross cash is buy `M − f`, sell `M + f`. Its ratio to `G` is the **implied settlement conversion**, not a pure market FX rate or a way to infer a fee/spread. It must be positive. To express the explicitly known fee in execution currency, divide it by that implied ratio. Exact cash `M` never comes from that derived ratio. If fee breakdown is unknown, retain `M` and `G`, but withhold fee-separated/native basis metrics needing the breakdown. Reporting-currency basis may still be known from exact cash and dated reporting FX.

Existing standalone trades remain standalone and never acquire a fake cash leg. Keep their quantity, price and recorded `total_amount` even if inconsistent with `q × p`; flag the discrepancy. Reconciliation must first establish their unit impact and currency. Without confirmed external contribution/proceeds, they do not provide complete net-invested or cash-based gain history. Explicit historical-details confirmation now supplies missing execution/settlement/fee facts without moving cash a second time; see [recorded-history rules](recorded-investment-history.md#confirming-standalone-historical-payment-details). New UI trades use linked cash entry; alternative standalone writers must delegate to one atomic invariant-preserving service or be read-only until supported.

Reject new future-dated investment posting using `X-Client-Date` (UTC fallback). No pending investment-pair lifecycle is added. Keep ordinary pending/upcoming/MCP review rows outside these calculations and preserve existing cash-to-cash confirmation semantics. Locked/archived accounts cannot be mutated. Replays must apply once; idempotency scope covers payload/account pair and rejects reuse with different content.

### Coverage is per metric

A known current quantity and valid quote can give a current value with unknown basis or opening date. A known opening value can start a later range without proving lifetime performance. A zero holding needs no quote to contribute known zero **current** value, but its past ownership still needs historical inputs.

Each read exposes status/reason and affected holding/date/currency, independently for quantity, value, cost, cash flows, daily move and history. Core reasons: `unknown_opening`, `quantity_mismatch`, `unknown_cost`, `unknown_execution_currency`, `unknown_cash_flow`, `unknown_fee_breakdown`, `missing_price`, `stale_price`, `missing_fx`, `missing_valuation`, `ambiguous_event_order`, `unsupported_event`. Field names can follow existing DTO conventions, but a null must not become zero at a mapper boundary.

API/client **complete** aggregate amounts and allocation weights are unavailable if any included nonzero holding lacks required value/FX. Native known amounts remain visible. MCP retains warned **partial** totals and covered/excluded metadata; an omitted amount is not described as complete. Current value coverage does not imply complete return coverage. An excluded holding must not prevent a total it is not part of.

## 3. Calculation rules

### Currency conversion and basis

Use the existing `shared/currency.ts` direction: rate tables contain units of each named currency per unit of the named base. `convert(x, S, R) = x / rate[S] × rate[R]`, with base rate exactly 1. Same currency needs no external rate. Missing/nonpositive/nonfinite required rates make that conversion unavailable.

Current value uses a quote/as-of and current FX/as-of. Historical values use the dated price and dated FX for that observation; cash contributions and reporting cost use FX on the cash-flow date. Never retranslate accumulated historic cost at today's FX. Record provenance/dates; market-cache refresh does not rewrite execution or cash facts.

Maintain two optional cost ledgers: execution-native basis (for a holding whose execution currency is fixed) and reporting-currency basis. Convert each acquisition into reporting currency **when acquired**, using exact cash when available. A supplied native opening basis with unknown acquisition dates is not converted at the opening/anchor day's rate and called historic reporting cost; require confirmed reporting basis or the dated acquisition facts, otherwise withhold that reporting gain. Realized and unrealized report gains derive from that reporting basis, not from converting the final native gain at today's rate. If the reporting currency changes, recompute from dated source facts. Do not relabel a prior HUF total as USD. Unknown historic conversion can withhold reporting gain while leaving native gain available.

For units `Q > 0` and known remaining basis `B`:

- Average remaining cost per unit `A = B / Q`.
- Buy `q`: `Q' = Q + q`, `B' = B + acquisition_cost`. Reporting acquisition cost is exact `M` converted from cash currency at acquisition date, including known/unknown included fees already present in `M`. Native acquisition cost is `G + explicit fee in E`, and is unavailable if its fee/currency breakdown is unknown.
- Sell `q <= Q`: remove `basis_sold = B × q / Q`; `B' = B − basis_sold`, `Q' = Q − q`; realized gain is net proceeds minus `basis_sold`, in the same ledger/currency. At full sale set remaining units/basis to exactly zero within the validated unit precision. Keep realized gain and contribution history after closure.
- Rebuy starts from the remaining basis, never an average over every historical buy. If earlier unknown-cost units remain, a new buy does not make their basis known. A complete disposal leaves a known zero **remaining** basis so a later buy can have known current basis; earlier realized/lifetime gain remains unknown.

Apply currency/unit precision only at the defined boundaries: parse finite decimal drafts, retain fractional units (including small crypto quantities), do not round units as fiat. Do not claim arbitrary decimal precision from SQLite REAL. #127/#128 must declare supported unit precision and settlement minor units, reject overflow/underflow and test rounding. Display formatting never changes stored cash or units.

### Metric dictionary

All formulas use the same included holding universe and the selected reporting currency R unless labeled native. Unknown required inputs yield null with coverage. Values below are **not** interchangeable.

| Visible metric | Formula and sources | Coverage and denominator |
| --- | --- | --- |
| Quantity | Reconciled current mirror / dated anchor plus ordered signed unit events | Known current units can survive incomplete historical replay. Negative holdings unsupported. Manual-category total assets display one item while owned. |
| Price | Valid market unit quote or dated manual per-unit value, with its actual fiat currency/time | Missing is unavailable, not zero. A known zero manual valuation or confirmed worthless price is valid zero, distinguishable from absent quote. |
| Current value V | Unit holding `Q × price`; manual total asset uses latest total valuation directly; convert each to R | Current market/FX provenance required. Stale last good value may remain visible with stale status; not fresh daily change. |
| Net invested N | Confirmed cumulative external contributions minus withdrawals, each converted on flow date | Can be zero/negative. Includes exact linked purchase cash and net sale proceeds, plus confirmed opening contributions; not today's value, cost basis, or the raw sum of legacy trade totals. Unknown old flows make lifetime N unavailable. |
| Remaining cost B / average cost | Moving weighted-average basis described above | Zero remaining units: B = 0; average cost is unavailable, not zero. Unknown old cost is not zero. Native and reporting bases can have different coverage. |
| Realized gain L | Sum of net sale proceeds minus the removed basis | Sold holdings retain it. Unknown disposed basis withholds affected realized/lifetime totals, even after full liquidation. |
| Unrealized gain U | `V − B` in the same currency/basis ledger | Known current value and known remaining basis required. At known full disposal U = 0. |
| Total gain | `L + U`; with complete acquisition/cash history, also `V − N` | Only a confirmed opening contribution counts in N; opening remaining basis alone proves neither N nor earlier L. Both gain identities must reconcile when fully covered; do not use a current observed anchor as a purchase. |
| Holding Return column | Amount = total gain; percentage = daily-linked estimated return since the earliest fully covered performance boundary | Label the percentage's covered start/method. Do not divide gain by N. If history is insufficient, keep known gain amount and show percentage unavailable. Detail can separately show unrealized gain and U/B when B > 0, explicitly labeled. |
| Native price change today | `price_latest − previous_session_close`; percent divides by previous close > 0 | Use the instrument's exchange session; crypto compares the defined UTC daily close. Stale quotes/missing previous close withhold the change. This is an instrument price change, not account profit. |
| Portfolio Today | Flow-adjusted gain for today's local reporting day using known prior boundary and current as-of values | Exclude manually priced holdings from the **market Today** statistic and name excluded/stale/missing coverage. Include FX movement for included foreign values. The market subset must be explicit, not presented as whole-portfolio complete. Its percentage uses the daily formula below for that same subset. |
| Allocation / portfolio weight | `holding value / total value × 100` | Complete included current value and total > 0 required. Empty/zero-value portfolio has no percentages, not NaN or fictitious equal weights. Type/quote-currency allocation sums the same positions. |
| Range gain | `V_b − V_(a−1) − sum(C_d − W_d)` for all dates a…b inclusive | Complete start/end values and external flows required; not lifetime gain minus deposits guessed at current FX. May be known even when intermediate return percentages are unavailable. |
| Range estimated return | Geometrically linked daily factors below, ×100 for display | Requires every active daily factor, same universe and consistent date/flow timing. No gain/N fallback. A zero starting value alone does not force null if confirmed contributions fund the first active day. |

### Local dates, history and return timing

Version 1 chart ranges are local reporting **calendar days**, with `a…b` inclusive and opening value at close of `a−1`. YTD begins January 1, month/year subtraction clamps to valid calendar dates, and All begins at the earliest supported boundary (not an invented account creation date). Preserve actual business dates as YYYY-MM-DD, not UTC-midnight conversions that shift user dates.

A historical daily point includes that day's ordered events and final valid observations. Use raw/unadjusted price history with the contemporaneous raw units. Do not multiply today's split-adjusted prices by old raw units. Historical split support requires corresponding unit events; otherwise mark the affected history unsupported. Closed/archived holdings contribute while owned, zero after disposal, and retain contribution/realized history. Archive/lock status is not a price or zero-value event.

Known prior close can carry through scheduled non-trading dates, with original source time. It cannot fill an unknown pre-listing period or conceal an outage. A manual value carries forward from its effective date until changed, never backward from a future appraisal. An unknown opening cannot be filled with today's units. Revisions to trades/anchors/valuations invalidate the affected historical suffix; revise cached market/FX observations using source revision metadata separately.

Daily end points use the last valid observation **at or before** the reporting cutoff, with session timestamp and coverage. Current local day is an explicitly provisional point at a common response as-of, not tomorrow's close. Non-aligned exchanges/FX and crypto observations carry their real dates; exact timestamp FX is not claimed from daily inputs. A price session's native Today label can therefore differ from the portfolio's local Today range; show both source times.

Because the app owns holdings but no broker cash wallet, a buy is an external contribution to the investment universe and a sale is a withdrawal. For the daily estimate, positive contributions `C_d` are treated at start of day and positive withdrawals `W_d` at end of day:

```
D_d = V_(d−1) + C_d
F_d = (V_d + W_d) / D_d
r_d = F_d − 1
estimated_return(a,b) = product(F_d for covered active days) − 1
```

Use exact cash including included fees in C/W, not execution gross plus a second fee. Do not net C and W before the denominator: a same-day round trip has positive funding even if net flows are zero. The daily formula is an application timing approximation for intraday trades, **not an exact trade-time TWR or a GIPS compliance claim**. The UI label is **Estimated return**, with timing/method in its tooltip. The standard distinction between exact subperiod valuation and approximate cash-flow methods, plus consistent flow timing and geometric linking, is described in the [CFA Institute GIPS handbook, calculation methodology](https://www.gipsstandards.org/standards/gips-standards-for-firms/gips-standards-handbook-for-firms/). The particular mixed timing above is this app's documented convention.

If D = 0 and V = C = W = 0, skip an inactive day (factor 1 only when its zero state is known). A range with no active days has no return percentage, rather than a displayed 0%. If D <= 0 otherwise, or a numerator is negative, the factor is unavailable. A valid zero factor represents complete loss and stays zero when linked. Full liquidation does not reset historic gain; subsequent confirmed funding begins another active segment linked by the same rule. Missing active days invalidate the selected range percentage; never bridge them by silently skipping. No annualization is required. Dollar gain is not the sum of percentage returns.

### Manual observations and unsupported events

A manual acquisition records known cost/contribution and its own linked cash movement when funded through the app; imported/legacy cost does not create a second debit. A revaluation only updates dated value/history/current mirror and audit, never cash, units or invested capital. Known zero is allowed. For a per-unit manual price, units still follow trade history; for a total manual asset, full disposal requires a separate explicit owned/disposed event and known proceeds. Ordinary balance overwrite is not the future valuation workflow.

Default stale-manual attention threshold is **90 local calendar days** since the last effective observation, with exact last-valued date/age exposed. This is an app reminder, not a claim that an appraisal is wrong; carry-forward history remains a known last observation, not live market performance. A correction to the same effective date updates that one observation under snapshot guards, preserving old/new values in audit rather than creating two competing prices. Future valuations are rejected; backdated corrections do not replace a later current value.

No automated splits, dividend/reinvestment feed, in-kind transfer engine or tax-lot reporting is introduced. Preserve any existing cash dividend as cash history without relabeling it a linked sale. If known distributions/in-kind/split events make an investment's performance incomplete, flag it; price appreciation alone is not silently called total return. An unsupported history event never blocks showing independently known current value. Dedicated event support can be a later feature.

## 4. View scopes and behavior

- Investments page: all active investment holdings, regardless of `exclude_from_net_worth`. Category/allocation selection filters the holdings presentation; portfolio headline and chart remain the full investment universe and are labeled accordingly. A holding detail/history explicitly scopes to that holding, including its closed history.
- Dashboard/net worth and MCP `portfolio`: respect `exclude_from_net_worth` for their investment aggregate; native current value for the same included account still agrees. Preserve MCP's warned partial-FX policy. Do not change cash balance/spending-estimate filters to mimic net-worth filters. Cash-balance analytics excludes investments by its own definition.
- Historical Investments series uses the active **and archived** investment universe over ownership dates. Net-worth exclusions are a current view policy, not time-varying historical facts; a net-worth-scoped historical endpoint, if added, must state it uses today's exclusion selection. Restoring an account does not resume its schedules.
- Currency mode recomputes the appropriate currency ledgers/dated conversions; it does not convert an old lifetime-gain number at current FX. Per-account native charts remain native. Price sparklines show the instrument's price, not portfolio profit; manual total-value sparklines show dated value steps.
- Privacy follows the mounted app provider, including values/units/costs/percentage/weight policies, chart axes and tooltips, trade and manual previews, hidden description leaks and forecasts. Retain existing privacy-mode distinctions; no second investment-only privacy store. Use theme tokens and accessible keyboard/touch controls.
- Complete account/history reads replace snapshots atomically; failed refreshes keep the last complete snapshot and mark its source age. Do not persist financial snapshots in browser storage. A market partial response is not a successful zero-value portfolio. Mutations invalidate current and hidden history/detail snapshots together; failed saves keep drafts open.

## 5. Small additive schema plan, owned by child issue

These are the minimum **logical records/fields**, not SQL to apply from this PR. Names can follow implementation conventions without changing their meaning. Keep migration 017 and all applied migrations unchanged. Allocate the next filename from the actual epic tip when each child starts, not from a preassigned numbering list.

| Owner | Additive durable data | Upgrade/backfill policy |
| --- | --- | --- |
| #127 holdings | Pricing method and explicit unit/value interpretation; category enum extended to ETF; provenance/coverage for legacy metadata. A position-anchor/correction record with account, known effective boundary/order, observed/opening kind, units (or owned state for total assets), optional cost/currency and provenance. Current balance remains a mirror. | Preserve categories/balances. Legacy manual → total/manual pricing; existing stock/crypto retain category/unit. Create observed migration-boundary anchors, not backdated opening buys. No inferred costs/dates/ETF names; unknown stays null. |
| #128 trades | Per-trade execution currency and gross facts (retain original total), explicit included fee amount/currency/state, stable effective order, reporting-cost source facts, reciprocal cash reference already from 017. Bounded idempotency/replay storage if not safely reusable. | Preserve ids, row order, amounts and links. Copy a known currency only with auditable evidence; current account metadata is a candidate requiring confirmation where old history could differ. Do not default legacy execution currency to USD, infer a fee or attach cash to standalone trades. Snapshot-guard pair writes and anchor/unit updates in one batch. |
| #129 manual history | Dated total/per-unit valuation observations and source/as-of/audit metadata; manual acquisition/disposal/known-contribution facts if existing trade shape cannot represent these without confusing quantity and value. | Baseline legacy current value at the observed upgrade boundary, cost unknown. Keep earlier history for review; no invented appraisal/purchase trail. Unique effective observation with guarded audited correction; acquisition/cash flow is a distinct event. |
| #130 sources | Provider-neutral price/FX records or disposable caches with symbol/pair, observation date/time, base/quote, raw/adjusted kind, provenance and freshness. | No copied prototype data, no current FX labeled historic. Explicit schema/export policy for reconstructible caches; never treat a cache row as a cash event or user-confirmed cost. |
| #131/#132 metrics/series | Prefer derived reads/shared pure functions and bounded response contracts. Store only source facts; any derived cache is keyed by financial + market/FX revisions, scope, currency and range. | Do not add a parallel ledger of computed returns or overwrite immutable saved forecast snapshots. Cache invalidation cannot erase user facts. |

All new user financial records belong in `shared/data-export.ts`, restore/migration documentation and relevant MCP read models. Forecast source-revision triggers must include new user-owned anchors/corrections/valuations and new trade financial fields. Migration 017's investment UPDATE trigger names its old columns explicitly: **adding a field alone will not invalidate forecasts for edits to that field**. Link-only repair remains metadata-only. Preserve pending `mcp_review` projection isolation and financial-source revision rules. Market/cache refresh gets separate freshness/versioning; it does not pretend to be a posted ledger change. Archive/lock guards must cover new writers/tables and manual-current-mirror updates in the same atomic operation.

Each child schema PR must prove fresh install and upgrade from its preceding schema on disposable Worker/D1, compare old columns/rowids/balances/links, document intentional backfills and test rollback. Metadata migration must not silently rebalance the app. The October 12 export rehearsal proves 017 on that snapshot only; use a fresh export copy for the final all-migration rehearsal when available. Original exports stay untouched, private copies are removed, and reports contain no personal account/amount/identifier data. No remote migrations/deployments occur as verification.

## 6. Worked examples and implementation gate

[Machine-readable examples](../tests/fixtures/investment-accounting-v1.json) use only synthetic accounts, dates, decimal values and ratios. [Contract checks](../api/src/tests/investment-accounting-contract.test.ts) independently verify their arithmetic/identities and missing-data cases in the normal API test suite; they deliberately do not call the current legacy calculator or install a future production calculator. Future #127–#134 implementations must consume/adapt these same expectations rather than changing them to fit legacy results.

| Example | Expected result |
| --- | --- |
| Buy 10 @ 100 + 10 fee; sell 4 @ 120 − 4 fee; buy 2 @ 90 + 2 fee; mark 8 @ 110 (same fiat) | Initial basis 1010; removed basis 404; sale realized 72; final basis 788, average 98.5; V 880, N 716, U 92, total gain 164. All-buys average would be wrong. |
| Sell the last 8 @ 110 with zero fee, then buy 1 @ 50 | Before rebuy Q/B = 0, cumulative N = −164, realized gain 164, average cost unavailable. Rebuy Q = 1, B = 50, N = −114; lifetime gain still includes realized 164. |
| Known current 5 shares, known dated buy history 2, price 20, unknown opening/cost | Current V = 100; current units stay 5. Residual 3 is a warning, not a buy; B/N/gain/earlier history unavailable. |
| Imported opening with 3 shares, known remaining basis 90 and current price 40, unknown earlier cash/sales | V = 120, B = 90, U = 30; lifetime N/L/total gain remain unavailable. The opening basis is not a fabricated contribution. |
| Buy 2 @ EUR 50; exact HUF debit 40,400 including HUF 400 fee; later price EUR 60 and HUF/EUR 410 | Gross EUR 100, implied settlement 400 HUF/EUR, native fee EUR 1, native basis EUR 101. Reporting basis HUF 40,400, V HUF 49,200, unrealized gain HUF 8,800; current-FX translation of native gain gives 7,790 and is not the reporting result. |
| Manual total asset bought for 1000, later valued 1200 | Cash unchanged by appraisal, N/B 1000, U/gain 200. Value is 1000 before appraisal, 1200 from its date; no backward fill. |
| Value 100 → 200 with contribution 100 and unchanged prices | Range gain 0, daily factor 1, estimated return 0%; deposit is not profit. |
| Same-day buy cash 100 and sell proceeds 110, start/end holdings zero | Net invested −10, gain 10; factor 110/100 = 1.1. Netting flows in the denominator would incorrectly make it zero. |
| Consecutive factors 1.1 and 1.1, second day contribution 100 | Ending value 231 from V0=100; N increment 100; range gain 31, estimated return 21%, not 31% and not 20%. |
| Missing price/FX, zero units, manual/market mix and foreign basis | Preserve known native/current fields; unavailable required totals/percentages stay null with reasons. Zero holdings need no quote for current zero. Market Today coverage explicitly omits manual/stale positions. |

Decisions for this MR review are the accounting rules above: remaining weighted-average basis, exact cash with included fees in cash currency, conservative legacy anchors, full-total versus unit manual valuation, daily estimated-return timing, portfolio scope and 90-day manual reminder. They are implementation defaults, not tax/accounting advice. No remaining product decision blocks writing these examples; later provider selection, precise storage names, supported numeric precision and UI copy are engineering choices owned by the named children and must be tested/documented before their PRs are ready. If review changes a financial rule, update this version and fixtures together before implementing dependents.

Stop after the #126 MR for user verification. #127–#135 stay planned until review allows the next child; no epic/main merge or production write is implied.
