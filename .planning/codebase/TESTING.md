# Testing Patterns

**Analysis Date:** 2026-03-30

## Test Framework

**Runner:**
- No test framework is installed or configured
- No test runner (Jest, Vitest, Playwright, Cypress) in `package.json` dependencies or devDependencies
- No test configuration files exist in the project root

**Run Commands:**
```bash
# No test commands available
# package.json scripts: dev, build, start (no "test" script)
```

## Test File Organization

**Location:**
- No test files exist anywhere in the codebase
- No `*.test.ts`, `*.test.tsx`, `*.spec.ts`, or `*.spec.tsx` files found
- No `__tests__/` directories
- No `tests/` or `test/` directory at project root

## Current Test Coverage

**Coverage: 0%**

No tests exist for any part of the application:

- **0 unit tests** for business logic (`src/lib/types.ts`: `calcKPIs`, `calcKPIsPorCanal`, `formatBRL`, `formatPercent`, `formatNumber`)
- **0 component tests** for any of the 10 React components in `src/components/`
- **0 API route tests** for any of the 8 API endpoints in `src/app/api/`
- **0 integration tests** for external API integrations (Google Ads, Meta Ads, UAU ERP, Google Analytics)
- **0 E2E tests** for user flows (login, data entry, tab navigation)

## Recommended Test Setup

**If adding tests, use Vitest** (aligns with Next.js/Vite ecosystem):

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

**Suggested `vitest.config.ts`:**
```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

**Suggested test script in `package.json`:**
```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage"
  }
}
```

## Priority Test Targets

### Priority 1: Pure Business Logic (highest value, easiest to test)

**`src/lib/types.ts` -- KPI calculation functions:**
- `calcKPIs()` -- Aggregates weekly data into CPL, CAC, ROI, VSO, TLQ, TCS, SLA metrics
- `calcKPIsPorCanal()` -- Per-channel KPI aggregation
- `formatBRL()` -- Currency formatting
- `formatPercent()` -- Percentage formatting
- `formatNumber()` -- Number formatting with pt-BR locale
- `emptyCanalData()` -- Factory function for default channel data

These are pure functions with no dependencies. Example test:

```typescript
// tests/lib/types.test.ts
import { calcKPIs, formatBRL, emptyCanalData } from '@/lib/types';

describe('calcKPIs', () => {
  it('calculates CPL correctly', () => {
    const semanas = [{
      semana: 1,
      inicio: '2026-03-01',
      fim: '2026-03-07',
      canais: {
        'Google Ads': { ...emptyCanalData(), investimento: 1000, leads: 20 },
      },
    }];
    const metas = { cpl: 50, cac: 11250, roi: 3.5, vso: 5, tlq: 30, tcs: 35, slaResposta: 5 };
    const vgv = { totalUnidades: 100, ticketMedio: 200000, vgvTotal: 20000000 };
    const result = calcKPIs(semanas, metas, vgv);
    expect(result.cpl).toBe(50); // 1000 / 20
  });

  it('handles zero leads gracefully', () => {
    const result = calcKPIs([], metas, vgv);
    expect(result.cpl).toBe(0);
  });
});
```

### Priority 2: API Route Handlers

**`src/app/api/auth/route.ts`:**
- Password validation logic (simple, critical for security)

**`src/app/api/metrics/route.ts`:**
- Read/write to Vercel Blob storage
- Authorization check via Bearer token
- Week data insertion and sorting logic

**`src/app/api/uau/route.ts`:**
- `buildEnrichedResponse()` function -- merges static lotes data with UAU API data
- Status classification logic (vendido/disponivel/em venda)
- Quadra and classificacao aggregation

### Priority 3: Component Rendering

**`src/components/KPICard.tsx`:**
- Small, reusable, easy to snapshot test
- Status color logic (good/bad/neutral)

**`src/components/DateRangeFilter.tsx`:**
- Quick select button behavior
- Date formatting

### Priority 4: Integration / E2E

**Login flow:**
- Password entry -> API call -> authenticated state -> dashboard render

**Data entry flow (FormSemanal):**
- Fill weekly data -> submit -> data persisted -> refreshed in dashboard

## What to Mock

**External services (always mock in unit/integration tests):**
- `fetch` calls to `/api/*` endpoints in component tests
- `@vercel/blob` (`put`, `list`) in API route tests
- Google Ads API, Meta Ads API, Google Analytics API, UAU ERP API

**What NOT to mock:**
- Pure calculation functions in `src/lib/types.ts`
- React state and rendering behavior (use Testing Library)

## Test Gaps and Risk

**Critical untested areas:**

| Area | Files | Risk | Priority |
|------|-------|------|----------|
| KPI calculations | `src/lib/types.ts` | Incorrect dashboard numbers | High |
| Auth bypass | `src/app/api/auth/route.ts`, `src/app/api/metrics/route.ts` | Unauthorized data access | High |
| UAU data merging | `src/app/api/uau/route.ts` | Wrong stock status display | High |
| Financial calculations | `src/app/api/uau/financeiro/route.ts` | Wrong inadimplencia numbers | High |
| Date filtering logic | `src/components/TabVisaoGeral.tsx`, `TabCanais.tsx` | Incorrect filtered data | Medium |
| Form data submission | `src/components/FormSemanal.tsx` | Data loss or corruption | Medium |
| Theme toggle | `src/app/page.tsx` | Visual glitch only | Low |

**No CI/CD test pipeline:**
- No GitHub Actions, no Vercel checks beyond build
- `vercel.json` only defines cron schedule, no test hooks
- Build (`next build`) is the only validation gate

---

*Testing analysis: 2026-03-30*
