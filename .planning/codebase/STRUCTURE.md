# Codebase Structure

**Analysis Date:** 2026-03-30

## Directory Layout

```
dashboard-cenario-dos-lagos/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── analytics/route.ts     # Google Analytics proxy
│   │   │   ├── auth/route.ts          # Password authentication
│   │   │   ├── cron/route.ts          # Daily Meta token check
│   │   │   ├── google-ads/route.ts    # Google Ads proxy
│   │   │   ├── meta-ads/route.ts      # Meta Ads proxy
│   │   │   ├── metrics/route.ts       # Core metrics CRUD (Vercel Blob)
│   │   │   ├── sync/                  # (not present -- placeholder)
│   │   │   └── uau/
│   │   │       ├── route.ts           # ERP inventory/estoque
│   │   │       ├── vendas/route.ts    # ERP sales history
│   │   │       └── financeiro/route.ts # ERP financial data
│   │   ├── globals.css                # Global styles + CSS variables + dark mode
│   │   ├── layout.tsx                 # Root layout (metadata + theme script)
│   │   └── page.tsx                   # Main SPA page (all state + tab routing)
│   ├── components/
│   │   ├── DateRangeFilter.tsx        # Reusable date range picker with quick selects
│   │   ├── FormSemanal.tsx            # Weekly data entry form
│   │   ├── KPICard.tsx                # Reusable KPI metric card
│   │   ├── LoginScreen.tsx            # Password login screen
│   │   ├── TabAnalytics.tsx           # Google Analytics tab (self-fetching)
│   │   ├── TabCanais.tsx              # Marketing channels breakdown tab
│   │   ├── TabEstoque.tsx             # Inventory/lot status tab
│   │   ├── TabFinanceiro.tsx          # Financial overview tab
│   │   ├── TabIntegracoes.tsx         # Ad platform integrations tab (self-fetching)
│   │   ├── TabQualidade.tsx           # Lead quality metrics tab
│   │   └── TabVisaoGeral.tsx          # Overview/summary tab
│   ├── data/
│   │   └── lotes.json                 # Static lot master data (394 lots with prices/areas)
│   └── lib/
│       ├── types.ts                   # TypeScript interfaces + KPI calc functions + formatters
│       └── uau-auth.ts               # Senior UAU ERP auth helpers
├── data/
│   └── metrics.json                   # Local backup/seed of metrics data
├── public/
│   ├── logo-cenario.png               # Light mode logo
│   ├── logo-cenario-negativa.png      # Dark mode logo
│   ├── logo-mangaba.png               # Company logo (light)
│   └── logo-mangaba-negativa.png      # Company logo (dark)
├── package.json                       # Dependencies and scripts
├── next.config.ts                     # Next.js config (empty/default)
├── tsconfig.json                      # TypeScript config
├── postcss.config.mjs                 # PostCSS with Tailwind CSS v4
├── vercel.json                        # Vercel cron job config (daily at 09:00)
├── seed-data.mjs                      # Script to seed initial metrics data
├── seed-bulk.mjs                      # Script to bulk seed data
└── generate-design-doc.mjs            # Script to generate design doc PDF
```

## Directory Purposes

**`src/app/`:**
- Purpose: Next.js App Router directory containing the single page and all API routes
- Contains: `page.tsx` (the entire frontend), `layout.tsx` (root HTML shell), `globals.css`, and `api/` subdirectory
- Key files: `page.tsx` is the most critical file -- it orchestrates all state and rendering

**`src/app/api/`:**
- Purpose: Backend-for-Frontend API layer -- all server-side logic lives here
- Contains: Route Handlers organized by integration domain
- Naming: Each subdirectory maps to a URL path (`api/uau/financeiro` -> `/api/uau/financeiro`)

**`src/components/`:**
- Purpose: All React UI components, flat structure (no nesting)
- Contains: Tab content components, shared UI primitives, login screen, data entry form
- Naming: `Tab*.tsx` for tab content, `PascalCase.tsx` for everything

**`src/lib/`:**
- Purpose: Shared utilities, types, and service helpers
- Contains: TypeScript type definitions, KPI calculation logic, formatting functions, ERP auth module
- Key files: `types.ts` is imported by nearly every file; `uau-auth.ts` is used by all `api/uau/` routes

**`src/data/`:**
- Purpose: Static JSON data files bundled with the app
- Contains: `lotes.json` -- master inventory data for the real estate development (lot IDs, areas, prices, classifications)
- This data is imported directly by API routes at build time

