# External Integrations

**Analysis Date:** 2026-03-30

## APIs & External Services

### Meta Ads (Facebook/Instagram Ads)

- **Purpose:** Fetch campaign performance data (reach, impressions, clicks, spend, leads)
- **API:** Facebook Graph API v21.0
- **Base URL:** `https://graph.facebook.com/v21.0`
- **Route:** `src/app/api/meta-ads/route.ts` (GET)
- **Auth:** Long-lived access token passed as query parameter
- **Env vars:**
  - `META_ACCESS_TOKEN` - User access token
  - `META_AD_ACCOUNT_ID` - Ad account ID (used as `act_{id}`)
  - `META_APP_ID` - Facebook App ID (used for token debug/renewal)
  - `META_APP_SECRET` - Facebook App Secret (used for token debug/renewal)
- **Endpoints called:**
  - `GET /act_{accountId}/insights` - Campaign-level insights with date range filtering
  - `GET /debug_token` - Token expiration check (via cron)
  - `GET /oauth/access_token` - Token renewal via `fb_exchange_token` grant (via cron)
- **Data extracted:** `campaign_id`, `campaign_name`, `reach`, `impressions`, `clicks`, `spend`, `actions` (filtered for `lead` and `onsite_conversion.lead_grouped`)
- **Query params accepted:** `from` (YYYY-MM-DD), `to` (YYYY-MM-DD); defaults to last 7 days
- **Graceful degradation:** Returns `{ configured: false }` if env vars missing; UI shows placeholder

### Google Ads

- **Purpose:** Fetch campaign performance data (impressions, clicks, cost, conversions)
- **API:** Google Ads REST API v23
- **Base URL:** `https://googleads.googleapis.com/v23`
- **Route:** `src/app/api/google-ads/route.ts` (GET)
- **Auth:** OAuth2 refresh token flow -> Bearer token + developer token header
- **Env vars:**
  - `GOOGLE_CLIENT_ID` - OAuth2 client ID (shared with Analytics)
  - `GOOGLE_CLIENT_SECRET` - OAuth2 client secret (shared with Analytics)
  - `GOOGLE_REFRESH_TOKEN` - OAuth2 refresh token (shared with Analytics)
  - `GOOGLE_ADS_DEVELOPER_TOKEN` - Google Ads developer token
  - `GOOGLE_ADS_CUSTOMER_ID` - Google Ads customer ID
  - `GOOGLE_ADS_LOGIN_CUSTOMER_ID` - MCC login customer ID (optional, used as `login-customer-id` header)
- **OAuth token endpoint:** `https://oauth2.googleapis.com/token` (refresh_token grant)
- **Endpoints called:**
  - `POST /customers/{id}/googleAds:search` - GAQL queries for campaign metrics
- **GAQL queries:**
  1. Customer info check: `SELECT customer.id, customer.descriptive_name, customer.status FROM customer LIMIT 1`
  2. Campaign data: `SELECT campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date BETWEEN ... AND campaign.status = 'ENABLED'`
- **Query params accepted:** `from` (YYYY-MM-DD), `to` (YYYY-MM-DD); defaults to last 30 days
- **Special handling:** Returns friendly message if account returns 403 (account in setup / missing billing)
- **Note:** `google-ads-api` npm package is installed but NOT used; all calls are raw `fetch`

### Google Analytics (GA4)

- **Purpose:** Fetch website traffic data (users, sessions, page views, bounce rate, conversions, traffic sources)
- **API:** Google Analytics Data API v1beta
- **Base URL:** `https://analyticsdata.googleapis.com/v1beta`
- **Route:** `src/app/api/analytics/route.ts` (GET)
- **Auth:** Same OAuth2 refresh token flow as Google Ads (shared credentials)
- **Env vars:**
  - `GA_PROPERTY_ID` - GA4 property ID
  - `GOOGLE_CLIENT_ID` - Shared OAuth2 client
  - `GOOGLE_CLIENT_SECRET` - Shared OAuth2 secret
  - `GOOGLE_REFRESH_TOKEN` - Shared OAuth2 refresh token
- **Reports fetched (4 parallel requests):**
  1. **Overview:** activeUsers, sessions, screenPageViews, averageSessionDuration, bounceRate, conversions
  2. **Traffic sources:** sessionDefaultChannelGroup with sessions, activeUsers, conversions (top 10)
  3. **Daily breakdown:** date dimension with 7 metrics (users, sessions, pageViews, engagementRate, bounceRate, conversions, avgDuration)
  4. **Top pages:** pagePath with screenPageViews and activeUsers (top 10)
