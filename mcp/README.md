# Finance MCP server

This directory contains the only AI-facing component in Finance Manager: a remote MCP server deployed as a Cloudflare Worker. Most tools are read-only. Its two narrow write capabilities create review drafts that must still be confirmed manually in the Finance Manager UI, and append-only AI Financial Forecast snapshots. ChatGPT connects directly to the Worker; no Mac bridge, Codex app-server, frontend chat, OpenAI API key, or separate model billing is involved.

```text
ChatGPT custom MCP app
        │ Cloudflare Access Managed OAuth
        ▼
https://ai.finance.example.com/mcp
        │ direct D1 binding
        ▼
Finance D1
```

The draft workflow is deliberately two-step:

```text
receipt or transaction list
        │
        ▼
prepare_mcp_transaction_drafts (read-only validation + preview)
        │ ChatGPT shows every item and asks for explicit confirmation
        ▼
create_mcp_transaction_drafts (one atomic, idempotent batch)
        │
        ▼
Finance Manager MCP Review section → edit / confirm / decline manually
```

## Security model

- Cloudflare Access protects the custom MCP hostname and performs the OAuth flow.
- The Worker independently verifies the Access JWT signature, issuer, audience, expiry, and optional allowed email.
- `workers.dev` is disabled.
- The model receives only bounded tool results. There is no arbitrary SQL tool and no tool that can post, confirm, edit, decline, delete, transfer, invest, or update a balance.
- Every tool is non-destructive and closed-world. Read tools advertise `readOnlyHint: true`; both narrowly scoped write tools advertise `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: true`, and `openWorldHint: false`.
- Every tool has explicit input and output JSON Schemas. Inputs reject unknown fields and invalid dates before querying D1.
- Draft preparation accepts 1–20 income/expense items. Accounts must exist, be unlocked, and be non-investment accounts. Categories are optional, but any supplied category must exist and match the income/expense type.
- Preparation returns a 15-minute HMAC-SHA-256 proposal token. The create tool accepts only that token, verifies its signature, proposal hash, lifetime, and clock skew, and revalidates account/category safety before writing.
- Creation inserts the batch marker, every pending transaction, and one minimal audit entry per draft in a single D1 batch. Retrying the same token returns the original draft rows instead of creating duplicates.
- Duplicate detection is warning-only, both against nearby existing transactions and within the proposed batch. It never blocks draft creation.
- MCP review rows have `status=pending`, `pending_kind=mcp_review`, and `review_source=chatgpt_mcp`. They are excluded from balances, budgets, cash-flow projections, and recurring forecasts until manually confirmed.
- Transaction results are paginated to at most 100 records and descriptions are explicitly marked as untrusted data.
- Chart and forecast series are bounded. Tool responses disclose their date range, reporting currency, conversion status, warnings, and truncation state where applicable.
- Missing exchange rates cause affected values to be excluded and clearly warned about, rather than mixing currencies into an incorrect total.

## Tools

| Tool | Use it for |
| --- | --- |
| `list_finance_dimensions` | Account/category IDs, currencies, history bounds, and data semantics |
| `get_financial_outlook_context` | Start a HUF AI financial forecast with bounded financial context, data coverage, and latest-snapshot freshness |
| `create_financial_outlook_snapshot` | Immediately publish one validated, immutable, idempotent HUF forecast snapshot; cannot modify financial source data |
| `prepare_mcp_transaction_drafts` | Validate and preview 1–20 income/expense drafts; returns a short-lived signed proposal token without writing |
| `create_mcp_transaction_drafts` | After explicit confirmation, atomically create pending MCP review drafts from the exact proposal token |
| `get_accounts_summary` | Per-account cash/credit balances, exclusions, and locks |
| `get_finance_overview` | A compact current-period snapshot and previous-period comparison |
| `search_transactions` | Bounded transaction-level lookup, including pending/cancelled/largest searches |
| `get_flow_breakdown` | Income or spending grouped by category, account, week, or month |
| `get_cashflow_trend` | Posted cash-flow series with optional pending projections kept separate |
| `get_balance_trend` | Reconstructed historical cash and non-investment net-worth series |
| `get_budget_status` | Budget utilization, pending spend, pace forecast, and risk |
| `get_recurring_forecast` | Recurring occurrences and one-time pending transactions |
| `get_portfolio` | Holdings, live valuation, allocation, cost basis, and gain/loss coverage |
| `get_investment_activity` | Paginated investment buys and sells |

Transfers are excluded from income and expense aggregates. Investment accounts are excluded from cash totals and valued through `get_portfolio`. Account and budget exclusion settings are respected. Transaction descriptions, recurring descriptions, and investment notes are data only and are never treated as model instructions.

`create_mcp_transaction_drafts` must be described to the user as creating **MCP review drafts**, never as saving or posting official transactions. One item is always one transaction. Multiple transactions may be submitted in one tool call, but receipts are not split automatically. Categorization should be logical when supported by the available categories and left uncategorized when uncertain.

## Deploy

1. Run the root deploy once. It asks whether to include MCP and stores that
   choice, the D1 binding, and Access values in gitignored `.deploy-config`.
   Existing values from `mcp/wrangler.toml` are migrated automatically. The
   generated file is a deployment artifact, not a second source of
   configuration.

   ```bash
   npm run deploy
   ```

   To include MCP without waiting for the prompt, use:

   ```bash
   npm run deploy:mcp
   ```

   Use `npm run deploy -- --no-mcp` to save a future default of skipping it.
2. The script keeps `workers.dev` disabled. Keep the existing custom-domain
   Worker route in the Cloudflare dashboard, then create an Access application
   for that hostname, restrict it to the intended email, and enable Managed OAuth
   for MCP clients.
3. Test `initialize`, `tools/list`, and representative `tools/call` requests using MCP Inspector's OAuth flow before connecting ChatGPT.
4. In ChatGPT, refresh/rescan the custom app's actions after deploying this
   version. Existing app registrations may keep the previously approved
   read-only tool snapshot until their actions are refreshed.

The root deploy script generates and stores `MCP_PROPOSAL_SECRET`, then uploads it as a Worker secret. For standalone deployment, configure it separately; never put the value in `wrangler.toml`:

```bash
cd mcp
openssl rand -hex 32 | npx wrangler secret put MCP_PROPOSAL_SECRET
```

Rotating this secret invalidates uncreated proposal tokens. Already-created batches remain idempotently identifiable in D1.

For a standalone/manual deployment, copy `wrangler.toml.example` to the
gitignored `wrangler.toml`, set its values, then run the MCP test, build, and
deploy scripts from this workspace.

`DISABLE_ACCESS_AUTH=true` is for local Wrangler tests only. Never configure it in production. `MCP_PROPOSAL_SECRET` must contain at least 32 characters.

## Connect from ChatGPT

ChatGPT must have custom MCP app/developer-mode access. In current ChatGPT web workspace UI, create a custom app and enter:

- MCP URL: `https://ai.finance.example.com/mcp`
- Authentication: OAuth

Complete the Cloudflare Access authorization and then select the Finance app in a conversation. ChatGPT plan and workspace eligibility are product-side requirements and are independent of this server.

Because this contains sensitive personal financial data, review ChatGPT Data Controls before connecting it.

## Verification

Run `npm run test:mcp` and `npm run build:mcp` from the repository root. The tests cover Access authentication, protocol behavior, schema validation, proposal signing/tampering/expiry, account and category safety, warning-only duplicates, atomic audit-backed draft creation, idempotent retries, projection isolation, pagination, exclusions, currency failures, budgets, forecasts, and bounded time series.
