# Private API access and public demos

Finance Manager has exactly two authentication modes. `API_AUTH_MODE=private`
is the default and verifies Cloudflare Access identity before every read/write.
`API_AUTH_MODE=public` deliberately permits unauthenticated reads/writes for a
demo or local development. Missing private configuration or an invalid mode
fails closed. There is no legacy shared API key and no automatic public fallback.

The frontend uses `VITE_API_AUTH_MODE` with the same value. The deployment CLI
sets it from `API_AUTH_MODE`; this is public configuration, not a credential.
The ledger remains single-user; Access does not add separate user databases.

## Configure private production

1. Choose an API custom hostname in your Cloudflare zone, preferably on the
   same site as the frontend: `finance.example.com` and `api.finance.example.com`.
   This avoids third-party cookie restrictions. The CLI requires a custom
   `API_URL`, configures its Worker custom-domain route, and disables workers.dev
   and preview URLs. It does not discover a private API URL automatically.
2. In Cloudflare Zero Trust, configure an Access self-hosted application covering
   the **entire API hostname**, not just `/auth/login`. Use an Allow policy for
   your exact email and your existing email one-time-code login. Do not add
   Bypass or Service Auth policies for financial endpoints. Keep the frontend
   protected too, including any alternate Pages addresses that serve its assets.
   Alternatively protect the whole API Worker with an equivalent user policy.
3. Copy the Access team HTTPS origin and API application's Application Audience
   (AUD) tag. Keep the MCP application/audience separate. Set:

   ```dotenv
   API_AUTH_MODE=private
   API_URL=https://api.finance.example.com
   ALLOWED_ORIGINS=https://finance.example.com
   API_ACCESS_TEAM_DOMAIN=https://your-team.cloudflareaccess.com
   API_ACCESS_AUD=your-api-application-audience
   API_ACCESS_ALLOWED_EMAIL=you@example.com
   ```

   `ALLOWED_ORIGINS` accepts comma-separated **exact HTTPS origins**. Wildcards,
   paths and trailing slashes are not supported. These settings are not secrets.
   Existing ignored files are preserved; remove old `API_SECRET`/`VITE_API_KEY`
   entries from local files yourself. The CLI removes the obsolete `API_SECRET`
   entry from saved deployment configuration when deploying API/client.
4. Configure Access's CORS handling so allowed OPTIONS preflight requests bypass
   Access and reach the Worker. OPTIONS carries no cookie and returns no finance
   data. Actual requests must still require Access. The Worker returns the exact
   allowed origin, `Access-Control-Allow-Credentials: true`, allowed methods
   `GET, POST, PUT, PATCH, DELETE, OPTIONS`, and headers `Content-Type, X-Client-Date`.
   If Access answers preflight itself, configure these same values there.
5. Configure Access cookies to permit same-site cross-origin requests (the two
   HTTPS subdomains above), and choose the desired session duration. Deploy API
   and client together with the same mode using `npm run deploy`. Access policy
   setup remains a Cloudflare dashboard operation; the CLI does not create it.

The frontend checks `/auth/session` before loading private financial data. If
the browser has no API cookie yet, **Sign in** navigates to the API's
`/auth/login?returnTo=...`. Cloudflare establishes that hostname's cookie, then
the authenticated Worker redirects back to an exact allowed frontend origin,
preserving the page URL. Cloudflare may reuse your existing team login; depending
on policy it may ask for another code. No code is required for each API request.

On expiry, financial writes fail without retries. Sign in opens another tab so
the original financial form stays mounted; return to it and use **Retry
connection**, then explicitly retry the save. A network failure can look like
an expired Access session, so retry is available too. Session cookies/tokens are
never copied into browser storage. Financial API responses are not cached by the
service worker; offline app-shell navigation does not grant access to the API.

## Public demo and local development

Deploy the public demo as a **separate Pages project, API Worker, and D1 database**
with only synthetic data. Use `API_AUTH_MODE=public`; the CLI builds the matching
public frontend, skips private Access configuration, and can discover its
workers.dev URL. Do not protect the demo frontend/API with Access. Public mode
does not make MCP public: its existing independent Access verification remains
required. Do not connect a public API to the private ledger, even if frontend
privacy masking is enabled. Public mode allows the API's existing mutations.

For local development copy `api/.dev.vars.example` and `client/.env.example`
without replacing existing files. They explicitly set public mode and
`ALLOWED_ORIGINS=http://localhost:5173`. There is no private-mode bypass flag.
The compiled Worker integration suite tests private mode with signed synthetic
Access JWTs and disposable D1, without Cloudflare credentials.

## Migration from browser API keys

This is a breaking authentication change. Existing private deployments must
configure API Access, its custom domain, mode and identity settings before
deploying the updated API/client. Existing public demos must explicitly select
public mode. The old key cannot authorize either mode. Deploy API and client
together, then refresh the frontend/PWA to load the new bundle. Existing local
configs need the new mode settings; missing settings do not enable public access.

## Smoke checks after deployment

- In a signed-out/incognito browser, the private frontend and API hostname must
  require Access login. Direct `/accounts`, `/export`, and mutation requests must
  not return financial data or apply changes. Inspect alternate Worker URLs to
  ensure workers.dev and previews are disabled.
- From the frontend, sign in, inspect `/auth/session` (200 with `mode: private`),
  load accounts, and save a harmless edit to a synthetic account. Verify the
  request includes the API session cookie and no `X-API-Key`.
- Allow a session to expire: reads/saves must fail, a sign-in/retry prompt must
  appear, and the unsaved form must survive reauthentication in another tab.
- Check preflight without credentials (substitute your own non-secret domains):

  ```bash
  curl -i -X OPTIONS https://api.finance.example.com/accounts \
    -H 'Origin: https://finance.example.com' \
    -H 'Access-Control-Request-Method: POST' \
    -H 'Access-Control-Request-Headers: Content-Type,X-Client-Date'
  ```

  Expect a successful preflight with the exact origin and credentials header.
  An actual unauthenticated request with that same Origin must be challenged or
  rejected; a copied old API key must not help.
- In public mode, verify keyless reads/writes work only against the isolated demo
  database. Public mode still enforces browser origin policy, not user identity.

## Troubleshooting

- **CORS/network error:** check the API custom hostname, cookie settings,
  preflight policy, exact frontend origin and whether the API cookie exists.
  Cross-site domains may be blocked by browser third-party-cookie policies.
- **401:** assertion missing, invalid, expired, or scoped to another application.
  Sign in to the API again and verify team origin and API AUD. Copying the email
  header or an MCP token cannot establish API identity.
- **403:** wrong allowed email or origin. Match Access policy and API email.
- **503 AUTH_CONFIG_INVALID:** missing/invalid private settings or unsupported
  mode. Fix configuration; never switch private finances to public to clear it.

References: [Cloudflare JWT verification](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/),
[Access CORS and cookies](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/),
[Worker Access protection](https://developers.cloudflare.com/workers/configuration/cloudflare-access/).
