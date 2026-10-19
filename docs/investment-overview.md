# Investment overview

The Investments overview includes all active holdings, independently of net-worth exclusions. HUF/USD selects the reporting currency for current values, gains, allocation and portfolio history. Holding categories and sorting affect only the holdings table; allocation, headline, summaries and history retain their full scope. Historical portfolio reconstruction also includes sold and archived holdings, as documented in [portfolio history](investment-history.md).

## Reads and native trends

The client requests `GET /investment-metrics?overview=1`. The optional flag accepts `0` or `1`; ordinary metric reads, trade previews and MCP reads retain their existing response shape. Overview reads add `overview.trends`, keyed by account ID, inside the same revision-guarded financial snapshot. D1 reads at most 100 active holdings, 10,000 trades and 20,000 manual observations, failing rather than silently truncating.

Each trend contains 30 calendar dates, a native currency, `unit_price` or `total_value`, `linear` or `step`, a source status, and dated observations with explicit null gaps and source dates. Market trends reuse normalized daily history fetched once per distinct symbol with bounded concurrency and the existing provider cache. Known weekend/session carry follows the market-data contract; missing weekday prices stay gaps. A quote-currency mismatch withholds the trend. Manual trends carry the last dated total/per-unit appraisal forward only after its effective date; zero is a valid appraisal. They do not multiply historical prices by current quantities or interpolate new appraisals. No per-row browser requests are added.

The history chart remains a separate bounded request for the selected calendar range. Source or financial-revision conflicts never publish a partial replacement. The header reports the snapshot read time; rows retain the actual price/appraisal timestamp and distinguish stale prices and last closes.

## Values and coverage

Values, cash invested, gains, Today and allocation weights come from the shared accounting and FX contracts. Native market unit prices retain small-coin precision and the provider's actual quote currency. Missing conversion rates never become rate 1 or raw foreign totals. Incomplete allocation withholds full-portfolio weights and the proportional bar. Currency allocation groups quote/appraisal currency, not geographical exposure.

Total gain is the known lifetime realized plus unrealized amount. Its Estimated return remains unavailable when complete daily history is absent; the UI does not attach a selected-range percentage to a lifetime gain. The history chart reports its own covered range gain and daily-linked estimate. Today shows eligible market holdings and exposes its coverage; manual appraisals and stale inputs are excluded. See [metrics](investment-metrics.md) and [market inputs](investment-market-data.md).

## Interaction and retained state

Desktop tables become cards at narrower available widths, with a mobile sort selector. Allocation by type filters the table; allocation by holding and holding names open the existing detail panel. Category, sort, allocation mode and reporting currency survive route changes only in App-owned session memory. Financial snapshots are never persisted to browser storage. Superseded and hidden overview reads are aborted and invalidated; return visits revalidate while retaining the last complete snapshot. Failed reads preserve that snapshot with retry feedback.

Privacy hides financial values, percentages, allocation sizing, sparklines, plot axes/tooltips and dated chart controls. Themes use the app's tokens; animations respect reduced motion. The chart also supports selecting a day with a keyboard control. Loading, empty, stale, missing-value and failed-refresh states are explicit.

Known quotes marked stale by the API but no more than one hour old display a neutral “Delayed price” with age and original source time in holdings/details. They do not create stale-price Needs attention. Older, future/invalid/undated observations and unavailable prices retain existing warnings. This is presentation only: the server’s strict quote freshness, Today exclusions, daily-move suppression and source gaps are unchanged.

Needs attention collects missing conversion/value, genuinely stale price/appraisal and incomplete opening/cost history. Recovery actions retry the overview, open the saved manual-value editor or open the holding in Accounts. With no investment account, setup links open Accounts rather than an empty trade selector. Record trade opens the [dedicated direct-cash editor](investment-detail.md) with eligible cash/holding accounts selected; it does not invent units, execution prices, fees or settlement amounts. Holding details, native execution markers and version-protected pair editing are documented there. This overview adds no schema migration and no new investment write path.

The holdings Return column pairs current unrealized gain with `unrealized_gain_percent` (gain / remaining basis), not the unsupported lifetime daily-linked estimate. It excludes realized gains and dividends, stays unavailable for missing/zero basis, and sorts by that displayed gain. Portfolio Total gain retains lifetime realized plus unrealized semantics. Trailing detail buttons are keyboard/touch accessible. Native 30-day sparklines compare known range endpoints, with neutral stale/flat/missing-boundary signals and preserved gaps. A closed-market quote may verify the last available source-day endpoint without filling the current-day gap; privacy hides the trend. Price observations use compact local source times with exact timestamps retained in the time element and full-date tooltip.
