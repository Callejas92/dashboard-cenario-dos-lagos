# Coding Conventions

**Analysis Date:** 2026-03-30

## Naming Patterns

**Files:**
- Components: PascalCase (e.g., `TabVisaoGeral.tsx`, `KPICard.tsx`, `DateRangeFilter.tsx`)
- API routes: lowercase `route.ts` inside descriptive directories (e.g., `api/google-ads/route.ts`, `api/uau/financeiro/route.ts`)
- Lib modules: kebab-case (e.g., `uau-auth.ts`) or lowercase (e.g., `types.ts`)

**Functions:**
- Use camelCase for all functions: `calcKPIs`, `formatBRL`, `loadData`, `handleSubmit`
- React components use PascalCase: `KPICard`, `TabVisaoGeral`, `LoginScreen`
- Helper functions defined inline within components: `formatWeekName()`, `funnelRate()`, `toggleDetail()`
- Export `default function ComponentName` for all React components (no arrow function exports)

**Variables:**
- camelCase for all variables: `activeTab`, `estoqueData`, `totalInvestimento`
- State variables follow `[noun, setNoun]` pattern: `[data, setData]`, `[loading, setLoading]`
- Loading/error/fetched triplet pattern for async data: `[estoqueLoading, estoqueError, estoqueFetched]`
- Constants in UPPER_SNAKE_CASE: `BLOB_NAME`, `GOOGLE_ADS_API`, `STATUS_COLORS`, `COLORS`

**Types:**
- PascalCase for interfaces and type aliases: `MetricsData`, `CanalData`, `SemanaData`, `FinanceiroResponse`
- Interface used over type for object shapes
- Inline interfaces with `interface Props` for component props (generic name `Props` is common)
- Type aliases for union types: `type Tab = "geral" | "canais" | ...`

## Code Style

**Formatting:**
- No ESLint or Prettier configuration files present
- Indentation: 2 spaces
- Semicolons: used consistently
- Quotes: double quotes for strings
- Trailing commas: used in multi-line arrays/objects

**Linting:**
- No dedicated linter configured (no `.eslintrc`, `.prettierrc`, or `biome.json`)
- TypeScript strict mode enabled in `tsconfig.json`

## Import Organization

**Order:**
1. React/Next.js framework imports (`"use client"` directive first, then `react`, `next`)
2. Third-party libraries (`recharts`, `lucide-react`, `@vercel/blob`)
3. Internal components via path alias (`@/components/...`)
4. Internal lib/types via path alias (`@/lib/types`, `@/lib/uau-auth`)
5. Internal data imports (`@/data/lotes.json`)

**Path Aliases:**
- `@/*` maps to `./src/*` (configured in `tsconfig.json`)
- Always use `@/` prefix for internal imports, never relative paths between directories

**Example pattern:**
```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis } from "recharts";
import { DollarSign, Users } from "lucide-react";
import KPICard from "@/components/KPICard";
import { MetricsData, calcKPIs, formatBRL } from "@/lib/types";
```

## Component Patterns

**"use client" directive:**
- All components in `src/components/` use `"use client"` directive
- The main page `src/app/page.tsx` uses `"use client"`
- Only `src/app/layout.tsx` is a server component
- API routes in `src/app/api/` are server-side (no directive needed)

**Component structure:**
1. `"use client"` directive
2. Imports
3. Local interfaces/types
4. Helper functions (outside or inside component)
5. `export default function ComponentName(props)` -- always named default export
6. State declarations
7. Derived data via `useMemo`
8. Side effects via `useEffect`
9. Event handlers
10. Early returns (loading, error, empty states)
11. Main JSX return

**Props pattern:**
- Components accept props via interface, typically named `Props`:
  ```typescript
  interface Props {
    data: MetricsData;
  }
  export default function TabVisaoGeral({ data }: Props) { ... }
  ```
- Some components use more specific names: `KPICardProps`, `LoginScreenProps`, `DateRangeFilterProps`

**State management:**
- No external state library -- all state in React `useState`
- State lives in `src/app/page.tsx` (the main orchestrator) and is passed down as props
- Lazy-loaded data pattern: fetch on tab activation with `[dataFetched, dataLoading, dataError]` triplet
- `useCallback` for stable function references passed to child components
- `useMemo` for derived/computed data from weekly metrics

**No context providers or custom hooks** are used anywhere in the codebase.

## Styling Approach

