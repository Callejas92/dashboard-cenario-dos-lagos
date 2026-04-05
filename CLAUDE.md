# Dashboard Cenário dos Lagos — Contexto para Claude

## O que é este projeto

Dashboard de marketing em tempo real para o empreendimento **Cenário dos Lagos** da **Mangaba Urbanismo**.
- Produção: https://dashboard-cenario-dos-lagos.vercel.app (senha: callejas)
- Repo local: `C:\Users\felip\dashboard-cenario-dos-lagos`
- GitHub: https://github.com/Callejas92/dashboard-cenario-dos-lagos
- Deploy: `npx vercel --prod` (auto-deploy do GitHub NÃO está ativo)

## Stack

Next.js 16 (App Router) + TypeScript + Tailwind CSS + Recharts + Vercel + Vercel Blob

## Arquivos principais

```
src/
  app/
    page.tsx                    # Shell principal: auth, tabs, navegação
    api/
      canais/route.ts           # Agregador: Meta Ads + CRM + UAU (cache 5min)
      meta-ads/route.ts         # Campanhas Meta + daily (time_increment=1)
      whatsapp/route.ts         # Métricas + custo estimado + blob
      whatsapp/webhook/route.ts # GET verify + POST eventos Meta
      instagram/route.ts        # Perfil e posts
      crm/route.ts              # Leads CRM Eggs
      uau/vendas/route.ts       # Vendas ERP UAU
      uau/financeiro/route.ts   # Financeiro ERP UAU
      analytics/route.ts        # Google Analytics 4
  components/
    TabVisaoGeral.tsx           # KPIs globais + funil + Por Canal/Por Dia
    TabMetaAds.tsx              # Campanhas + KPIs expandíveis + daily
    TabWhatsApp.tsx             # Mensagens + custo + webhook + daily
    TabInstagram.tsx            # Perfil + posts + KPIs expandíveis
    TabCRM.tsx                  # Leads + status + corretor + daily
    TabCanais.tsx               # Breakdown por canal
    TabEstoque.tsx              # Estoque UAU
    TabFinanceiro.tsx           # Financeiro UAU
    TabQualidade.tsx            # Metas e qualidade
    KPICard.tsx                 # Componente de card KPI reutilizável
    DateRangeFilter.tsx         # Filtro de data com botões rápidos
```

## Integrações

### Meta Ads ✅
- System User token (nunca expira) — `META_ACCESS_TOKEN`
- Account ID em `META_AD_ACCOUNT_ID`
- Endpoint usa `time_increment=1` para dados diários

### WhatsApp Business ✅
- System User token — `WHATSAPP_TOKEN`
- `WHATSAPP_PHONE_ID=946828588523627`, `WHATSAPP_WABA_ID=1492656522562843`
- Webhook publicado na Meta (App publicado, recebe dados de produção)
  - Assina: `messages` + `phone_number_quality_update`
  - `WHATSAPP_WEBHOOK_VERIFY_TOKEN` na Vercel
- Custo estimado: $0.0625/conversa marketing (Brasil) × câmbio live (open.er-api.com)
- Dados acumulam em Vercel Blob `whatsapp-events.json`
- conversation_analytics API retorna vazio (limitação da Meta)

### Instagram ✅
- `INSTAGRAM_ACCOUNT_ID=17841470059281377` (@mangabaurbanismo)

### CRM Eggs ✅
- `CRM_API_KEY=17a7b2e27adb53f0fef5de6c10f10483`
- API HTTP: `http://leadsc2s.eggs.com.br/api/webhook/leads`

### ERP Senior UAU ✅
- `UAU_BASE_URL`, `UAU_EMPRESA=133`, `UAU_CHAVE=Q2VuYXJpb0RMYWdvcw==`
- Filtros de data ignorados pelo ERP (retorna tudo)

### Google Ads ⚠️
- Developer token: `eoQyarcgourbh57gQtbg9Q`
- Manager ID: 649-114-5054, Customer ID: 171-613-6766
- Aguardando billing do cliente

### Google Analytics 4 ✅
- `GA4_PROPERTY_ID=529425797`

## Padrões de código importantes

### KPIs expandíveis (padrão em todas as abas)
Todos os KPI cards são clicáveis e expandem um painel com:
- Toggle **Por Canal / Por Dia** (onde disponível)
- Toggle **Tabela / Gráfico**
- Tabela com scroll (max 320px) e linha de TOTAL
- Botão X para fechar

**REGRA CRÍTICA:** Todos os `useState` DEVEM estar no topo do componente, ANTES de qualquer `if (loading)` / `if (error)` / `if (!data)`. Violação desta regra causa crash silencioso na produção (React Rules of Hooks).

### Cache de API
APIs server-side usam cache em memória de 5 minutos:
```ts
let cachedData: { data: unknown; timestamp: number; key: string } | null = null;
const CACHE_TTL = 5 * 60 * 1000;
```

### Vercel Blob
- `metrics.json` — configurações (metas, VGV, canais)
- `whatsapp-events.json` — `{ daily: Record<string, DayStats>, qualityHistory, pricing, updatedAt }`

### Cores dos canais
```ts
const CANAL_COLORS = {
  "Meta Ads": "#1877f2",
  "Google Ads": "#ea4335",
  "Site": "#10b981",
  "Outdoor": "#f4a236",
  "Rádio": "#8b5cf6",
  "Jornal": "#e94560",
  "Indicação": "#0ea5e9",
  "Contato Corretor": "#f59e0b",
  "Outros": "#6b7280",
}
```

## Pendências conhecidas

- Google Ads: cliente precisa ativar billing
- GA4: criar key events `click_whatsapp` e `form_submit_lead`
- Custos offline (Outdoor, Rádio, Jornal): integrar Google Sheets ou OneDrive
- Performance por Corretor: requer enriquecimento CRM + UAU
- WhatsApp: webhook só acumula dados a partir da ativação (histórico inserido manualmente no blob)
