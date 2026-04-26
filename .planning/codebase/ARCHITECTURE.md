# Architecture

**Analysis Date:** 2026-03-30

## Pattern Overview

**Overall:** Single-Page Application (SPA) with Next.js App Router

**Key Characteristics:**
- Single route (`/`) renders the entire dashboard as a client-side SPA with tab-based navigation
- No file-system routing for pages -- all UI lives in `src/app/page.tsx` with tab switching via React state
- API Routes (Next.js Route Handlers) serve as a BFF (Backend-for-Frontend) layer proxying external services
- Data persistence via Vercel Blob Storage (no traditional database)
- Password-based authentication with no session tokens or JWT -- password is kept in client memory as `authToken`

## Layers

**Presentation Layer (Client Components):**
- Purpose: Render dashboard UI with charts, KPI cards, tables, and forms
- Location: `src/components/`
- Contains: Tab components (`Tab*.tsx`), shared UI (`KPICard.tsx`, `DateRangeFilter.tsx`), login (`LoginScreen.tsx`), data entry form (`FormSemanal.tsx`)
- Depends on: `src/lib/types.ts` for types and utility functions, `recharts` for charts, `lucide-react` for icons
- Used by: `src/app/page.tsx`

**Page Orchestrator:**
- Purpose: Root client component that manages all application state, authentication gating, tab routing, and data fetching orchestration
- Location: `src/app/page.tsx`
- Contains: All top-level state (auth, tab selection, metrics data, estoque data, financeiro data), data fetching side effects, header/footer/tab bar layout
- Depends on: All components in `src/components/`, API routes via `fetch()`
- Used by: Next.js App Router as the single page

**API Layer (Route Handlers):**
- Purpose: Server-side endpoints that proxy external APIs, handle auth, and manage data persistence
- Location: `src/app/api/`
- Contains: REST endpoints returning JSON
- Depends on: `@vercel/blob` for storage, `src/lib/uau-auth.ts` for ERP authentication, external APIs (Google, Meta, Senior UAU)
- Used by: Client components via `fetch()`

**Shared Library:**
- Purpose: Type definitions, KPI calculation logic, formatting utilities, ERP auth helpers
- Location: `src/lib/`
- Contains: `types.ts` (interfaces, calculation functions, formatters), `uau-auth.ts` (UAU ERP authentication and fetch wrapper)
- Used by: Both API routes and client components

**Static Data:**
- Purpose: Lot inventory master data (prices, areas, classifications) used to enrich ERP responses
- Location: `src/data/lotes.json`
- Contains: Array of lot objects with id, quadra, lote, area, rua, valorTotal, valorM2, classificacao
- Used by: `src/app/api/uau/route.ts`, `src/app/api/uau/vendas/route.ts`

## Data Flow

**Marketing Metrics (Manual Entry):**

1. User fills `FormSemanal` component with weekly channel data (investment, leads, sales per channel)
2. Component POSTs to `/api/metrics` with `Authorization: Bearer <password>`
3. API reads current data from Vercel Blob, upserts the week, writes back to Blob
4. `page.tsx` calls `loadData()` which GETs `/api/metrics` and updates `data` state
5. Tab components (`TabVisaoGeral`, `TabCanais`, `TabQualidade`) receive `data` as props and compute KPIs via `calcKPIs()` / `calcKPIsPorCanal()`

**ERP Estoque (Inventory):**

1. User clicks "Estoque" tab -- `page.tsx` triggers lazy fetch via `useEffect`
2. Client GETs `/api/uau`
3. API authenticates with Senior UAU ERP via `src/lib/uau-auth.ts`
4. API calls `Espelho/BuscaUnidadesDeAcordoComWhereDetalhado` SOAP-like endpoint
5. API merges ERP unit statuses with static lot data from `src/data/lotes.json`
6. Response with enriched inventory is stored in `estoqueData` state, passed to `TabEstoque`

**ERP Financeiro (Financial):**

1. User clicks "Financeiro" tab -- `page.tsx` triggers lazy fetch via `useEffect`
2. Client GETs `/api/uau/financeiro`
3. API authenticates with UAU, fetches sale keys via `Venda/RetornaChavesVendasPorPeriodo`, then batch-fetches individual sale summaries via `Venda/ConsultarResumoVenda` (5 concurrent)
4. API also fetches receivable installments via `Venda/BuscarParcelasAReceber`
5. API computes inadimplencia (delinquency) metrics and sales projections using weighted moving average
6. Response cached in-memory for 5 minutes (`Map` cache with TTL)

**Google Analytics:**

1. `TabAnalytics` component fetches `/api/analytics?days=N` on mount
2. API exchanges Google OAuth refresh token for access token
3. API makes 4 parallel requests to GA4 Data API: overview metrics, traffic sources, daily data, top pages
4. Data returned to component which manages its own state

**Ad Platforms (Google Ads / Meta Ads):**

1. `TabIntegracoes` fetches `/api/google-ads` and `/api/meta-ads` on mount
2. Each API authenticates with respective platform (OAuth for Google, access token for Meta)
3. Campaign-level data returned with computed aggregates (CTR, CPC, CPL)

