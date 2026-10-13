# Monthly cash balance comparison

Design for #61. Extend the existing Cash Balance Trend card with an opt-in
comparison in Month / Actual. Year and All Time keep their existing charts.

Desktop:

```text
Cash Balance Trend                    [Hide comparison]
● October 2026    ○ September 2026
+30,000 HUF (+7.7%) · October 13 vs September 13

               daily balance chart
          calendar day: 1 … 13 … 31

Hover tooltip: October 13, 2026: 420,000 HUF
               September 13, 2026: 390,000 HUF
               Difference: +30,000 HUF (+7.7%)
```

Mobile stacks the title, control, wrapping legend and summary. The chart stays
full width; both dates and the difference appear in the chart tooltip. Keep the
chart's native touch and keyboard interaction; there is no inspection section
below the plot.

The button describes the next action: “Compare previous month” while off and
“Hide comparison” while on. Its active state uses the primary button style.

- Selected month: strong solid line with fill. Previous month: thinner solid
  muted line with hollow markers, no fill. Explicit month/year labels and marker
  shapes distinguish the series beyond color. Hide the moving average only
  while comparison is active. Both series use smooth monotone curves through
  the daily balances; tooltip values remain the exact daily ledger balances.
- Use end-of-day posted balances, including linked transfer legs, and carry
  balances across days without transactions. Pending upcoming and MCP review
  rows, cancelled rows and investments never enter the comparison.
- Use the cash exclusion setting, including archived cash accounts in historical
  reconstruction. Use the same current reporting-currency rates as Analytics;
  these are reconstructed ledger balances, not historical FX valuations.
- Anchor reconstruction to current cash balances and undo later posted movements.
  Reuse the complete history Analytics already loads; add no startup requests.
- History coverage begins at the earliest posted included-cash date. The schema
  has no durable account opening-date/balance history, so do not infer coverage
  before that record. Require coverage from the first day of the previous month.
  A quiet month remains comparable if earlier history covers it.
- Stop actuals at the browser's local today. Do not add days to shorter months.
  Future selected months cannot be compared. Projected mode disables comparison.
- The headline uses the latest calendar day available in both months. For March
  versus February this is day 28/29, explicitly labeled with both full dates.
  Inspection after that date shows only the longer month's available value.
- Show signed absolute differences; show percentages only when the previous
  balance is positive. Zero/negative prior balances omit percentage comparisons.
- Mask axis, summary and tooltip amounts/deltas in privacy mode.
  Missing required FX withholds converted charts via the existing Analytics
  warning/retry flow. Missing history disables comparison with an explanation.
- Comparison is local to the card and initially off. It introduces no stored
  preference. A failed history/account refresh disables comparison until a
  successful refresh, preserving the app's existing stale-data warning.
