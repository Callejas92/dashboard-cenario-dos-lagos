# 📊 Análise Completa — Dashboard Cenário dos Lagos

> Gerada em **09–10/06/2026** por auditoria completa (código + dados ao vivo + premissa original).
> Status das correções é atualizado conforme as fases avançam.

---

## 1. TL;DR

O dashboard **cumpre a premissa original** (monitor de decisão, 3 abas, mês comercial 15→14, Excel como registro mestre) e as **8 integrações estavam verdes** na verificação ao vivo. A auditoria achou **1 risco crítico de segurança** (APIs de escrita abertas — incluindo a do PIX), **resíduos da regra antiga de bônus** com risco de info errada, e melhorias de robustez. O plano de correção tem 5 fases (abaixo).

---

## 2. Premissa original (briefing V1, mai/2026) — o que vale sempre

- **Dashboard é monitor, não sistema de gestão.** Usuário único: Felipe (marketing + comercial + financeiro).
- **Planilha Marketing (OneDrive)** = fonte da verdade das premissas estratégicas (VGV R$ 85,91M · 174 lotes vendáveis · budget mkt R$ 1,72M · velocidade alvo 11,6 lotes/mês · CAC máx R$ 9.874).
- **Planilha Comercial (Excel)** = registro mestre de vendas validadas. O dashboard só escreve nela o **status de bônus** (colunas Status Corretor / Status Imob).
- **Mês comercial = dia 15 a 14** (não é mês civil). Lançamento: 14/04/2026.
- **Venda = contrato ASSINADO ou posterior** (Faturado/Entregue são sub-métricas).
- 100% das vendas via corretores autônomos; marketing digital é topo de funil de notoriedade — **não tentar medir atribuição lead→venda** que não existe na prática.
- Design: lei 5/15/30s, cores semânticas, sem chartjunk, skeleton em todo loading, mobile-first no Panorama.
- Os 10 bugs de dados do briefing (D1–D10: VGV 90,6M→85,91M, VSO inconsistente, projeção sem cap, leads 10x, datas agrupadas etc.) **foram resolvidos no redesign V2**.

---

## 3. O que o dashboard tem hoje (mapa funcional)

### Panorama (visão executiva, mobile-first)
KPIs hero (VGV vendido, VSO, velocidade do mês comercial) · mini-funil clicável · velocidade em 4 janelas (7d/30d/mês comercial/acumulado) · gráfico velocidade no tempo (barras por mês comercial + meta + atual) · vendas por dia com **marcadores de eventos editáveis** · curva de vendas acumuladas vs meta · previsão de término (3 cenários) · saúde do marketing · alertas condicionais · insights.

### Pipeline (operacional, 4 sub-abas)
- **Contratos:** funil por estágio, filtros, busca, tabela, drawer completo (cliente/financeiro/parcelas/bônus).
- **Corretores:** ranking VGV, ativo/parado >30d, alerta de concentração, **scorecard LTV** por corretor (drawer: LTV líquido = Mangaba − custos, qualidade 0–100, LTV ajustado).
- **Estoque:** 213 lotes, status/classificação/quadra, R$/m², drawers.
- **Financeiro & Bônus:** VGV Total vs **VGV Mangaba** (principal líquido), inadimplência por cliente, **gestão de bônus (regra 1,5%)** com marcar pago, liberar manual, drawer detalhado, **Pagamentos por PIX** (por recebedor, chave editável), **Bônus pago** (histórico), sync automático com o Excel (status + cores + auto-cura de órfãos).

### Marketing (4 sub-abas)
Painel (premissas + orçado vs realizado + plano mensal 18m + gastos por grupo + eventos — fonte: planilha OneDrive) · Digital (Meta + Google) · Orgânico (Instagram + Site + WhatsApp) · CRM Leads (Eggs).

### Admin (escondido, ⚙️)
Status ao vivo das integrações: OneDrive, **Excel Bônus (sync automático)**, Eggs CRM, UAU ERP, Meta, Google Ads, GA, WhatsApp, Instagram — com última sincronização e último erro.

### Regra de negócio do bônus (atual, jun/2026)
- R$ 3.000 corretor + R$ 1.000 imobiliária externa por venda válida (ASSINADO+, não-investidor).
- **Autorizado quando o cliente pagou ≥ 1,5% do contrato** (valor recebido no ERP UAU = "o que veio pra Mangaba"). Liberação manual disponível como exceção (registrada).
- Excel recebe por coluna: `pago` (marcado no dashboard) · `autorizado` · `aguardando pgt` (+ cores verde forte/verde/âmbar). "pago" digitado à mão é preservado.

---

## 4. Problemas encontrados (auditoria) e status

### 🔴 P0 — Críticos
| # | Problema | Risco | Status |
|---|---|---|---|
| 1 | **APIs de escrita sem autenticação** (`/api/pix`, `/api/bonus` POST, `/api/eventos`, `/api/bonus/sync-excel` POST) — login era só visual | Trocar PIX de corretor = fraude direta; marcar bônus pago falso; bagunçar dados | ✅ **Corrigido (Fase 1)** — Bearer obrigatório, login guarda credencial, 401 verificado ao vivo nas 5 rotas |
| 2 | **Resíduos da regra antiga de bônus** (entrada quitada) em 4 componentes — podiam autorizar bônus com <1,5% pago | Info errada / pagamento indevido | ✅ **Corrigido (Fase 1)** — regra 1,5% estrita em todo lugar; qualidade do scorecard atualizada |
| 3 | **Falha do sync Excel silenciosa** (`.catch(() => {})`) — OneDrive caía e ninguém sabia | Excel desatualizado sem aviso | ✅ **Corrigido (Fase 1)** — `logSyncFalha` + card no Admin |
| 4 | **"Marcar pago" intermitente** — cache de memória por instância (5min) ignorava o blob compartilhado; outra instância servia dado velho | "Dei pago e não foi" | ✅ **Corrigido (Fase 2)** — blob é a fonte; memória só fallback |

