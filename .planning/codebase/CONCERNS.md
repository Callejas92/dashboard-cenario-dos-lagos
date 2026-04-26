# Codebase Concerns

**Analysis Date:** 2026-03-30

## Security Considerations

**No Authentication on Read API Routes:**
- Risk: All GET API routes (`/api/meta-ads`, `/api/google-ads`, `/api/analytics`, `/api/uau`, `/api/uau/financeiro`, `/api/uau/vendas`, `/api/metrics`) are publicly accessible without any authentication. Anyone who knows the URL can read all marketing metrics, financial data, customer names, CPF/CNPJ numbers, and sales details.
- Files: `src/app/api/meta-ads/route.ts`, `src/app/api/google-ads/route.ts`, `src/app/api/analytics/route.ts`, `src/app/api/uau/route.ts`, `src/app/api/uau/financeiro/route.ts`, `src/app/api/uau/vendas/route.ts`, `src/app/api/metrics/route.ts`
- Current mitigation: Only POST/PUT on `/api/metrics` checks authorization. GET on `/api/metrics` is wide open.
- Recommendations: Add a Next.js middleware (`src/middleware.ts`) that validates a session token or API key on all `/api/*` routes except `/api/auth`. At minimum, require the `Bearer` password header on all GET routes.

**Weak Authentication System (Plain Password, No Sessions):**
- Risk: Authentication is a single shared password compared via plaintext equality. No session tokens, no JWTs, no cookies. The password is stored in React state (`authToken`) and sent as a Bearer token only to `/api/metrics` POST/PUT. A page refresh logs the user out. There is no brute-force protection.
- Files: `src/app/api/auth/route.ts`, `src/components/LoginScreen.tsx`, `src/app/page.tsx` (lines 31, 131, 261)
- Current mitigation: None
- Recommendations: Implement proper session management using cookies (e.g., `iron-session` or `next-auth`). Add rate limiting to the auth endpoint. Use constant-time comparison for password checking instead of `===`.

**Meta Access Token Exposed in URL Query String:**
- Risk: The Meta Ads access token is passed directly in the URL query parameter (`access_token=${accessToken}`). This token appears in server logs, CDN logs, and potentially browser history if ever called client-side. URL-based tokens are a known security anti-pattern.
- Files: `src/app/api/meta-ads/route.ts` (line 25), `src/app/api/cron/route.ts` (line 15)
- Current mitigation: None
- Recommendations: Use the `Authorization: Bearer` header instead of the `access_token` query parameter. The Meta Graph API supports header-based auth.

**PII Exposure in API Responses:**
- Risk: The `/api/uau/vendas` endpoint returns customer names (`compradorNome`), CPF/CNPJ (`compradorCpfCnpj`), and broker names in its response. Since the endpoint has no authentication, this is a LGPD (Brazilian data protection law) violation risk.
- Files: `src/app/api/uau/vendas/route.ts` (lines 184-191)
- Current mitigation: None
- Recommendations: Require authentication on this route. Mask CPF/CNPJ values (show only last 4 digits). Consider whether full PII is necessary in the frontend.

**Debug Data Leaked in Production Response:**
- Risk: The vendas API response includes a `_debug` field with internal ERP field names and row counts, exposing implementation details.
- Files: `src/app/api/uau/vendas/route.ts` (lines 222-225)
- Current mitigation: None
- Recommendations: Remove the `_debug` field or gate it behind a `NODE_ENV !== 'production'` check.

**Metrics Data Stored as Public Blob:**
- Risk: The `@vercel/blob` storage uses `access: "public"` for the `metrics.json` file, meaning anyone with the blob URL can read all historical marketing metrics without authentication.
- Files: `src/app/api/metrics/route.ts` (lines 34, 50)
- Current mitigation: None. The blob URL follows a predictable pattern.
- Recommendations: Change to `access: "private"` if supported, or add a layer of encryption.

**Cron Endpoint Auth Is Optional:**
- Risk: The cron secret check uses `if (cronSecret && ...)`, meaning if `CRON_SECRET` is not set, the endpoint is completely open. Anyone can trigger Meta token checks and Vercel env var updates.
- Files: `src/app/api/cron/route.ts` (line 111)
- Current mitigation: Relies on the env var being set.
- Recommendations: Fail closed: if `CRON_SECRET` is not set, reject all requests.

## Tech Debt

**Massive God Component (`page.tsx`):**
- Issue: The root page component manages all application state (auth, theme, metrics, estoque, financeiro), inline type definitions, and data fetching for every tab. It acts as both layout and state manager.
- Files: `src/app/page.tsx` (276 lines)
- Impact: Adding new tabs or state requires editing this single file. Hard to reason about, hard to test.
- Fix approach: Extract state management into custom hooks (`useEstoque`, `useFinanceiro`, `useMetrics`). Move the interface definitions in lines 38-45 to `src/lib/types.ts`. Consider using React Context or a lightweight state manager.

