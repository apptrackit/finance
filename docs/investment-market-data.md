# Investment market inputs

Implementation of #130 under #123. This supplies source inputs for #131–#134; it does not calculate portfolio returns or finish the page redesign. Existing execution prices, balances, account identity and cash facts are never rewritten by market reads. MCP remains read-only for investments.

## Providers and coverage

The existing Yahoo Finance HTTP search/chart endpoints remain the market source. There is no Microsoft provider or paid subscription in this implementation. These endpoints are an unofficial integration without an availability guarantee; the adapter can return unsupported/missing/stale results, and unsupported holdings can use manual pricing. A successful probe does not guarantee future coverage.

Read-only probes on October 18, 2026 (local date) returned `VWCE.DE` (ETF/EUR/GER), `AAPL` (stock/USD/NMS), `BTC-USD` (crypto/USD/CCC), and `OTP.BD` (stock/HUF/BUD), including real provider timestamps and session metadata. Weekends retained earlier exchange observations; Bitcoin had a separate UTC daily session. A separate NVDA June 2024 probe confirmed the ten-for-one split event and the reconstruction factor before versus after its date. These are public symbols, not copied holdings or fixture prices.

Historical FX uses [Frankfurter v2's ECB endpoint](https://frankfurter.dev/#rates-by-provider), fixed to `base=EUR`, with dated observations and attribution **Source: ECB statistics**. It requires no API key or subscription; the service documents no daily/monthly quota, abuse rate limiting and permission to cache. Direct ECB queries remain subject to [ECB reuse rules](https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html), including attribution. Coverage varies by currency/date; no assertion is made that every app currency has an ECB series. Missing rates remain missing. The existing ExchangeRate-API path for current cash FX is unchanged and is never used as historical fallback.

[ECB reference rates](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html) normally publish around 16:00 CET on working days, excluding TARGET closing days. They are informational daily references, not the user's actual transaction settlement or exact intraday conversion. Supported historic inputs stay within the app's last-ten-years window (ECB data often starts in 1999, with later starts for some currencies).

## Normalized facts

`shared/market-data.ts` defines quote, daily price, search and dated FX contracts. API and independent MCP use the same provider adapter and D1 cache repository; neither Worker calls the other. Quote compatibility aliases (`regularMarketPrice`, `regularMarketChangePercent`, etc.) remain available for current app consumers, with null for unavailable fields.

A quote records canonical symbol, category, exchange, fiat currency, exchange timezone, actual `as_of`, session date/bounds, retrieval time, positive price and validated prior daily close. Minor-unit listings (`GBp`/`GBX`, `ZAc`, `ILA`) normalize to GBP/ZAR/ILS with the appropriate factor. Conflicting saved listing/quote currencies withhold valuation rather than applying the wrong FX. Search filters to ETF/equity/crypto; selecting a result resolves its quote currency instead of inventing USD.

Daily instrument move is `(price / previous_close - 1) * 100`, using the immediately preceding available daily bar before the quote's own exchange-session date. The provider's range-start `chartPreviousClose` is never used. The prior close is in the quote's current split basis (`previous_close_kind=split_adjusted_to_quote`). Missing/null previous bars withhold the move; crypto additionally requires the preceding UTC date. Moves are unavailable outside the current exchange/UTC date or for stale prices. They are instrument changes, not account profit.

Statuses distinguish `ok`, `last_close`, `stale`, `missing`, and `unsupported`. Active-session/crypto quotes older than 20 minutes are stale; other observations older than 96 hours are stale. Weekend last closes retain their Friday source time and no Today percentage. These conservative age rules are not a complete exchange holiday calendar. Any failed refresh of a saved quote is explicitly stale, even if its original timestamp is recent. Invalid historical bars or corporate events can withhold history/prior-close moves while independently valid current metadata remains readable.

Daily history stores exchange calendar dates and provider bar-start timestamps; a bar-start is not falsely labelled an exact closing timestamp. Current exchange-day bars are provisional. `period2` always stops at actual retrieval time. Read bounds use UTC with a validated adjacent `X-Client-Date` where supplied; no future observations are invented for a local date already underway. End-of-day/cutoff assembly remains #132.

Yahoo chart close is split-adjusted; `adjclose` additionally incorporates distributions ([Yahoo explanation](https://in.help.yahoo.com/kb/adjusted-close-sln28256.html)). The adapter does not use `adjclose`. It requests daily closes plus all split/dividend events from the requested start **through retrieval time**, even when the caller's end is earlier. It reconstructs contemporaneous unadjusted close by multiplying the provider close by every later reported split ratio. Both `provider_close` and raw `close` are explicit. Missing/malformed split facts withhold history instead of assuming raw units. Events inside the requested range set `requires_event_review`: #131/#132 must establish matching unit/cash events before claiming complete portfolio performance. Dividend ingestion, split posting and tax reporting remain outside this child.

Price history contains actual observations only. `dailyPriceAt` permits exact-date observations and equity weekend carry with the original date; it does not bridge missing weekdays, unknown pre-listing dates or crypto gaps. Other exchange holidays require a verified calendar in a future consumer or remain incomplete. A successful provider response is not proof of complete portfolio history.

FX points contain units of each currency per EUR, with EUR=1. Convert using the shared direction: `amount / rates[source] * rates[target]`. `datedFxAt` never looks forward. It carries at most four days across verified TARGET closures only (weekends, New Year, Good Friday, Easter Monday, May 1 and December 25/26). A missing publication on an ordinary working day stays missing. Original dates remain visible; no current-rate substitution occurs. Responses report per-date/currency missing coverage separately from provider freshness. A stale fallback preserves original retrieval/observation dates.

## Reads and bounds

All routes use the normal API authentication/CORS policy and `Cache-Control: no-store` for browser responses. Provider inputs are cached server-side; personal account snapshots are not persisted in browser storage.

| Route | Contract |
| --- | --- |
| `GET /market/search?q=...` | 1–80 characters; at most 10 distinct supported results; no news payload |
| `GET /market/quote?symbol=...` | One canonical symbol, at most 40 allowlisted identifier characters |
| `GET /market/quotes?symbols=A,B` | At most 50 inputs, deduplicated; explicit per-symbol unavailable state |
| `GET /market/history?symbol=...&from=YYYY-MM-DD&to=YYYY-MM-DD` | Daily unadjusted observations, at most 3,660 elapsed days and within ten years |
| `GET /market/chart?symbol=...&range=1mo&interval=1d` | Same cached daily history; ranges 1d/5d/1mo/6mo/1y/5y/max (max means bounded 10Y); other intervals rejected |
| `GET /market/fx-history?from=...&to=...&currencies=EUR,USD,HUF` | At most 366 elapsed days and ten uppercase ISO codes; request longer histories in bounded slices; ECB-only EUR-base points plus coverage |

Cold quote reads warm a 40-day daily window so the default calendar-month portfolio range, opening close and carry margin can reuse the same request. Wider/older ranges expand the cache only when necessary.

Provider concurrency is four per request-owned adapter, with at most 32 queued requests. Provider adapters and D1 cache read contexts are constructed inside each incoming API/MCP request; their queues, in-flight promises and cancellation controllers must never be shared across fetch handlers or keyed by the reusable D1 binding. Only completed serializable D1 cache payloads are shared between requests. Body size is capped at 1 MiB; daily bar/event/FX row counts are bounded. HTTP 429 and 5xx get at most one retry after 200 ms (or a provider Retry-After of up to one second), under an 18-second total provider deadline. Longer cooldowns are returned without retrying early. Network/malformed-payload errors do not retry automatically. No write is retried. Readers join in-flight work within their request-local cache scope; cancellation detaches one caller and the last subscriber aborts its provider request. Overlapping history ranges serialize per symbol, expand the saved window when needed, and filter a common series for chart/sparkline/history consumers.

The client loader deduplicates concurrent views, limits a view to 200 distinct symbols and four requests at a time, and keeps the last good quote in bounded session memory for failures. Browser failures keep the source time, set stale, and clear daily moves. Failed dashboard refreshes preserve their complete prior snapshot; initially missing prices withhold required valuations. Instrument charts cancel superseded requests, preserve a matching prior chart on failure, display native quote currency and group same-day markers instead of overwriting one trade. Privacy mode continues to hide charts and financial values.

## Cache, migration and export

Migration **021-market-data-cache.sql** adds only `market_data_cache`. It has no account references, backfill, account mutation or financial-source revision trigger. Every normalized payload retains its own retrieval/source timestamps; cache `fetched_at` is a separate refresh revision, not a ledger/forecast revision. Later derived caches must include financial revision plus the input cache/source revisions in their key.

Quotes expire after five minutes, histories after fifteen minutes, searches after one day, and FX slices after six hours. Last-good quote fallback is retained for up to seven days; history/FX fallback up to thirty days. Failed refreshes cannot extend that saved fallback's retention indefinitely. Missing/unsupported quote responses use a one-minute negative cache. Cache failures do not discard a valid provider response. A guarded upsert prevents slower earlier fetches replacing a newer refresh; pruning caps all entries at 256 (each at most 1 MiB) and removes expired rows. Values are reconstructible; the whole cache can be discarded without losing user facts.

The JSON export manifest explicitly excludes `market_data_cache`; user financial records remain covered. Apply migrations in filename order through 021 before deploying either Worker. Never rewrite a prior applied migration. Fresh and populated disposable-D1 tests check preservation, cache sharing/pruning, export exclusion and unchanged financial revision. The private export is rehearsed on a disposable copy only; this is not a production migration or the final all-epic verification in #135.

A Frankfurter range can include a previous-business-day observation before the padded request start. Well-formed observations earlier than the existing four-day padding are discarded rather than invalidating the requested series; they cannot support an original requested date under the carry limit. An otherwise empty retained series remains missing. Wrong bases/currencies, invalid dates/rates, future/out-of-range end observations and retained duplicates still fail validation. A missing ordinary working-day rate is never bridged.
