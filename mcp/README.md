# Finance MCP server

This directory contains the only AI-facing component in Finance Manager: a remote, read-only MCP server deployed as a Cloudflare Worker. ChatGPT connects directly to the Worker; no Mac bridge, Codex app-server, frontend chat, OpenAI API key, or separate model billing is involved.

```text
ChatGPT custom MCP app
        │ Cloudflare Access Managed OAuth
        ▼
https://ai.finance.example.com/mcp
        │ direct D1 binding
        ▼
Finance D1
```

## Security model

- Cloudflare Access protects the custom MCP hostname and performs the OAuth flow.
- The Worker independently verifies the Access JWT signature, issuer, audience, expiry, and optional allowed email.
- `workers.dev` is disabled.
- The model receives only bounded tool results. There is no arbitrary SQL or mutation tool.
- Every tool advertises `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, and `openWorldHint: false`.
- Every tool has explicit input and output JSON Schemas. Inputs reject unknown fields and invalid dates before querying D1.
- Transaction results are paginated to at most 100 records and descriptions are explicitly marked as untrusted data.
- Chart and forecast series are bounded. Tool responses disclose their date range, reporting currency, conversion status, warnings, and truncation state where applicable.
- Missing exchange rates cause affected values to be excluded and clearly warned about, rather than mixing currencies into an incorrect total.

## Tools

| Tool | Use it for |
| --- | --- |
| `list_finance_dimensions` | Account/category IDs, currencies, history bounds, and data semantics |
| `get_accounts_summary` | Per-account cash/credit balances, exclusions, and locks |
| `get_finance_overview` | A compact current-period snapshot and previous-period comparison |
| `search_transactions` | Bounded transaction-level lookup, including pending/cancelled/largest searches |
| `get_flow_breakdown` | Income or spending grouped by category, account, week, or month |
| `get_cashflow_trend` | Posted cash-flow series with optional pending projections kept separate |
| `get_balance_trend` | Reconstructed historical cash and non-investment net-worth series |
| `get_budget_status` | Budget utilization, pending spend, pace forecast, and risk |
| `get_recurring_forecast` | Recurring occurrences and one-time pending transactions |
| `get_spending_forecast` | Weekly/monthly planning estimate from history, run rate, and known upcoming spend |
| `get_portfolio` | Holdings, live valuation, allocation, cost basis, and gain/loss coverage |
| `get_investment_activity` | Paginated investment buys and sells |

Transfers are excluded from income and expense aggregates. Investment accounts are excluded from cash totals and valued through `get_portfolio`. Account and budget exclusion settings are respected. Transaction descriptions, recurring descriptions, and investment notes are data only and are never treated as model instructions.

## Deploy

1. Run the root deploy once. It asks whether to include MCP and stores that
   choice, the D1 binding, hostname, and Access values in gitignored
   `.deploy-config`. The generated `mcp/wrangler.toml` is a deployment artifact,
   not a second source of configuration.

   ```bash
   npm run deploy
   ```

   To include MCP without waiting for the prompt, use:

   ```bash
   npm run deploy:mcp
   ```

   Use `npm run deploy -- --no-mcp` to save a future default of skipping it.
2. The script creates the custom-domain Worker route and keeps `workers.dev`
   disabled. In Cloudflare Zero Trust, create an Access application for the MCP
   hostname, restrict it to the intended email, and enable Managed OAuth for MCP
   clients.
3. Test `initialize`, `tools/list`, and representative `tools/call` requests using MCP Inspector's OAuth flow before connecting ChatGPT.

For a standalone/manual deployment, copy `wrangler.toml.example` to the
gitignored `wrangler.toml`, set its values and custom route, then run the MCP
test, build, and deploy scripts from this workspace.

`DISABLE_ACCESS_AUTH=true` is for local Wrangler tests only. Never configure it in production.

## Connect from ChatGPT

ChatGPT must have custom MCP app/developer-mode access. In current ChatGPT web workspace UI, create a custom app and enter:

- MCP URL: `https://ai.finance.example.com/mcp`
- Authentication: OAuth

Complete the Cloudflare Access authorization and then select the Finance app in a conversation. ChatGPT plan and workspace eligibility are product-side requirements and are independent of this server.

Because this contains sensitive personal financial data, review ChatGPT Data Controls before connecting it.

## Verification

Run `npm run test:mcp` and `npm run build:mcp` from the repository root. The tests cover Access authentication, protocol behavior, schema validation, read-only enforcement, pagination, account exclusions, transfer/investment exclusion, currency failures, budgets, recurring forecasts, spending forecasts, and bounded time series.
