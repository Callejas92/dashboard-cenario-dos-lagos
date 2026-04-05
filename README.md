# Dashboard Marketing — Cenário dos Lagos

Painel de marketing em tempo real para o empreendimento **Cenário dos Lagos** da **Mangaba Urbanismo**.

🔗 **Produção:** https://dashboard-cenario-dos-lagos.vercel.app

---

## Funcionalidades

- **Visão Geral** — KPIs consolidados (investimento, leads, vendas, receita) com funil de vendas e breakdown por canal ou por dia
- **Meta Ads** — campanhas, alcance, impressões, cliques, leads, CPL, CPC e visão diária
- **WhatsApp Business** — mensagens enviadas/entregues/lidas/recebidas via webhook, custo estimado em R$ com câmbio live, qualidade do número e templates
- **Instagram** — perfil, posts, curtidas, comentários e taxa de engajamento
- **CRM** — leads por status, fonte, corretor e evolução diária
- **Estoque** — unidades disponíveis/vendidas via ERP UAU
- **Financeiro** — receitas e inadimplência via ERP UAU
- **Qualidade** — metas e indicadores de qualidade dos canais

Todas as abas possuem **KPIs clicáveis** que expandem com visão detalhada (por canal ou por dia) em tabela ou gráfico.

---

## Stack

- **Next.js 16** (App Router, Turbopack)
- **TypeScript**
- **Tailwind CSS**
- **Recharts** — gráficos
- **Vercel** — hosting serverless
- **Vercel Blob** — armazenamento de configurações e dados de webhook

---

## Variáveis de Ambiente

Configure no painel da Vercel (Settings → Environment Variables):

```env
# Auth
DASHBOARD_PASSWORD=

# Meta (Ads + WhatsApp + Instagram)
META_ACCESS_TOKEN=
META_AD_ACCOUNT_ID=
INSTAGRAM_ACCOUNT_ID=

# WhatsApp Business
WHATSAPP_TOKEN=
WHATSAPP_PHONE_ID=
WHATSAPP_WABA_ID=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=

# CRM Eggs
CRM_API_KEY=

# ERP Senior UAU
UAU_BASE_URL=
UAU_EMPRESA=
UAU_CHAVE=

# Google Ads
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_ADS_MANAGER_ID=
GOOGLE_ADS_CUSTOMER_ID=
GOOGLE_ADS_ACCESS_TOKEN=

# Google Analytics
GA4_PROPERTY_ID=
GA4_ACCESS_TOKEN=

# Vercel Blob
BLOB_READ_WRITE_TOKEN=
```

---

## Rodando Localmente

```bash
# Instalar dependências
npm install

# Criar .env.local com as variáveis acima
cp .env.example .env.local

# Iniciar servidor de desenvolvimento
npx next dev --turbo
```

Acesse em: http://localhost:3000

---

## Deploy

O projeto faz deploy via Vercel CLI:

```bash
npx vercel --prod
```

> O auto-deploy via GitHub push não está ativo — use o comando acima após cada conjunto de mudanças.

---

## Arquitetura das APIs

| Rota | Descrição | Cache |
|---|---|---|
| `/api/canais` | Agregador: Meta Ads + CRM + UAU | 5 min |
| `/api/meta-ads` | Campanhas, totais e breakdown diário | 5 min |
| `/api/whatsapp` | Métricas + custo estimado + webhook blob | 5 min |
| `/api/whatsapp/webhook` | Recebe eventos da Meta (GET verify + POST) | — |
| `/api/instagram` | Perfil e posts | — |
| `/api/crm` | Leads do CRM Eggs | — |
| `/api/uau/vendas` | Vendas do ERP UAU | — |
| `/api/uau/financeiro` | Financeiro do ERP UAU | — |
| `/api/analytics` | Google Analytics 4 | — |

### Vercel Blob

- **`metrics.json`** — configurações do dashboard (metas, canais, VGV)
- **`whatsapp-events.json`** — contadores diários do webhook + histórico de qualidade

---

## Integrações - Status

| Integração | Status | Obs |
|---|---|---|
| Meta Ads | ✅ Ativo | System User token sem expiração |
| WhatsApp Business | ✅ Ativo | Webhook publicado na Meta |
| Instagram | ✅ Ativo | @mangabaurbanismo |
| CRM Eggs | ✅ Ativo | API HTTP básica |
| ERP Senior UAU | ✅ Ativo | Autenticação via chave |
| Google Analytics 4 | ✅ Ativo | Property 529425797 |
| Google Ads | ⚠️ Pendente | Aguardando billing do cliente |

---

## Pendências

- [ ] Google Ads: ativar billing na conta do cliente
- [ ] GA4: criar key events `click_whatsapp` e `form_submit_lead`
- [ ] Custos offline (Outdoor, Rádio, Jornal): integrar via Google Sheets ou OneDrive
- [ ] Performance por Corretor: enriquecimento CRM + UAU