**Duplicated Code Across UAU API Routes:**
- Issue: The `extractMyTable` function is copy-pasted identically in `src/app/api/uau/financeiro/route.ts` (lines 30-40) and `src/app/api/uau/vendas/route.ts` (lines 44-54). The `parseDate` function is also duplicated between these two files. The `LoteStatic` interface and `lotesMap` construction are duplicated between `src/app/api/uau/route.ts` and `src/app/api/uau/vendas/route.ts`.
- Files: `src/app/api/uau/financeiro/route.ts`, `src/app/api/uau/vendas/route.ts`, `src/app/api/uau/route.ts`
- Impact: Bug fixes must be applied in multiple places. Risk of drift between implementations.
- Fix approach: Move `extractMyTable`, `parseDate`, `LoteStatic`, and `lotesMap` into `src/lib/uau-auth.ts` or a new `src/lib/uau-utils.ts` module.

**Duplicated OAuth Token Fetch:**
- Issue: The `getAccessToken()` function for Google OAuth is duplicated identically in `src/app/api/google-ads/route.ts` (lines 14-29) and `src/app/api/analytics/route.ts` (lines 5-20).
- Files: `src/app/api/google-ads/route.ts`, `src/app/api/analytics/route.ts`
- Impact: If the OAuth flow changes, both files must be updated.
- Fix approach: Extract into a shared `src/lib/google-auth.ts` module.

**In-Memory Cache in Serverless Functions:**
- Issue: The financeiro and vendas routes use `const cache = new Map()` for in-memory caching with a 5-minute TTL. In Vercel's serverless environment, each invocation may run in a different instance, making this cache ineffective. The cache only helps during warm function reuse within the same instance.
- Files: `src/app/api/uau/financeiro/route.ts` (lines 53-54), `src/app/api/uau/vendas/route.ts` (lines 70-71)
- Impact: Most requests still hit the UAU ERP API, which has a 15-20 second timeout. Users experience unnecessary latency.
- Fix approach: Use Vercel KV, or cache responses in the Vercel Blob store with a TTL. Alternatively, use `unstable_cache` from Next.js with revalidation.

**Unused Function:**
- Issue: `formatDateUAU` in `src/app/api/uau/financeiro/route.ts` (line 258) is defined but never called.
- Files: `src/app/api/uau/financeiro/route.ts` (line 258-261)
- Impact: Dead code.
- Fix approach: Remove it.

**`@types/node` and `@types/react` in `dependencies` Instead of `devDependencies`:**
- Issue: Type definition packages are listed under `dependencies` in `package.json`, increasing the production bundle unnecessarily.
- Files: `package.json` (lines for `@types/node` and `@types/react`)
- Impact: Slightly larger install in production. Not critical but indicates sloppy dependency management.
- Fix approach: Move `@types/node`, `@types/react`, and `typescript` to `devDependencies`.

## Performance Bottlenecks

**UAU ERP N+1 API Calls:**
- Problem: The financeiro route fetches sale keys, then makes individual `ConsultarResumoVenda` calls for each sale in batches of 5. With 100+ sales, this creates 20+ sequential batch rounds, each with a 10-second timeout.
- Files: `src/app/api/uau/financeiro/route.ts` (lines 180-210), `src/app/api/uau/vendas/route.ts` (lines 149-171)
- Cause: The UAU ERP API does not offer a bulk resume endpoint, forcing individual lookups.
- Improvement path: Cache results aggressively (see cache concern above). Pre-fetch and store sale summaries via a scheduled cron job. Set `maxDuration = 60` is already in place but the user still waits.

**No Client-Side Caching or SWR:**
- Problem: Every tab switch to "estoque" or "financeiro" fetches data fresh (guarded only by `estoqueFetched` / `financeiroFetched` booleans). A page refresh re-fetches everything. There is no `stale-while-revalidate` pattern.
- Files: `src/app/page.tsx` (lines 86-128)
- Cause: Raw `fetch()` calls without any caching library.
- Improvement path: Use `swr` or `react-query` (TanStack Query) for client-side data fetching with caching, revalidation, and error retry.

**Analytics Route Makes 4 Sequential API Calls:**
- Problem: The Google Analytics route makes 4 separate calls to the GA Data API (overview, sources, daily, pages), each waiting for the previous to complete. These are independent and could be parallelized.
- Files: `src/app/api/analytics/route.ts` (lines 40-154)
- Cause: Sequential `await fetch()` calls instead of `Promise.all()`.
- Improvement path: Use `Promise.all([overviewRes, sourceRes, dailyRes, pagesRes])` to run all 4 requests in parallel.

**Large Component Files:**
- Problem: `TabEstoque.tsx` (775 lines) and `TabVisaoGeral.tsx` (674 lines) are monolithic components. These take longer to parse and are harder to maintain.
- Files: `src/components/TabEstoque.tsx` (775 lines), `src/components/TabVisaoGeral.tsx` (674 lines), `src/components/TabQualidade.tsx` (423 lines)
- Cause: All sub-sections, charts, and tables are inlined in single components.
- Improvement path: Extract sub-sections into smaller components (e.g., `EstoqueQuadrasTable`, `EstoqueMapaVisual`, `VisaoGeralKPIs`).

