# Portfolio history

`GET /investment-history` derives daily portfolio values from dated facts. It is a read through the normal controller/service/repository layers, using the shared accounting and market-input functions. It makes no schema change or financial write. Source market reads can refresh the existing reconstructible cache.

## Scope and dates

All investment holdings are included, including sold and archived holdings during their owned dates. This differs from the current active-holdings overview. Net-worth exclusions do not filter this investment history.

The query accepts `range=1m|3m|6m|1y|ytd|all` (default `1m`), an optional `to`, reporting `currency` (default HUF), an IANA `timezone` (default UTC), `max_points` (100–1200, default 600), and optional `expected_revision`. Alternatively, use both `from` and `to`, without `range`. Unknown fields, invalid dates/currencies/zones and future or reversed intervals are rejected. Calendar months clamp to the target month's last day. YTD starts January 1. All starts after the earliest supported position boundary, bounded to the last ten years; it does not fabricate pre-import history.

A range a…b includes flows on both dates and uses close of a−1 as its opening value. Each reporting-day cutoff is the end of that day in the requested timezone. The browser supplies its calendar date and timezone. Today is provisional at the response `as_of`, using the stored current units, current quote and current FX, so an equivalent complete endpoint agrees with current metrics. Market observations retain their source timestamps; `as_of` is the calculation cutoff, not a claim that every price traded then.

## Reconstruction and coverage

The engine replays immutable position anchors and ordered trades. A newer confirmed opening supersedes earlier opening/observation versions. Corrections are noncash boundaries: they do not create deposits or profits. Observed legacy quantities are unknown before their dated boundary. A zero opening with no preceding activity establishes a known empty start; a nonzero opening can establish values without establishing lifetime cash or costs.

Historical market values use owned-date units and unadjusted daily prices. Daily bars lack historical session-end timestamps. To avoid assuming today's session schedule applied to an old half session or holiday, a bar is conservatively available at the end of its source calendar day (UTC for crypto). An earlier reporting cutoff may therefore use the previous source day. Exact historical session alignment needs a provider with dated session-end metadata. Only confirmed weekend carry is supported for stock/ETF closes; absent weekdays remain gaps because no full exchange holiday calendar is available. Crypto requires daily observations. No pre-listing, outage or future fill is permitted.

Manual total/per-unit observations carry forward only from their effective dates. Acquisition/disposal changes ownership; an appraisal does not change units or contributions. Split events while owned, including before the selected range, make unsupported historical units unavailable until another independent anchor. Ownership predating available corporate-action coverage is also unverified. Unsupported corporate actions suppress affected performance; daily prices alone cannot invent dividends or a split-adjusted unit ledger.

FX uses dated ECB observations through the existing Frankfurter reader, with bounded TARGET holiday/weekend carry. Publication times are unavailable, so historical observations use a conservative ECB calendar-day-end availability boundary. Current rates never fill historical values or cash flows. Missing required values or rates make the aggregate value null, with account/date coverage intervals. Missing lifetime cash leaves Net invested null even when a subperiod value/gain can be established. A correction is also distinct from a cost-basis change.

## Cash flows and performance

Net invested is cumulative exact cash paid minus proceeds, converted at each cash-flow date. It can be negative. It is separate from remaining basis and does not move with prices, appraisals or FX changes after a cash flow.

Range gain is ending value minus opening value minus contributions plus withdrawals. Estimated return geometrically links daily factors:

`F = (ending value + withdrawals) / (previous value + contributions)`

Contributions occur at the start and withdrawals at the end of the day. Gross flows remain separate, including same-day buy/sell round trips. This is a daily estimate, not exact trade-time return; it is not annualized. Known inactive zero days add a neutral factor; an entirely empty range has gain zero and no percentage. A valid zero factor remains a −100% return. A missing active day suppresses the percentage rather than being skipped. If endpoints and flows are known, range amount gain may remain available across an intermediate price/FX gap. Noncash boundaries, unsupported actions or ambiguous units/cash suppress unsupported gain as well.

## Bounds and consistency

Reads accept at most 100 holdings, 10,000 trades, 20,000 anchors and 20,000 valuations, and 75,000 holding-day positions including the opening boundary. Larger combinations require a shorter range to stay within Worker memory limits. They use one D1 fact batch, whole-window market reads back to supported position boundaries (including pre-range corporate actions) for unique symbols with concurrency four, at most 150,000 source-day positions, quote batches of fifty, and at most eleven annual FX windows. Provider cancellation/timeouts and a 45-second read deadline propagate. Financial revision checks reject mixed/stale facts with HTTP 409. Market-cache writes do not advance financial revision.

Daily calculations precede sampling and summary calculation. Sampling retains first/last dates, cash/valuation/position events and neighbors, value/Net-invested extrema and gap transitions. More material events than the point budget produce HTTP 422, rather than silently hiding them. Coverage is compressed into at most 4,000 contiguous intervals. No partial result is published when bounds are exceeded.

The App-owned client hook retains at most twelve complete range/currency snapshots in session memory. Financial refresh keys and revisions invalidate reuse, route changes revalidate, and superseded/hidden requests abort. Failed refresh retains only matching saved history with a warning. Financial history is never stored in localStorage. Hidden privacy mode removes the chart, axes and tooltips and masks amounts and percentages.

## Verification

Pure fixtures independently cover multi-asset purchases, partial/full sales, re-entry, archived gains, manual appraisals, unknown imports, corrections, dated FX, timezones/DST, missing weekdays, empty ranges and sampling. Worker/D1 tests exercise the real route, SQL reads, financial-row preservation, archive history, current-metrics parity, mutation revision invalidation and query/fact limits. Client tests cover cancellation, range/currency isolation, failed refresh, navigation caching and privacy. No new MCP write capability or history tool is introduced.