**CSS Strategy: Hybrid Tailwind + CSS Variables + Inline Styles**

- Tailwind CSS v4 via `@tailwindcss/postcss` for layout utilities: `flex`, `grid`, `gap-4`, `rounded-xl`, `text-sm`
- CSS custom properties in `src/app/globals.css` for theming (light/dark mode via `.dark` class)
- Inline `style={{ }}` objects for dynamic colors and theme-aware values referencing CSS variables
- Custom CSS classes in `globals.css`: `.kpi-card`, `.tab-active`, `.tab-inactive`, `.status-good`

**Theme system:**
- Light mode is default; dark mode via `.dark` class on `<html>`
- Theme toggle writes to `localStorage` and applies class manually
- Blocking script in `layout.tsx` reads localStorage before paint to prevent flash
- All dynamic colors reference CSS variables: `var(--text)`, `var(--border)`, `var(--card-bg)`, etc.

**Color constants (hardcoded in components):**
- Brand green: `#1a5c3a`
- Success green: `#10b981`
- Error red: `#e94560`
- Blue: `#4285f4`
- Orange/warning: `#f4a236`
- Purple: `#8b5cf6`
- Chart palette: `COLORS` array in `TabCanais.tsx`

**Card pattern:**
- Use `.kpi-card` class for card containers (defined in `globals.css`)
- Cards have 1rem border-radius, 1.25rem padding, subtle border and shadow

**Chart styling:**
- Shared `tooltipStyle` object defined per component for Recharts tooltip styling
- Axis tick style: `{ fill: "var(--text-dim)", fontSize: 11 }`
- Consistent across all chart components

## Error Handling

**Client-side:**
- `try/catch` around `fetch` calls with `console.error` logging
- Error state stored in component state (`useState<string | null>`)
- User-facing error messages in Portuguese
- Retry buttons that reset the `fetched` flag to re-trigger data loading

**Server-side (API routes):**
- `try/catch` at the handler level, returning `NextResponse.json({ error: ... }, { status: 500 })`
- Graceful degradation: UAU API failures fall back to static data with `uauStatus: "offline"`
- Auth check via `isAuthorized()` helper returning 401 on failure
- External API errors include status code and response text in error messages

## Logging

**Framework:** `console.error` only

**Patterns:**
- Client: `console.error("Erro ao carregar dados:", err)` -- Portuguese error descriptions
- Server: `console.error("UAU API error:", errMsg)` -- English identifiers with error details
- No structured logging, no log levels beyond error

## Comments

**When to Comment:**
- Section separators using `// ---------- Section Name ----------` pattern in large components
- JSX section markers: `{/* Header */}`, `{/* Tabs */}`, `{/* Content */}`
- Brief inline comments for non-obvious logic: `// Build a lookup map from static data`

**JSDoc/TSDoc:**
- Not used anywhere in the codebase

## Function Design

**Size:** Large components (400-775 lines) contain all logic inline. No extraction into custom hooks.

**Parameters:** Destructured props for components. Simple positional parameters for helpers.

**Return Values:**
- API routes return `NextResponse.json(...)` consistently
- Helper functions return computed values (no side effects)
- Components return JSX

## Module Design

**Exports:**
- One default export per file (component or API handler)
- Named exports only in `src/lib/types.ts` (interfaces, functions, utilities)
- Named exports in `src/lib/uau-auth.ts` (auth helpers)

**Barrel Files:** Not used. All imports reference specific files directly.

## API Route Patterns

**Structure:** Each API route exports HTTP method handlers (`GET`, `POST`, `PUT`).

**Auth pattern:**
```typescript
function isAuthorized(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${process.env.DASHBOARD_PASSWORD}`;
}
```

**Response pattern:**
```typescript
return NextResponse.json({ configured: true, data: result, fetchedAt: new Date().toISOString() });
return NextResponse.json({ configured: false, message: "Not configured" });
return NextResponse.json({ error: "Description" }, { status: 500 });
```

**External API integration pattern:**
1. Check if env vars are configured; if not, return `{ configured: false }`
2. Authenticate with external service
3. Fetch data with timeout/abort controller
4. Transform and return
5. On error, return graceful fallback or error response

## Internationalization

**Language:** All user-facing text is in Brazilian Portuguese.
- UI labels, error messages, button text: Portuguese
- Code identifiers, variable names, comments: Mix of Portuguese and English
- Date formatting: `pt-BR` locale consistently

---

*Convention analysis: 2026-03-30*