- **Query params accepted:** `days` (integer, default 30)

### Senior UAU ERP

- **Purpose:** Real estate ERP - fetch lot inventory status, sales data, receivables/installments, financial projections
- **API:** Senior UAU REST API
- **Base URL:** `https://gamma-api.seniorcloud.com.br:51928/uauAPI` (configurable via env)
- **Auth module:** `src/lib/uau-auth.ts`
- **Auth flow:**
  1. Call `POST /api/v1/Autenticador/AutenticarUsuario` with `{ login, senha }` + `X-INTEGRATION-Authorization` header
  2. Returns a bearer token (plain text, quotes stripped)
  3. Subsequent calls use `Authorization: {token}` + `X-INTEGRATION-Authorization: {integrationToken}` headers
- **Env vars:**
  - `UAU_LOGIN` - ERP user login
  - `UAU_PASSWORD` - ERP user password
  - `UAU_INTEGRATION_TOKEN` - Integration authorization token
  - `UAU_API_URL` - Base URL (optional, defaults to Senior cloud gamma endpoint)
- **Routes and endpoints:**

| Dashboard Route | UAU Endpoint | Purpose |
|---|---|---|
| `src/app/api/uau/route.ts` (GET) | `POST Espelho/BuscaUnidadesDeAcordoComWhereDetalhado` | Lot inventory with status (available/sold) |
| `src/app/api/uau/vendas/route.ts` (GET) | `POST Espelho/BuscaUnidadesDeAcordoComWhereDetalhado` + `POST Venda/ConsultarResumoVenda` (per sale) | Sales history with buyer/broker details |
| `src/app/api/uau/financeiro/route.ts` (GET) | `POST Venda/RetornaChavesVendasPorPeriodo` + `POST Venda/ConsultarResumoVenda` (batch) + `POST Venda/BuscarParcelasAReceber` | Financial: receivables, delinquency, projections |

- **Data model:** UAU returns data in `[{ MyTable: [headerRow, ...dataRows] }]` format; the `extractMyTable()` helper strips the header row
- **Concurrency:** Batch requests to `ConsultarResumoVenda` run 5 at a time using `Promise.allSettled`
- **Timeouts:** 15-20 second abort controller timeouts on UAU calls
- **Caching:** In-memory `Map` cache with 5-minute TTL on vendas and financeiro routes
- **Static data enrichment:** `src/data/lotes.json` contains 494+ lots with quadra, lote, area, street, price, classification; UAU status is merged with this static data
- **Function duration:** `maxDuration = 30` on estoque route, `maxDuration = 60` on vendas and financeiro routes (Vercel serverless config)
- **Graceful degradation:** If UAU is not configured or offline, estoque route returns static data only with `uauStatus: "not_configured"` or `"offline"`

## Data Storage

**Primary Storage (Metrics):**
- Vercel Blob Storage via `@vercel/blob`
- File: `metrics.json` (single JSON blob)
- Contains: Dashboard configuration + weekly channel data (semanas)
- Route: `src/app/api/metrics/route.ts` (GET, POST, PUT)
- Access: Public blob with `addRandomSuffix: false` and `allowOverwrite: true`
- Auth for writes: `Authorization: Bearer {DASHBOARD_PASSWORD}` header

**Static Data:**
- `src/data/lotes.json` - Lot inventory master data (quadra, lote, area, street, price, classification)
- Loaded at module level into a `Map` for O(1) lookups by lot identifier

**Caching:**
- In-memory `Map` caches with 5-minute TTL in `src/app/api/uau/vendas/route.ts` and `src/app/api/uau/financeiro/route.ts`
- No external cache service (Redis, etc.)

**Databases:**
- None. All persistence is via Vercel Blob and static JSON files.

## Authentication & Identity

**Dashboard Auth:**
- Simple password-based authentication
- Route: `src/app/api/auth/route.ts` (POST)
- Client sends `{ password }`, server compares against `DASHBOARD_PASSWORD` env var
- No session tokens or JWT; password is stored in client state as `authToken` and sent as Bearer token on data mutation requests
- Component: `src/components/LoginScreen.tsx`

