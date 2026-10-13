# History loading: issue #58

Measured locally on 2026-10-13 with the pinned Node 22.23.2 runtime, compiled API Worker and disposable D1. The fixture is synthetic; neither saved application configuration nor financial data is read. The benchmark reproduces the previous root hook's history requests using the retained API endpoints, then compares the new bounded endpoint. It checks returned row counts as well as measuring responses.

Run from the repository root:

```sh
FINANCE_HISTORY_BENCHMARK=1 npm run test:integration -- tests/integration/transaction-history.benchmark.test.ts
```

The small fixture has 100 posted cash rows and 50 investment rows across five holdings; 20 cash and 10 investment rows fall in the selected month. The large fixture has 20,000 cash and 5,000 investment rows across five holdings; 200 cash and 50 investment rows fall in the selected month.

| Fixture | Operation | History requests before → after | JSON bytes before → after | Median history-stage time before → after |
| --- | --- | --- | --- | --- |
| Small | Dashboard startup | 12 → 1 | 68,211 → 10,000 | 12.7 → 1.9 ms |
| Small | Dashboard refresh | 12 → 1 | 68,211 → 10,000 | 11.3 → 2.3 ms |
| Large | Dashboard startup | 12 → 1 | 10,204,300 → 89,350 | 126.9 → 4.3 ms |
| Large | Dashboard refresh | 12 → 1 | 10,204,300 → 89,350 | 109.7 → 7.8 ms |

The baseline sends the selected cash period, complete posted cash history, and each holding's complete investment history twice (once for Dashboard, once for Analytics). The new Dashboard read returns only the selected cash and investment dates: 30 or 250 rows. For the large fixture, that is approximately 99.1% fewer JSON response bytes at Dashboard startup and refresh.

Times are medians of three local samples per operation, measured from history-request dispatch through response consumption and JSON parsing. Bytes are UTF-8 JSON response bodies, before HTTP compression and excluding headers. Counts and timings cover the history stage only; accounts, categories, upcoming rows, FX, quotes, app assets and React rendering are excluded. These measurements demonstrate reduced work, not a promised production startup time. CI checks correctness rather than asserting machine-dependent latency thresholds.

## On-demand Analytics and search

Opening Analytics or global search loads complete history in pages of at most 500 combined cash/investment rows. Direct Analytics launches do not also load the Dashboard period. Dashboard date changes refresh the selected period without reloading accounts or hidden history. Mutation/retry refreshes reload shared financial data and active history consumers; dormant histories are invalidated and fetched when reopened.

The small on-demand history took one request, 49,848 JSON bytes and 2.2 ms in this run. The large history took 50 requests, 9,064,127 JSON bytes and 793.6 ms. These on-demand measurements are single samples. Previously Analytics could open immediately after startup had preloaded everything. The new first visit waits for its history, and sequential pages add round trips. Charts still receive **all** rows and retain their existing transfer, exclusion, currency, projection and historical-balance calculations. Pagination bounds each response; it does not yet bound total Analytics memory or replace browser calculations with server aggregation.

Pages use a deterministic date/kind/row-position cursor (cash rows retain newest-first ordering within each day) and the existing financial-source revision. A posted-ledger/account/category/investment change between pages returns `409 HISTORY_CHANGED`; Retry restarts shared data and history from the first page. Pending MCP review edits do not invalidate posted history. Partial, repeated, malformed or failed page sequences never replace the last complete snapshot. An initial failure displays Unavailable rather than empty totals; a failed refresh retains prior data with a warning. Abort and request-generation guards prevent an older load overwriting a newer range or mutation.

## Verification

Real Worker/D1 regressions compare all pages to the retained cash/investment endpoints, with same-date boundaries, identical IDs in different tables, linked transfers, archived holdings, fractional buys/sells, posted-only isolation, inclusive date ranges, empty/exact-size pages, validation, and changed-revision rejection. Client regressions cover demand activation, direct Analytics links, global search, hidden-history invalidation, mutations, complete publication, late-page failures and stale-response ordering.

Browser checks use a separate local synthetic API: desktop/mobile layouts, dark/light themes, privacy masking, initial multi-page loading, failed refresh with retained charts, retry recovery and failed-save draft preservation. Production balances, posting, investment valuation and MCP writes are unchanged.
