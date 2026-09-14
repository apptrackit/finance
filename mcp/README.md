# Finance MCP server

This directory contains the only AI-facing component in Finance Manager: a remote MCP server deployed as a Cloudflare Worker. Most tools are read-only. Its only financial write capability creates review drafts that must still be confirmed manually in the Finance Manager UI; preparation persists an expiring proposal only, and forecasts are append-only derived analytics snapshots. ChatGPT connects directly to the Worker; no Mac bridge, Codex app-server, frontend chat, OpenAI API key, or separate model billing is involved.

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
prepare_mcp_transaction_drafts (validation + expiring proposal + preview)
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
- Every tool is non-destructive and closed-world. Read tools advertise `readOnlyHint: true`; proposal preparation advertises its non-financial persistence with `readOnlyHint: false` and `idempotentHint: false`; the creation and forecast writes advertise `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: true`, and `openWorldHint: false`.
- Every tool has explicit input and output JSON Schemas. Inputs reject unknown fields and invalid dates before querying D1.
- Draft preparation accepts 1–20 income/expense items. Accounts must exist, be unlocked, and be non-investment accounts. Categories are optional, but any supplied category must exist and match the income/expense type.
- Preparation stores the canonical proposal in D1 and returns only an opaque proposal ID that expires after 24 hours. Creation looks it up, verifies its stored checksum and expiry, and revalidates account/category safety before writing.
- Creation marks the proposal consumed, inserts the batch marker, every pending transaction, and one minimal audit entry per draft in a single D1 batch. Retrying a successful creation with the same proposal ID returns the original draft rows instead of creating duplicates.
- Duplicate detection is warning-only, both against nearby existing transactions and within the proposed batch. It never blocks draft creation.
- MCP review rows have `status=pending`, `pending_kind=mcp_review`, and `review_source=chatgpt_mcp`. They are excluded from balances, cash-flow projections, and recurring forecasts until manually confirmed.
- Transaction results are paginated to at most 100 records and descriptions are explicitly marked as untrusted data.
- Chart and forecast series are bounded. Tool responses disclose their date range, reporting currency, conversion status, warnings, and truncation state where applicable.
- Missing exchange rates cause affected values to be excluded and clearly warned about, rather than mixing currencies into an incorrect total.

## Tools

| Tool | Use it for |
| --- | --- |
| `list_finance_dimensions` | Account/category IDs, currencies, history bounds, and data semantics |
| `get_financial_outlook_context` | Start a HUF AI financial forecast with bounded financial context, data coverage, and latest-snapshot freshness |
| `create_financial_outlook_snapshot` | Immediately publish one validated, immutable, idempotent HUF forecast snapshot; cannot modify financial source data |
| `prepare_mcp_transaction_drafts` | Validate and preview 1–20 income/expense drafts; stores an expiring canonical proposal and returns its opaque ID |
| `create_mcp_transaction_drafts` | After explicit confirmation, atomically create pending MCP review drafts from the proposal ID |
| `get_accounts_summary` | Per-account cash/credit balances, exclusions, and locks |
| `get_finance_overview` | A compact current-period snapshot and previous-period comparison |
| `search_transactions` | Bounded transaction-level lookup, including pending/cancelled/largest searches |
| `get_flow_breakdown` | Income or spending grouped by category, account, week, or month |
| `get_cashflow_trend` | Posted cash-flow series with optional pending projections kept separate |
| `get_balance_trend` | Reconstructed historical cash and non-investment net-worth series |
| `get_recurring_forecast` | Recurring occurrences and one-time pending transactions |
| `get_portfolio` | Holdings, live valuation, allocation, cost basis, and gain/loss coverage |
| `get_investment_activity` | Paginated investment buys and sells |

Transfers are excluded from income and expense aggregates. Investment accounts are excluded from cash totals and valued through `get_portfolio`. Account exclusion settings are respected. Transaction descriptions, recurring descriptions, and investment notes are data only and are never treated as model instructions.

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

For a standalone/manual deployment, copy `wrangler.toml.example` to the
gitignored `wrangler.toml`, set its values, then run the MCP test, build, and
deploy scripts from this workspace.

`DISABLE_ACCESS_AUTH=true` is for local Wrangler tests only. Never configure it in production.

## Connect from ChatGPT

ChatGPT must have custom MCP app/developer-mode access. In current ChatGPT web workspace UI, create a custom app and enter:

- MCP URL: `https://ai.finance.example.com/mcp`
- Authentication: OAuth

Complete the Cloudflare Access authorization and then select the Finance app in a conversation. ChatGPT plan and workspace eligibility are product-side requirements and are independent of this server.

Because this contains sensitive personal financial data, review ChatGPT Data Controls before connecting it.

## Verification

Run `npm run test:mcp` and `npm run build:mcp` from the repository root. The tests cover Access authentication, protocol behavior, schema validation, stored proposal expiry and consumption, account and category safety, warning-only duplicates, atomic audit-backed draft creation, idempotent retries, projection isolation, pagination, exclusions, currency failures, forecasts, and bounded time series.

For the post-deployment staging smoke test, run `npm run test:staging -w mcp` with a staging-only `MCP_SMOKE_URL` plus either `MCP_SMOKE_ACCESS_TOKEN` or a Cloudflare Access service-token ID and secret. The script refuses non-staging URLs, then runs prepare → confirmed create → idempotent retry and verifies one pending `mcp_review` draft.