### 🟠 P1 — Altos
| # | Problema | Status |
|---|---|---|
| 5 | **Regras de negócio espalhadas**: fator Mangaba 0,935 em 3 lugares, comissão 6,5% em 3, bônus 3k/1k, 1,5% | ✅ **Corrigido (Fase 2)** — `src/lib/constants/negocio.ts` é a fonte única |
| 6 | Excel não recebia **"pago"** do dashboard (só autorizado/aguardando) | ✅ **Corrigido (Fase 2)** — escreve "pago" por coluna + cor verde forte; "pago" manual preservado |
| 7 | `investor-lots.json` hardcoded (39 lotes do investidor) — mudança exige deploy | ✅ **Editável sem deploy (Fase 4)** — blob override via `/api/investor-lots` (GET lista; POST protegido), JSON vira seed/fallback |
| 8 | Sem retry/backoff em Eggs CRM e Graph; UAU com retry linear | ✅ **Eggs com retry + stale-fallback (Fase 3)** — UAU já tinha 3 rodadas; Graph tem retry por faixa no sync |
| 9 | Blob `onedrive-token.json` com access público (URL determinística) | ✅ **Cifrado AES-256-GCM (Fase 3)** — chave derivada do client_secret; migração transparente do legado |

### 🟡 P2 — Médios
| # | Problema | Status |
|---|---|---|
| 10 | UAU instável → `completo=false` invisível pro usuário (badge some sem explicação; telas não indicam "dado parcial") | ✅ **Banner "ERP instável" na aba Financeiro (Fase 3)**; badge segue oculto quando incompleto (correto) |
| 11 | Meta do VSO: briefing diz ≥5% (mensal?), painel usa outra régua — **conferir com o Felipe qual é a certa** | ⬜ pendente decisão |
| 12 | 21 componentes V1 deprecated + rota `/legacy` ainda no bundle | ✅ **Removidos (Fase 4)** — raiz vai direto pro Panorama; `/api/metrics` mantida (histórico) |
| 13 | Interfaces de bônus duplicadas (BonusEntry vs BonusItem vs BonusMin) — risco de dessincronizar | ⬜ futuro (mitigado: campos opcionais + regra estrita; unificação fica pra quando mexer nesses arquivos) |
| 14 | Colunas U ("Bônus Corretor") e W ("Bônus Imob") do Excel são valor fixo — Felipe pediu pra deletar | ✅ **Deletadas (10/06)** — status agora em U/V; sync acha pelo cabeçalho |
| 15 | Rate-limit do Meta tratado como "não testado" no admin (pode parecer ok throttled) | ✅ Já estava correto (pingGraph trata #4/#17/#32 como "não testado", amarelo) |

### Arquitetura de dados (referência)
- **Fontes:** Eggs CRM (contratos/leads, autoridade de vendas) · UAU ERP (financeiro/estoque, lento ~40s frio, instável) · OneDrive Graph (planilhas) · Meta/Google/GA/WhatsApp/Instagram (mídia) · Vercel Blob (persistência: pagamentos de bônus, PIX, eventos, tokens, caches).
- **Padrão de cache:** stale-while-revalidate via Blob compartilhado + revalidação em background (`after()`); cron warm a cada 4min (8h–22h) mantém o UAU aquecido.
- **Escritas do dashboard:** bônus pago/isento/liberado (blob), PIX (blob), eventos (blob), métricas semanais (blob), **status de bônus no Excel Comercial** (Graph).

---

## 5. Plano de evolução (5 fases)

| Fase | Conteúdo | Status |
|---|---|---|
| **1. Blindar** | Proteger APIs de escrita + regra 1,5% estrita + log de falha do sync no Admin | ✅ concluída (10/06) |
| **2. Consolidar** | `constants/negocio.ts` (fonte única) + Excel escreve "pago" + fix "pago intermitente" + deletar U/W | ✅ concluída (10/06) |
| **3. Resiliência** | Indicador "dado parcial/ERP instável" + retry/stale-fallback no Eggs + token OneDrive cifrado | ✅ concluída (10/06) |
| **4. Limpeza** | Remover /legacy + 21 deprecated + investor-lots editável sem deploy + CLAUDE.md modernizado (sem segredos inline) | ✅ concluída (10/06) |
| **5. Produto** | Cron do sync Excel (independente de acesso) + notificação de bônus autorizado + LTV no ranking + histórico de inadimplência + funil completo (Faturado/Entregue) quando o comercial alimentar | ⬜ |

---

## 6. Decisões de negócio registradas (pra não esquecer)

- **Bônus autorizado = pagou ≥1,5% do contrato** (jun/2026; substituiu "entrada toda paga").
- Base do % = **contrato total**; "pago" = valor recebido no ERP.
- 7,5% (comissões 6,5% + bônus ~1%) era a referência antiga de análise — mantida apenas como contexto histórico.
- Eggs/Gestão **não** recebe o R$ 1k de imobiliária (interna).
- Lotes do investidor (39) ficam fora de VGV/velocidade/bônus.
- Mês comercial: 15 → 14. Lançamento: 14/04/2026.
- Excel Comercial: o dashboard escreve **somente** as colunas de status de bônus; inventário/preços/clientes são do Felipe.
