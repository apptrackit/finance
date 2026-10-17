# Investment metrics

Implemented by #131 under #123. This is a derived read layer: no migration, computed-return table, account rewrite or production backfill.

## Reads and scopes

`GET /investment-metrics?currencies=HUF,USD&scope=investments` returns one financial-revision snapshot: active accounts, ordered trade facts, normalized quotes, current FX provenance, and separate reporting ledgers. At most two supported currencies, 100 active holdings and 10,000 trades are accepted; exceeding facts limits fails instead of truncating. The server rechecks financial revision after source reads. Failed client reads keep the previous complete session snapshot. No financial snapshot is saved in browser storage.

`scope=investments` includes all active holdings. `scope=net_worth` omits holdings excluded from net worth. Dashboard applies the latter selection before requesting prices/conversion. Independent MCP `get_portfolio` uses the same pure engine and shared D1 read adapter, with net-worth scope and its existing warned partial-total policy. MCP never calls API endpoints. Current-value, basis and gain coverage have separate counts; a partial known gain is never described as complete. Missing **all** costs/gains produces null, not a zero partial gain. API/client totals and allocations require all included current values; allocation also requires a positive total.

The client consumes server-provided HUF and USD ledgers directly. Switching currency does not translate old costs or gains at current FX. The earlier account/trade/quote client reads are replaced by the coherent metrics snapshot; categories are still loaded alongside it.

## Accounting

`shared/investment-metrics.ts` is the pure calculator, tested against `tests/fixtures/investment-accounting-v1.json`. Current units always come from the stored mirror. A dated zero opening proves an empty start; a nonzero imported opening can prove remaining cost without proving older contributions or realized gains. Observations and corrections are not purchases. Replay uses date, durable effective order and ID, respecting the opening/observation boundary.

Remaining basis uses moving weighted average. A sale removes its proportion of basis; full liquidation sets remaining basis to zero. Rebuy after unknown-cost liquidation can establish new remaining cost without recovering earlier lifetime gains. Net invested is exact purchase cash less sale proceeds, including fees, converted on each flow date. It can be negative. Realized gain, unrealized gain and their sum are distinct from basis and invested cash. Zero positions require no quote/FX for current value, and have no average cost or invented percentage denominator.

Execution-native and reporting basis are independent. Native cash invested is available only for actual same-currency settlements; an implied trade/fee ratio is not used to fabricate native external cash. The UI labels native remaining basis and uses the selected reporting ledger for Net invested. Native included fees use explicit fee currency and the recorded settlement ratio. Unknown fee breakdown can withhold native basis while exact cash still establishes reporting basis. Reporting cost uses dated ECB observations with original source dates and the bounded carry rules from #130, never today's FX. Imported opening basis only applies in its explicitly supplied currency; it is not translated at the arbitrary opening date. Unsupported split/dividend events withhold affected cost/gain calculations while independently known current value remains visible. Unavailable event history is explicitly flagged, and does not substantiate a market gain or sale-gain preview.

## Trade preview

`POST /investment-trades/preview?trade_id=<optional edit ID>` uses the same validated trade body and complete timeline/lock/archive/settlement checks as saving, stopping before commit. It creates no cash/trade/audit rows or idempotency receipts and changes no balances or source revision. A financial revision change during either planning or source reads invalidates the preview. Reconstructible market-cache refreshes are the only possible writes. Saving always revalidates; preview is not a reservation or guarantee against later edits.

The composer shows resulting units, remaining average native cost, HUF remaining basis and the estimated realized gain for that specific sale. It does not subtract lifetime realized totals to estimate a sale when older realized history is unknown. Superseded requests are aborted and ignored, and failed reads preserve the form draft. All financial preview output respects privacy mode.

## Daily and range performance

Instrument price change uses normalized native previous-session close and source freshness from #130. It is distinct from `market_today`, which subtracts today's exact gross contributions and adds withdrawals using the current `X-Client-Date` calendar day. Current value uses current FX; prior value and flows use dated FX, so reporting currency movement is included. Prior units reverse today's signed trades from the reconciled current mirror. No manual/stale/missing holding is silently included: covered counts and omitted account/reason lists accompany the result.

**Market Today is a daily-close estimate, not exact local-midnight/intraday valuation.** Its prior price is the completed daily observation for the previous calendar date (bounded weekend carry for exchange assets); source markets can close in different time zones. Missing weekday observations, provisional prior closes, unknown prior positions, unsupported events and missing FX exclude the holding. The response states this boundary. Manual valuation jumps never enter Market Today.

The pure `estimatedReturn` function implements range gain and daily geometric linking: contributions at the start, withdrawals at the end, preserving same-day round trips, inactive days, missing active days and complete losses. Holding/portfolio **Estimated return** percentages remain explicitly null (`daily_history_required`) until #132 supplies the complete historical portfolio series. No gain/net-invested shortcut is displayed. The full overview/detail visual redesign remains #133/#134.

## Verification

Golden production-engine tests cover weighted-average sales/rebuys, unknown openings and basis, manual totals, exact cash/fees, historical currency conversions, fractional crypto, absent inputs and all reviewed daily-return examples. Worker/D1 tests compare previews with saved reads and independent MCP, test scopes and rejected preview mutations, and assert financial records/revision remain unchanged. Client tests cover snapshot failures/cancellation, selected-currency ledgers, preview privacy and net-worth exclusions. The October 12 export is tested only in a disposable local copy, without outbound network or production access; reports are sanitized and the private copy is deleted.