**API Route Auth:**
- Data read routes (GET) are public (no auth required)
- Data write routes (POST/PUT on `/api/metrics`) require `Authorization: Bearer {DASHBOARD_PASSWORD}`
- Cron route requires `Authorization: Bearer {CRON_SECRET}`

## Monitoring & Observability

**Error Tracking:**
- None. No Sentry, Datadog, or similar service.

**Logs:**
- `console.log` and `console.error` only
- Notification system stub in cron route (`sendNotificationEmail` logs to console)

## CI/CD & Deployment

**Hosting:**
- Vercel (serverless)

**CI Pipeline:**
- Not detected. No GitHub Actions, CircleCI, or similar config files present.

**Deployment:**
- Vercel auto-deploy (assumed from Vercel project setup)
- `vercel.json` configures a daily cron job at 09:00 UTC

## Scheduled Jobs

**Meta Token Health Check:**
- Route: `src/app/api/cron/route.ts` (GET)
- Schedule: Daily at 09:00 UTC (`vercel.json`)
- Behavior:
  1. Debugs current Meta access token via Graph API
  2. If token expires in < 7 days, attempts automatic renewal via `fb_exchange_token`
  3. If renewal succeeds, updates the `META_ACCESS_TOKEN` env var on Vercel via Vercel REST API
  4. If renewal fails or token is expired, logs a notification (email sending is stubbed)
- **Env vars needed:** `VERCEL_TOKEN`, `VERCEL_PROJECT_ID` (for env var updates)

## Vercel Platform API

- **Purpose:** Automated Meta Ads token renewal
- **Route:** Used inside `src/app/api/cron/route.ts`
- **Endpoints called:**
  - `GET https://api.vercel.com/v9/projects/{projectId}/env` - List env vars
  - `PATCH https://api.vercel.com/v9/projects/{projectId}/env/{envId}` - Update env var value
- **Auth:** `Authorization: Bearer {VERCEL_TOKEN}`
- **Env vars:** `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None (notification email is stubbed as `console.log`)

## Environment Configuration

**Required env vars (minimum for all features):**

| Variable | Service | Required |
|---|---|---|
| `DASHBOARD_PASSWORD` | Dashboard login + API auth | Yes |
| `META_ACCESS_TOKEN` | Meta Ads | For Meta integration |
| `META_AD_ACCOUNT_ID` | Meta Ads | For Meta integration |
| `META_APP_ID` | Meta token renewal | For auto-renewal |
| `META_APP_SECRET` | Meta token renewal | For auto-renewal |
| `GOOGLE_CLIENT_ID` | Google OAuth (Ads + GA) | For Google integrations |
| `GOOGLE_CLIENT_SECRET` | Google OAuth | For Google integrations |
| `GOOGLE_REFRESH_TOKEN` | Google OAuth | For Google integrations |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Google Ads | For Google Ads |
| `GOOGLE_ADS_CUSTOMER_ID` | Google Ads | For Google Ads |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Google Ads MCC | Optional |
| `GA_PROPERTY_ID` | Google Analytics | For GA integration |
| `UAU_LOGIN` | Senior UAU ERP | For ERP integration |
| `UAU_PASSWORD` | Senior UAU ERP | For ERP integration |
| `UAU_INTEGRATION_TOKEN` | Senior UAU ERP | For ERP integration |
| `UAU_API_URL` | Senior UAU ERP | Optional (has default) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob | For metrics storage |
| `VERCEL_TOKEN` | Vercel API | For auto token renewal |
| `VERCEL_PROJECT_ID` | Vercel API | For auto token renewal |
| `CRON_SECRET` | Cron auth | For cron security |
| `NOTIFICATION_EMAIL` | Alerts | Optional |

**Secrets location:**
- `.env.local` for development
- `.env.prod` for production reference
- Vercel dashboard for production deployment

## Integration Architecture Pattern

All external API integrations follow the same pattern:

1. **Check configuration:** If env vars are missing, return `{ configured: false }` with a friendly message
2. **Authenticate:** Obtain/refresh access token
3. **Fetch data:** Call external API with error handling
4. **Transform:** Parse and aggregate response data
5. **Return:** JSON response with `configured: true` and structured data

Each integration is a standalone Next.js API route with no shared state between routes (except the UAU auth module at `src/lib/uau-auth.ts`).

---

*Integration audit: 2026-03-30*