**State Management:**
- No external state library -- all state lives in `useState` hooks in `src/app/page.tsx`
- `data` (MetricsData) is the core state, fetched once on auth and passed as props to most tabs
- `estoqueData` and `financeiroData` are lazy-loaded when their respective tabs are first selected, using `*Fetched` boolean flags to prevent re-fetching
- `TabAnalytics` and `TabIntegracoes` manage their own fetch cycles internally (no props from parent)
- Theme (dark/light) persisted to `localStorage`

## Key Abstractions

**MetricsData:**
- Purpose: Core data structure representing the entire marketing dataset
- Definition: `src/lib/types.ts` lines 44-47
- Pattern: Contains `config` (campaign settings, targets/metas, VGV) and `semanas[]` (weekly data per channel)
- Stored as a single JSON blob in Vercel Blob Storage

**CanalData:**
- Purpose: Per-channel weekly metrics (investimento, leads, vendas, valorVendas, leadsQualificados, comparecimentos, slaRespostaMin)
- Definition: `src/lib/types.ts` lines 1-9
- Pattern: Nested inside each `SemanaData.canais` as `Record<string, CanalData>`

**KPI Calculation Functions:**
- Purpose: Derive marketing KPIs (CPL, CAC, ROI, VSO, TLQ, TCS) from raw data
- Functions: `calcKPIs()`, `calcKPIsPorCanal()` in `src/lib/types.ts`
- Pattern: Pure functions that aggregate across weeks and compare against metas

**UAU Auth Module:**
- Purpose: Encapsulate Senior UAU ERP authentication and API communication
- Location: `src/lib/uau-auth.ts`
- Exports: `authenticate()`, `uauFetch()`, `uauHeaders()`, `isUauConfigured()`, `UAU_API`
- Pattern: Stateless functions; token is obtained per-request (no caching of auth token)

## Entry Points

**Page Entry (`/`):**
- Location: `src/app/page.tsx`
- Triggers: Browser navigation to root URL
- Responsibilities: Auth gate, tab navigation, data loading orchestration, layout rendering

**API Entry Points:**
- `/api/auth` (`src/app/api/auth/route.ts`): POST -- password verification
- `/api/metrics` (`src/app/api/metrics/route.ts`): GET (read), POST (upsert week), PUT (bulk update)
- `/api/analytics` (`src/app/api/analytics/route.ts`): GET -- Google Analytics data
- `/api/google-ads` (`src/app/api/google-ads/route.ts`): GET -- Google Ads campaign data
- `/api/meta-ads` (`src/app/api/meta-ads/route.ts`): GET -- Meta Ads campaign data
- `/api/uau` (`src/app/api/uau/route.ts`): GET -- inventory/estoque from ERP
- `/api/uau/vendas` (`src/app/api/uau/vendas/route.ts`): GET -- sales history from ERP
- `/api/uau/financeiro` (`src/app/api/uau/financeiro/route.ts`): GET -- financial data from ERP

**Cron Entry:**
- `/api/cron` (`src/app/api/cron/route.ts`): GET -- runs daily at 09:00 UTC (Vercel Cron), checks Meta token expiration and attempts auto-renewal via Vercel API

## Error Handling

**Strategy:** Defensive with graceful degradation

**Patterns:**
- API routes wrap everything in try/catch, return `{ error: string }` with appropriate HTTP status
- Client components show inline error messages with "Tentar novamente" (retry) buttons
- ERP endpoints (`/api/uau`, `/api/uau/financeiro`, `/api/uau/vendas`) use AbortController timeouts (10-20s) to avoid hanging on slow ERP responses
- When UAU ERP is not configured or offline, `/api/uau` still returns enriched data from static `lotes.json` with `uauStatus: "not_configured"` or `"offline"`
- Analytics and ad platform APIs return `{ configured: false }` when env vars are missing, allowing the UI to show "not configured" instead of errors

## Cross-Cutting Concerns

**Logging:** `console.log` / `console.error` only, no structured logging framework

**Validation:** Minimal -- API inputs are not schema-validated; relies on TypeScript types at compile time

**Authentication:**
- Simple password check against `DASHBOARD_PASSWORD` env var
- Login screen calls `/api/auth` POST; on success, password stored in React state as `authToken`
- Write endpoints (`POST /api/metrics`, `PUT /api/metrics`) require `Authorization: Bearer <password>` header
- Read endpoints (GET) have no auth -- publicly accessible
- No session management, no token expiration, no RBAC

**Caching:**
- `/api/uau/financeiro` and `/api/uau/vendas` use in-memory `Map` caches with 5-minute TTL
- Vercel Blob reads use `cache: "no-store"` to bypass CDN cache
- No client-side caching beyond React state (page reload re-fetches everything)

**Theming:**
- Dark/light mode via CSS custom properties in `src/app/globals.css`
- Theme preference stored in `localStorage`, applied via inline script in `src/app/layout.tsx` to prevent flash
- Toggle managed in `src/app/page.tsx` via `dark` state

---

*Architecture analysis: 2026-03-30*