## Fragile Areas

**UAU ERP Integration:**
- Files: `src/lib/uau-auth.ts`, `src/app/api/uau/route.ts`, `src/app/api/uau/financeiro/route.ts`, `src/app/api/uau/vendas/route.ts`
- Why fragile: The UAU API uses a non-standard response format (`[{MyTable: [...]}]` where the first row is metadata). The `extractMyTable` function uses `table.slice(1)` to skip the header row, which breaks if the API changes its response shape. Status matching uses `.includes("vendid")` substring matching, which is locale-sensitive and fragile.
- Safe modification: Always test against real UAU API responses. Add response schema validation. Keep sample API responses in a test fixtures directory.
- Test coverage: Zero tests exist.

**Meta Token Renewal:**
- Files: `src/app/api/cron/route.ts`
- Why fragile: The cron job attempts to auto-renew Meta tokens by updating Vercel environment variables via the Vercel API. This requires a redeploy to take effect, but no redeploy is triggered. The `sendNotificationEmail` function is a stub that only calls `console.log`.
- Safe modification: Verify the full token renewal flow end-to-end. Implement actual notification delivery.
- Test coverage: Zero tests exist.

**Static Lotes Data:**
- Files: `src/data/lotes.json`
- Why fragile: Lot pricing, areas, and classification data is hardcoded in a JSON file. If the real estate development adds new lots or changes prices, this file must be manually updated. The UAU route filters ERP units against this static map (`lotesMap.has(u.identificador)`), silently dropping any units not in the file.
- Safe modification: Validate that `lotes.json` IDs match ERP unit identifiers. Add a warning when ERP returns units not found in the static data.
- Test coverage: Zero tests exist.

## Test Coverage Gaps

**No Tests Exist:**
- What's not tested: The entire codebase has zero test files. No unit tests, no integration tests, no E2E tests.
- Files: All files in `src/`
- Risk: Any refactoring, dependency update, or feature addition could break existing functionality without detection. API response parsing, date formatting, status classification, financial calculations (inadimplencia, projections), and authentication are all untested.
- Priority: High. Start with:
  1. Unit tests for `src/lib/uau-auth.ts` (auth flow, header construction)
  2. Unit tests for `extractMyTable` and `parseDate` utility functions
  3. Unit tests for `calcProjecoes` and `groupByMonth` financial calculations in `src/app/api/uau/financeiro/route.ts`
  4. Integration tests for API routes with mocked external services

## Scaling Limits

**Single Vercel Blob File for All Metrics:**
- Current capacity: Works fine for < 78 weeks of data (single JSON file).
- Limit: If the dashboard is reused for multiple developments or if weekly data grows in complexity, the single JSON blob will become slow to read/write atomically.
- Scaling path: Migrate to a proper database (Vercel Postgres, Supabase, PlanetScale) for structured querying.

**UAU ERP Timeout:**
- Current capacity: 15-second timeout per API call, 60-second max function duration.
- Limit: As more sales accumulate, the N+1 pattern in financeiro/vendas will eventually exceed the 60-second Vercel function limit.
- Scaling path: Implement a background data sync job that periodically fetches and caches all ERP data, rather than querying live on each request.

## Dependencies at Risk

**Meta Graph API v21.0:**
- Risk: Meta deprecates Graph API versions aggressively (typically ~2 years). v21.0 will eventually be sunset.
- Impact: All Meta Ads data fetching breaks.
- Files: `src/app/api/meta-ads/route.ts` (line 3), `src/app/api/cron/route.ts` (lines 3-4)
- Migration plan: Monitor Meta's deprecation schedule. Update the version constant when needed.

**Google Ads API v23:**
- Risk: Google Ads API versions are deprecated yearly.
- Impact: Campaign data fetching breaks.
- Files: `src/app/api/google-ads/route.ts` (line 3)
- Migration plan: Monitor Google's deprecation schedule. The `google-ads-api` npm package (v23.0.0) is installed but not actually used -- raw REST calls are made instead, doubling the maintenance burden.

## Missing Critical Features

**No Error Boundary:**
- Problem: There are no React Error Boundaries. If any tab component throws during render, the entire dashboard crashes with a white screen.
- Blocks: Reliable production usage.

**No Loading/Error States for Analytics Tab:**
- Problem: `TabAnalytics` is rendered without any loading or error state management from the parent. Unlike estoque and financeiro which have explicit loading/error handling in `page.tsx`, analytics handles everything internally, creating inconsistency.
- Files: `src/app/page.tsx` (line 217), `src/components/TabAnalytics.tsx`

**No Data Validation on Form Submission:**
- Problem: The `FormSemanal` component sends whatever the user types to the API. There is no validation that investment values are positive, that leads count is reasonable, or that the week number is within the valid range. The API (`/api/metrics` POST) blindly merges the submitted data.
- Files: `src/components/FormSemanal.tsx`, `src/app/api/metrics/route.ts` (lines 66-89)
- Blocks: Data integrity.

---

*Concerns audit: 2026-03-30*
