# Technology Stack

**Analysis Date:** 2026-03-30

## Languages

**Primary:**
- TypeScript 5.9.3 - All source code (`src/**/*.ts`, `src/**/*.tsx`)

**Secondary:**
- JSON - Static data and configuration (`src/data/lotes.json`, `package.json`, `tsconfig.json`)

## Runtime

**Environment:**
- Node.js (version not pinned; no `.nvmrc` or `.node-version` present)
- Next.js server runtime for API routes (Edge not used; standard Node runtime)

**Package Manager:**
- npm
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- Next.js 16.2.1 - Full-stack React framework (App Router)
- React 19.2.4 - UI rendering
- React DOM 19.2.4 - DOM rendering

**Styling:**
- Tailwind CSS 4.2.2 - Utility-first CSS framework
- PostCSS 8.5.8 + `@tailwindcss/postcss` 4.2.2 - CSS processing pipeline
- Autoprefixer 10.4.27 - Vendor prefix management

**Charting:**
- Recharts 3.8.0 - Data visualization / charts

**Icons:**
- Lucide React 0.577.0 - Icon library

**PDF Generation:**
- PDFKit 0.18.0 - Server-side PDF generation

**Testing:**
- Not configured. No test framework, test files, or test scripts detected.

**Build/Dev:**
- Next.js built-in bundler (Turbopack in dev, Webpack in production)
- TypeScript compiler via `tsconfig.json`

## Key Dependencies

**Critical:**
- `next` 16.2.1 - App framework; all routing, SSR, and API routes depend on it
- `react` / `react-dom` 19.2.4 - UI rendering layer
- `recharts` 3.8.0 - All dashboard charts and data visualizations
- `@vercel/blob` 2.3.1 - Persistent data storage for weekly metrics (replaces a database)

**API Clients:**
- `googleapis` 171.4.0 - Google Analytics Data API access (imported but Google Ads uses raw `fetch`)
- `google-ads-api` 23.0.0 - Listed as dependency but **not imported anywhere**; Google Ads integration uses raw `fetch` against REST API v23 directly

**Infrastructure:**
- `@vercel/blob` 2.3.1 - File-based JSON storage for metrics data (`src/app/api/metrics/route.ts`)
- `pdfkit` 0.18.0 - PDF report generation

**Type Definitions (in dependencies, not devDependencies):**
- `@types/node` 25.5.0
- `@types/react` 19.2.14

## Configuration

**TypeScript:**
- Config: `tsconfig.json`
- Target: ES2017
- Module resolution: bundler
- Strict mode: enabled
- Path alias: `@/*` maps to `./src/*`

**PostCSS:**
- Config: `postcss.config.mjs`
- Uses `@tailwindcss/postcss` plugin only

**Next.js:**
- Config: `next.config.ts`
- Empty configuration (no custom settings)

**Environment:**
- `.env.local` and `.env.prod` files present (contents not read)
- Required env vars (see INTEGRATIONS.md for full list):
  - `DASHBOARD_PASSWORD` - Dashboard login
  - `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `META_APP_ID`, `META_APP_SECRET` - Meta Ads
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` - Google OAuth
  - `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID` - Google Ads
  - `GA_PROPERTY_ID` - Google Analytics
  - `UAU_LOGIN`, `UAU_PASSWORD`, `UAU_INTEGRATION_TOKEN`, `UAU_API_URL` - Senior UAU ERP
  - `VERCEL_TOKEN`, `VERCEL_PROJECT_ID` - Vercel API (for automated Meta token renewal)
  - `BLOB_READ_WRITE_TOKEN` - Vercel Blob storage (implicit via `@vercel/blob`)
  - `CRON_SECRET` - Cron job authentication
  - `NOTIFICATION_EMAIL` - Alert recipient

**Deployment:**
- Config: `vercel.json`
- Platform: Vercel
- Cron job: `GET /api/cron` runs daily at 09:00 UTC

## Platform Requirements

**Development:**
- Node.js (recommended 20+)
- npm
- Environment variables configured in `.env.local`

**Production:**
- Vercel (deployed as serverless functions)
- Vercel Blob storage for persistent data
- Vercel Cron for scheduled token checks
- No database required; data is stored in Vercel Blob (`metrics.json`) and static JSON (`src/data/lotes.json`)

## Scripts

```bash
npm run dev      # Start Next.js dev server
npm run build    # Production build
npm run start    # Start production server
```

No lint, test, or format scripts configured.

## Unused Dependencies

- `google-ads-api` 23.0.0 - Listed in `package.json` but never imported. The Google Ads integration at `src/app/api/google-ads/route.ts` uses raw `fetch` against the REST API instead.

## Type Definitions Misplacement

- `@types/node` and `@types/react` are in `dependencies` instead of `devDependencies`. Not a runtime issue but a packaging convention violation.

---

*Stack analysis: 2026-03-30*