**`data/` (root):**
- Purpose: Local data files (backups, seeds)
- Contains: `metrics.json` -- a local copy of the metrics blob
- Not used at runtime in production; used by seed scripts

**`public/`:**
- Purpose: Static assets served directly by Next.js
- Contains: Brand logos in light and dark mode variants

## Key File Locations

**Entry Points:**
- `src/app/page.tsx`: The entire dashboard frontend -- auth gate, tab navigation, data fetching, layout
- `src/app/layout.tsx`: Root HTML layout with metadata and theme initialization script

**Configuration:**
- `package.json`: Dependencies (Next.js 16, React 19, Recharts, google-ads-api, googleapis)
- `tsconfig.json`: TypeScript config with `@/` path alias for `src/`
- `vercel.json`: Cron schedule for `/api/cron` (daily 09:00 UTC)
- `postcss.config.mjs`: PostCSS + Tailwind CSS v4

**Core Logic:**
- `src/lib/types.ts`: All TypeScript interfaces (`MetricsData`, `CanalData`, `SemanaData`, `FinanceiroResponse`, etc.), KPI calculation functions (`calcKPIs`, `calcKPIsPorCanal`), currency/percent/number formatters
- `src/lib/uau-auth.ts`: UAU ERP authentication (`authenticate()`), generic fetch wrapper (`uauFetch()`), configuration check (`isUauConfigured()`)
- `src/app/api/metrics/route.ts`: Core CRUD for marketing metrics stored in Vercel Blob
- `src/app/api/uau/financeiro/route.ts`: Most complex API route -- batch fetches, financial projections, inadimplencia calculation, in-memory caching

**Testing:**
- No test files exist in the project

## Naming Conventions

**Files:**
- Components: `PascalCase.tsx` (e.g., `TabVisaoGeral.tsx`, `KPICard.tsx`, `LoginScreen.tsx`)
- API routes: `route.ts` inside descriptive directories (Next.js convention)
- Library files: `kebab-case.ts` (e.g., `uau-auth.ts`)
- Data files: `kebab-case.json` (e.g., `lotes.json`)
- Scripts: `kebab-case.mjs` (e.g., `seed-data.mjs`)

**Directories:**
- API routes: `kebab-case` (e.g., `google-ads/`, `meta-ads/`)
- Source directories: `lowercase` (e.g., `components/`, `lib/`, `data/`)

## Where to Add New Code

**New Dashboard Tab:**
1. Create component: `src/components/Tab{Name}.tsx` -- follow `TabVisaoGeral.tsx` pattern (accept `data: MetricsData` as prop, or self-fetch like `TabAnalytics.tsx`)
2. Add tab entry in `src/app/page.tsx` in the `tabs` array (line 18-27)
3. Add tab type to the `Tab` union type in `src/app/page.tsx` (line 16)
4. Add rendering conditional in the `<main>` section of `src/app/page.tsx` (around line 214)
5. If the tab needs lazy-loaded data, add state variables and a `useEffect` in `page.tsx` (follow `estoqueData` pattern)

**New API Route:**
1. Create directory: `src/app/api/{route-name}/`
2. Create `route.ts` with exported HTTP method handlers (`GET`, `POST`, etc.)
3. Use `NextResponse.json()` for responses
4. For UAU ERP endpoints, import from `src/lib/uau-auth.ts` and follow the pattern in `src/app/api/uau/route.ts`
5. For endpoints requiring auth, use the `isAuthorized()` pattern from `src/app/api/metrics/route.ts`

**New Shared Type or Utility:**
- Add to `src/lib/types.ts` for types, interfaces, calculation functions, and formatters
- Create a new file in `src/lib/` only for a distinct domain (e.g., `src/lib/google-auth.ts`)

**New Reusable UI Component:**
- Add to `src/components/` as `PascalCase.tsx`
- Mark as `"use client"` at top of file
- Follow `KPICard.tsx` for simple display components or `DateRangeFilter.tsx` for interactive components

**New Static Data:**
- Add JSON files to `src/data/`
- Import directly in API routes: `import data from "@/data/filename.json"`

## Special Directories

**`.planning/`:**
- Purpose: Project planning and analysis documents
- Generated: By tooling
- Committed: Yes

**`.vercel/`:**
- Purpose: Vercel CLI project metadata
- Generated: Yes (by Vercel CLI)
- Committed: No (should be in .gitignore)

**`data/` (root level):**
- Purpose: Local data backups and seed files
- Generated: Partially (backup file is manual)
- Committed: Yes
- Note: `metrics.json` here is a local backup, not the production data source (production uses Vercel Blob)

---

*Structure analysis: 2026-03-30*
