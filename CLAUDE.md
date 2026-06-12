# Dashboard Cenário dos Lagos — Contexto para Claude

## O que é

Dashboard interno (usuário único: Felipe, founder da Mangaba Urbanismo) do loteamento
**Cenário dos Lagos** — 174 lotes vendáveis, VGV R$ 85,91M. É **monitor de decisão,
não sistema de gestão**.

- Produção: https://dashboard.mangabaurbanismo.com.br (login por senha; escritas exigem Bearer = senha)
- Repo local: `C:\dev\dashboard-cenario-dos-lagos` · GitHub: Callejas92/dashboard-cenario-dos-lagos
- Deploy: `npx vercel --prod` (auto-deploy do GitHub NÃO está ativo)
- Workflow: `tsc --noEmit` → `npm run build` → commit → push → `vercel --prod` → **verificar em produção**
- **Regra de ouro do Felipe: nada de info errada no dashboard.** Verificar todo número contra a fonte.

## Documentos-chave

- `ANALISE_DASHBOARD.md` — auditoria completa + plano de fases (status atualizado)
- `BRIEFING_REDESIGN_DASHBOARD.md` — premissa original do V2 (princípios de design, regras de negócio)

## Stack & estrutura (V2 — a V1/legacy foi removida em 10/06/2026)

Next.js 16 (App Router) + TypeScript + Recharts + SWR + Vercel + Edge Config (durável) + Vercel Blob (cache).

```
src/app/panorama      # visão executiva (KPIs, velocidade, curvas, alertas, insights)
src/app/pipeline      # Contratos · Corretores (LTV) · Estoque · Financeiro & Bônus
src/app/marketing     # Painel (planilha OneDrive) · Digital · Orgânico · CRM Leads
src/app/admin         # status das integrações (⚙️ no header)
src/app/api/*         # 28 rotas (CRM Eggs, UAU ERP, bônus, PIX, eventos, mídia...)
src/lib/constants/negocio.ts   # REGRAS DE NEGÓCIO (fonte única): comissões 6,5%,
                               # FATOR_MANGABA 0,935, bônus 3k/1k, autorização 1,5%
src/lib/constants/projeto.ts   # premissas (VGV, metas, mês comercial 15→14)
src/lib/bonus.ts               # tracking de bônus (read-your-writes; blob compartilhado)
src/lib/excel-bonus-sync.ts    # sync status→Excel Comercial (acha colunas pelo header)
src/lib/investor-lots.ts       # lotes do investidor: blob override + seed (editável sem deploy)
src/lib/onedrive-token.ts      # token OAuth cifrado (AES-256-GCM) no Edge Config (fallback blob)
src/lib/edge-store.ts          # Edge Config: estado durável pequeno fora do Blob (ver seção Storage)
src/lib/server-auth.ts         # Bearer obrigatório em POST/DELETE de escrita
```

## Regras de negócio críticas

- **Venda** = contrato ASSINADO+ no Eggs. **Mês comercial = dia 15→14.** Lançamento 14/04/2026.
- **Bônus**: R$ 3k corretor + R$ 1k imob externa por venda; **autorizado quando o cliente
  pagou ≥ 1,5% do contrato** (recebido no ERP). **O "pago" é anotado NO EXCEL pelo Felipe**
  (célula Status Corretor / Status Imob) — o dashboard escreve só "aguardando pgt" /
  "autorizado pgt", LÊ o "pago" e importa sozinho no sync (e desmarca se o pago for
  apagado — só os vindos do Excel). Dashboard = acompanhamento; Excel = registro do pago.
- **Lotes do investidor (39)** ficam fora de tudo — lista editável via `/api/investor-lots`.
- Excel Comercial (OneDrive): o dashboard escreve SÓ as colunas de status de bônus
  (hoje U=corretor, V=imob — detectadas pelo cabeçalho).

## Storage: Edge Config (durável pequeno) + Vercel Blob (cache)

Incidente 11/06/2026: o Blob estourou o limite de **operações/transferência** (NÃO espaço —
eram 134KB) e a Vercel **bloqueou o store** ("Your store is blocked", 403 em toda leitura).
Causa: cache-busters `?_=${Date.now()}` furavam o CDN → cada leitura virava operação cobrada.

- **Edge Config** (`cenario-dados` / `ecfg_s4wortserxkvw6qd2hgxvoo9hw2q`) via `src/lib/edge-store.ts`:
  estado durável PEQUENO que não pode sumir — `onedrive_token`, `eventos`, `investor_lots`,
  `pix`, `bonus_payments`, `excel_sync_state`. Leitura grátis/ilimitada na borda (**imune ao
  bloqueio do Blob**). Escrita = REST API (precisa `VERCEL_API_TOKEN` + `EDGE_CONFIG_ID` +
  `VERCEL_TEAM_ID`). **Teto ~8KB/item** — `bonus_payments` cabe hoje (~3KB), vigiar perto de ~120 vendas.
- **Vercel Blob** (`dashboard-metrics`): só CACHE recomputável (tracking, canais, crm, uau-vendas)
  + `inadimplencia-historico` + `bonus-notificados`. Bloqueável; tolerar (recomputa).
- **Padrão**: ler Edge-primeiro com fallback Blob; escrever Edge-through com fallback Blob.

## Pegadinhas que já causaram bug (não repetir)

- **NUNCA usar `?_=${Date.now()}` em fetch de Blob** — fura o CDN, cada leitura vira operação
  cobrada e estoura o limite (foi a causa do bloqueio de 11/06). Read-your-writes (POST devolve
  o estado novo) + overlay em memória já cobrem a propagação ~60s da sobrescrita.
- **Vercel Blob**: sobrescrita propaga em ~60s. NUNCA confie em ler-depois-de-escrever.
- **UAU ERP**: lento (~40s frio) e instável; `completo=false` = dado parcial — nunca
  persistir parcial como verdade (badge/Excel só agem com completo).
- **Leitura de storage falha ≠ vazio**: distinga "ilegível" (→ `null`, dado incompleto) de
  "{}" (ninguém). Zerar a tela por falha de leitura = info errada (regra de ouro).
- `useState` sempre ANTES de qualquer `if (loading)` — Rules of Hooks (crash silencioso).
- Recharts: `<YAxis hide>` quebra escala de barras; screenshot no frame 0 mostra barras zeradas.
- PowerShell 5.1: sem `&&`; usar `if ($?) {}`; `""` dentro de string dupla corrompe JSON.
- Env vars podem vir com `\n` no fim — sempre `.trim()`.

## Integrações (credenciais = Vercel env, NUNCA neste arquivo)

| Fonte | Uso | Notas |
|---|---|---|
| Eggs CRM | contratos/corretores/leads (autoridade de vendas) | retry + stale-fallback |
| UAU ERP (Senior) | financeiro/parcelas/estoque | `obra="01VEN"`; cron warm 4min |
| OneDrive Graph | planilha Marketing (lê) + Comercial (escreve bônus) | token cifrado no **Edge Config** (fallback blob); reauth = `/api/onedrive/auth` (o usuário faz o consent) |
| Meta/Google/GA/WhatsApp/Instagram | mídia/leads | tokens System User |

## Estado do plano (ver ANALISE_DASHBOARD.md)

✅ F1 segurança · ✅ F2 consolidação+Excel · ✅ F3 resiliência · ✅ F4 limpeza ·
⬜ F5 produto (cron Excel, notificação bônus autorizado, LTV no ranking, importar pago do Excel)
