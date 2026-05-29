# BRIEFING DE REDESIGN — Dashboard Cenário dos Lagos

> **Para colar no Claude Code.** Documento único, autocontido, ordem de execução clara.
> Versão 1 (V1) · Mai/2026 · Mangaba Urbanismo

---

## 1. CONTEXTO ESTRATÉGICO

Sou Felipe, founder da Mangaba Urbanismo. Estou refatorando o dashboard interno do Cenário dos Lagos (174 lotes vendáveis, R$ 85.91M VGV, 15 meses de comercialização) porque a versão atual está confusa, com 11 abas sobrepostas, dados inconsistentes entre telas, e sem hierarquia de informação que me apoie em decisão.

**A planilha de Marketing (OneDrive) é a fonte da verdade** das premissas estratégicas. **A planilha Comercial (Excel)** é o registro mestre de vendas validadas. **O dashboard é monitor, não sistema de gestão.**

**Modelo de negócio crítico:** 100% das vendas vêm via corretores autônomos. Marketing digital (Meta/Google) é topo de funil de notoriedade, não geração direta de venda. Atribuição lead→venda não existe na prática — não tentar medir o que não dá pra medir.

**Quem usa o dashboard:** só eu. Marketing + Comercial + Financeiro, tudo eu.

---

## 2. PRINCÍPIOS DE DESIGN (não negociáveis)

Aplicar **Stephen Few** (dashboards operacionais) e **Cole Knaflic** (storytelling com dados):

1. **Lei do 5/15/30 segundos**: 5s = bati a meta? · 15s = o que tá bom/ruim? · 30s+ = por quê?
2. **Cores semânticas apenas**: verde (✅ meta) · vermelho (🔴 alerta) · amarelo (🟡 atenção) · cinza (neutro). **Nada de gradiente, sombra, 3D, ou cor decorativa.**
3. **Eliminar chartjunk**: sem pizza com mais de 4 fatias, sem cores arbitrárias em barras, sem 8 KPIs lado a lado com mesmo peso visual.
4. **Densidade > decoração**: sparklines embutidos em KPIs · tooltip com definição matemática em todo KPI.
5. **Skeleton em todo loading** + cache entre navegação de abas (a aba Contratos hoje demora 10+ segundos pra carregar).
6. **Default temporal = mês comercial atual** (definição abaixo).
7. **Mobile-first no Panorama** (você abre rápido no celular); desktop-first em Pipeline e Marketing (análise).

---

## 3. REGRAS DE NEGÓCIO (constantes globais)

Criar `src/lib/constants/projeto.ts`:

```typescript
export const PROJETO = {
  // Premissas estratégicas (fonte: planilha Marketing - aba PREMISSAS)
  VGV_INICIAL: 85_907_960.04,        // R$ 85.91M (NÃO 90.6M — bug atual)
  LOTES_VENDAVEIS: 174,              // 213 totais MENOS 39 do investidor
  VALOR_MEDIO_LOTE: 493_723.91,
  PRAZO_COMERCIALIZACAO_MESES: 15,
  PERCENTUAL_MKT_DO_VGV: 0.02,       // 2%
  BUDGET_MKT_TOTAL: 1_718_159.20,
  VELOCIDADE_ALVO_LOTES_MES: 11.6,
  CAC_MAX_ACEITAVEL: 9_874.48,
  
  // Definições operacionais
  VSO_META_PERCENT: 0.05,             // ≥5% acumulado
  INADIMPLENCIA_VERDE_MAX: 0.03,      // até 3%
  INADIMPLENCIA_AMARELO_MAX: 0.05,    // 3-5% atenção
  
  // Mês comercial (CRÍTICO — não é mês civil)
  DIA_INICIO_MES_COMERCIAL: 15,       // mês comercial: dia 15 a 14 do mês seguinte
  
  // Definição operacional de "VENDA"
  // Venda = Contrato em estágio "Assinado" ou posterior
  // (Faturado e Entregue ao Incorporador são sub-métricas)
  ESTAGIOS_QUE_CONTAM_COMO_VENDA: ['ASSINADO', 'FATURADO', 'ENTREGUE'],
};
```

**Função utilitária mês comercial:**

```typescript
// src/lib/utils/mesComercial.ts
export function getMesComercialAtual(): { inicio: Date; fim: Date; label: string } {
  const hoje = new Date();
  const dia = hoje.getDate();
  const mes = hoje.getMonth();
  const ano = hoje.getFullYear();
  
  // Se hoje >= dia 15, mês comercial atual começou no dia 15 deste mês
  // Se hoje < dia 15, mês comercial atual começou no dia 15 do mês anterior
  const inicio = dia >= 15 
    ? new Date(ano, mes, 15)
    : new Date(ano, mes - 1, 15);
  
  const fim = new Date(inicio);
  fim.setMonth(fim.getMonth() + 1);
  fim.setDate(14);
  fim.setHours(23, 59, 59);
  
  const label = `${inicio.toLocaleDateString('pt-BR')} – ${fim.toLocaleDateString('pt-BR')}`;
  return { inicio, fim, label };
}
```

---

## 4. PROBLEMAS DE DADOS A CORRIGIR (PRIORIDADE)

Estes são bugs de cálculo/integração, não de UI. **Corrigir antes ou junto com o redesign:**

| # | Problema | Onde | Solução |
|---|---|---|---|
| D1 | VGV mostra R$ 90.6M (deveria ser R$ 85.91M) | `lib/calculations/vgv.ts` | Usar `PROJETO.VGV_INICIAL`. Eliminar lotes do investidor (39 lotes) de qualquer cálculo de VGV vendável. |
| D2 | VSO inconsistente: 23% (Visão Geral) vs 28.2% (Estoque) | Múltiplas funções | Centralizar em `lib/calculations/vso.ts`. Fórmula única: `vendidos / (vendidos + estoque_disponivel)`. Apagar duplicações. |
| D3 | Projeção 12 meses = 480 lotes (estoque = 174) | `lib/calculations/projection.ts` | Cap em `Math.min(projecaoLinear, LOTES_VENDAVEIS - vendidos)`. |
| D4 | Aba Canais retorna tudo zerado | API route ou hook | **Eliminar aba** (vira sub-seção dentro de Marketing). |
| D5 | "1.690 leads" Visão Geral vs "169 leads" CRM (10x) | Cálculo de leads | Investigar: provavelmente Visão Geral conta cliques/reaches do Meta como "lead". Padronizar como "lead = registro no CRM Eggs". |
| D6 | Vendas Mensais — todas 40 vendas em 1 só mês (Out/25) | Cálculo de agrupamento | Bug de parsing de data. Investigar coluna `Data Venda` da planilha Comercial. |
| D7 | CRM "Leads por Dia" tem só 1 pico no início | Mesmo problema D6 | Mesma correção. |
| D8 | "Top Parcelas Vencidas" com coluna Cliente vazia | Join com tabela de clientes | Adicionar JOIN com nome do comprador (já existe na planilha Comercial col F). |
| D9 | Eggs aparece em gráfico de bônus comprometido | Filtro errado | Excluir "EGGS GESTAO E INTELIGENCIA EM VENDAS" e similares do gráfico de bônus por corretor PF. |
| D10 | Loading lento sem skeleton (Contratos 10s+) | UX | Adicionar skeleton em todas as abas + cache de 5min entre navegação. |

---

## 5. ARQUITETURA DE INFORMAÇÃO (3 abas + admin)

```
┌──────────────────────────────────────────────────────────────────┐
│  📊 PANORAMA     📋 PIPELINE     📣 MARKETING                    │
└──────────────────────────────────────────────────────────────────┘
                                              (/admin escondido)
```

### 5.1 — Aba PANORAMA (default ao logar)

**Objetivo:** decisão do dia em 5 segundos. Mobile-first.

**Linha 1 — 3 KPIs gigantes (negócio):**
- VGV vendido / VGV total (barra de progresso 29.7%) + sparkline 30d
- VSO acumulado (28.2% vs meta ≥5%) + comparação semana anterior
- Velocidade do mês comercial (X lotes vendidos vs 11.6 alvo) + sparkline

**Linha 2 — Pipeline de Contratos (mini-funil sempre visível):**
- 6 estágios horizontais com qtd + valor: Gerado / Conferido / Enviado p/ Ass. / Assinado / Faturado / Entregue
- Click em estágio → leva pra aba Pipeline filtrada nesse estágio
- Subtítulo: "X contratos · R$ X em pipeline"

**Linha 3 — Velocidade de venda (NOVO — pedido do Felipe):**
- Vendas últimos 7 dias: X lotes (Y% do estoque restante)
- Vendas últimos 30 dias: X lotes
- Vendas no mês comercial atual: X lotes (com label de período)
- Vendas no lançamento (acumulado): 40 lotes

**Linha 4 — Saúde do Marketing (4 KPIs médios):**
- CAC do mês comercial vs CAC alvo (R$ 9.874)
- Investimento do mês vs budget mensal
- Leads do mês (do CRM Eggs)
- Top campanha do mês (nome + ROI ou CTR)

**Linha 5 — Alertas (cards condicionais, só aparece se relevante):**
- 🟡 Bônus a pagar: R$ X · N corretores → leva pra Pipeline > Bônus
- 🟢/🟡/🔴 Inadimplência: X% (concentrada em N clientes se aplicável)
- 🔴 Concentração crítica: corretor X = Y% das vendas (se >40%)
- 🟡 N leads sem atendimento >24h (se houver)
- 🟡 N contratos parados em "Enviado p/ Assinatura" >7d

**Linha 6 — Bloco "Insights" (NOVO — pedido do Felipe "curiosidades"):**
4-6 cards automáticos calculados por regras de negócio. Atualizam diariamente. Exemplos:
- "Tua taxa de conversão Conferido → Assinado nos últimos 30d foi X%"
- "Tempo médio Enviado → Assinado: Y dias (vs Z dias mês anterior)"
- "Corretor X dobrou ritmo nas últimas 2 semanas"
- "85% dos contratos da Q3 são do mesmo cliente (concentração de risco)"
- "Investimento em Mídia Digital foi X% do budget consumido neste mês comercial"
- "Lote médio vendido neste mês: classificação X, área Y m²"

Implementar como `src/lib/insights/` com 1 arquivo por regra, retornando `{ titulo, texto, severidade, icon }`.

---

### 5.2 — Aba PIPELINE (operação comercial)

**Sub-navegação interna (tabs internas, não abas do menu):**

#### 2a · Pipeline (default)
- Funil grande horizontal: 6 estágios com qtd, valor, % do total
- Filtros: tipo (Físico/Digital), corretor, busca livre
- Tabela 49 contratos com colunas: Lote · Cliente (CPF/CNPJ + tag PF/PJ) · Corretor · Status · Tipo · Valor · Bônus
- Click numa linha → drawer lateral com detalhe completo do contrato
- Alerta: contratos parados >7d em "Enviado p/ Assinatura"

#### 2b · Performance Corretor
- Tabela ordenável: Corretor · CRECI · Lotes · VGV · Bônus acumulado · Última venda · Status (ativo/parado >30d)
- **Excluir Eggs** desta lista (não conta como corretor PF)
- Gráfico: barras horizontais por VGV (1 cor só, não arco-íris)
- Alerta visual no topo se algum corretor >40% das vendas
- Default: ordenado por VGV descendente

#### 2c · Estoque
- Cards top: Total / Disponíveis / Vendidos / Em Venda (sem Fora de Venda — agregar em "indisponíveis")
- Distribuição por classificação (gráfico de barras horizontais, ordenado)
- Distribuição por quadra (mesma coisa)
- Tabela de lotes com filtros (status, classificação, quadra, valor)

#### 2d · Financeiro & Bônus
**Sub-seção Financeiro:**
- 3 perspectivas de valor (Tabela ERP / Contratado CRM / Total a Pagar)
- Inadimplência: 1 KPI + lista agregada **por cliente** (não por parcela) — "Cliente X: 8 parcelas atrasadas, R$ Y, contato"
- Eliminar bloco "Projeção de Inadimplência" (era 2.6% × 4 horizontes plano)

**Sub-seção Bônus:**
- KPIs: A Pagar Agora / Pago / Aguardando Entrada / Comprometido Total
- Lista de bônus a pagar (substituir botões "Pagar R$ 3k" por: **checkbox "Marcar como pago"** + campo data + observação)
- Quando marca pago → escreve na planilha Comercial (colunas `Status Corretor` e `Status Imob` viram "Pago" + data)
- **Excluir Eggs** desta listagem

---

### 5.3 — Aba MARKETING

**Sub-navegação interna:**

#### 3a · Painel (default — quase 100% herdado da "Marketing MKT" atual, que já é boa)
- 5 KPIs topo: VGV Inicial / Budget MKT / CAC Alvo / Velocidade Alvo / Prazo
- Bloco "Orçamento vs Realizado" (Budget Total / Realizado / Saldo / Eventos)
- Gráfico "Plano vs Realizado Mensal"
- "Gastos por Grupo do Plano MKT" (lista ordenada)
- Tabela "Eventos" + bloco "Não-Eventos"

#### 3b · Mídia Digital (NOVO — pedido do Felipe)
**Centro consolidado de mídia paga:**
- Visão geral consolidada Meta + Google (gasto, alcance, impressões, leads, CTR, CPL)
- Tabela "Campanhas Ativas": nome · canal · gasto · leads · CPL · status · variação vs semana anterior
- Top 3 campanhas (melhor performance) + Bottom 3 (pior performance)
- Histórico semanal e mensal (gráfico de linha)
- **Sem misturar com gasto de Branding** (Outdoor, Rádio, Jornal, Evento — esses ficam em Painel, não aqui)

#### 3c · Orgânico
**Instagram (orgânico — pedido do Felipe "métricas gerais pra ver crescimento"):**
- Seguidores (com crescimento %)
- Alcance médio dos posts
- Engagement médio
- Top 3 posts do mês
- Top 3 stories do mês

**Site:**
- Visitas (total + por dia)
- Fonte de tráfego (orgânico/pago/direto/referência)
- Conversão de formulário (qtd + %)
- Tempo médio na página
- Top 5 páginas mais acessadas

**WhatsApp:**
- Leads originados de WhatsApp
- Taxa de conversão WhatsApp → CRM

#### 3d · CRM/Leads
- 169 leads (ou número real do CRM Eggs)
- 4 KPIs: Total / Novos no período / Em negociação / Arquivados
- Gráfico "Leads por dia" (corrigir D7)
- Pizza "Por Fonte" (Facebook Leads / Instagram Leads / WhatsApp / Site)
- Pizza "Por Atendente" (Waner, Josiane, Elisa)
- Tabela de leads recentes (data, nome, contato, fonte, atendente, status)
- Alerta: leads sem atendimento >24h
- **NÃO MOSTRAR** "Taxa de Conversão CRM → Venda" porque ela é estruturalmente zero (vendas vêm por corretores fora do CRM). Mostra só CRM como sistema de qualificação de lead, não funil de venda.

---

### 5.4 — /admin (rota técnica escondida, fora do menu)

- Status das integrações (Meta API, Google API, UAU API, Eggs CRM, OneDrive Excel)
- Última sincronização de cada fonte
- Logs de erro
- Configurações (períodos, metas — caso queira ajustar `PROJETO` sem mexer no código)

---

## 6. ELIMINAÇÕES E CONSOLIDAÇÕES

**Abas a eliminar do menu principal:**
| Aba atual | Vai pra onde |
|---|---|
| Visão Geral | Vira PANORAMA (totalmente refatorada) |
| Canais | Some — vira seção dentro de Marketing > Mídia Digital + Painel |
| Qualidade | **Eliminar totalmente** — Felipe confirmou que não usa TLQ/TCS/SLA |
| Site | Vira sub-seção Marketing > Orgânico |
| Estoque | Vira sub-seção Pipeline > Estoque |
| Financeiro | Vira sub-seção Pipeline > Financeiro & Bônus |
| Bônus | Vira sub-seção Pipeline > Financeiro & Bônus |
| Marketing MKT | Vira sub-seção Marketing > Painel |
| Contratos | Vira sub-seção Pipeline > Pipeline (default) |
| CRM | Vira sub-seção Marketing > CRM/Leads |
| Instagram | Vira sub-seção Marketing > Orgânico |
| Meta Ads | Vira sub-seção Marketing > Mídia Digital |
| APIs | Vira /admin (rota separada) |

**De 11 abas → 3 abas + admin.**

---

## 7. ESTRUTURA TÉCNICA (arquivos Next.js)

```
src/
├── app/
│   ├── page.tsx                       → redireciona pra /panorama
│   ├── panorama/page.tsx              → NOVO
│   ├── pipeline/page.tsx              → NOVO (com sub-tabs internas)
│   ├── marketing/page.tsx             → NOVO (com sub-tabs internas)
│   ├── admin/page.tsx                 → NOVO (escondido)
│   └── legacy/page.tsx                → MOVER versão v1 atual aqui (rollback)
│
├── components/
│   ├── shared/
│   │   ├── KpiHero.tsx                → KPI gigante linha 1 do Panorama
│   │   ├── KpiMedium.tsx              → KPI médio linha 2/3 do Panorama
│   │   ├── KpiSmall.tsx               → KPI pequeno (tabelas, cards)
│   │   ├── AlertCard.tsx              → Card de alerta (linha 5 Panorama)
│   │   ├── InsightCard.tsx            → Card de insight (linha 6 Panorama)
│   │   ├── Sparkline.tsx              → Mini-gráfico embutido
│   │   ├── Skeleton.tsx               → Loading state
│   │   └── TooltipDefinicao.tsx       → Tooltip com fórmula matemática
│   │
│   ├── panorama/
│   │   ├── LinhaKpisGigantes.tsx
│   │   ├── MiniFunilContratos.tsx
│   │   ├── VelocidadeVendas.tsx
│   │   ├── SaudeMarketing.tsx
│   │   ├── ListaAlertas.tsx
│   │   └── BlocoInsights.tsx
│   │
│   ├── pipeline/
│   │   ├── PipelineTab.tsx
│   │   ├── PerformanceCorretorTab.tsx
│   │   ├── EstoqueTab.tsx
│   │   ├── FinanceiroBonusTab.tsx
│   │   ├── ContratoDrawer.tsx         → Drawer lateral ao clicar contrato
│   │   └── BonusPagamentoCard.tsx     → Card com checkbox "marcar pago"
│   │
│   ├── marketing/
│   │   ├── PainelTab.tsx
│   │   ├── MidiaDigitalTab.tsx
│   │   ├── OrganicoTab.tsx
│   │   └── CrmLeadsTab.tsx
│   │
│   └── _deprecated/                   → MOVER as 11 abas antigas pra cá
│
├── lib/
│   ├── constants/
│   │   └── projeto.ts                 → NOVO (constantes do bloco §3)
│   │
│   ├── utils/
│   │   ├── mesComercial.ts            → NOVO
│   │   ├── formatters.ts              → R$, %, datas
│   │   └── cores.ts                   → cores semânticas (verde/vermelho/amarelo/cinza)
│   │
│   ├── calculations/
│   │   ├── vgv.ts                     → ÚNICA fonte de verdade (corrige D1)
│   │   ├── vso.ts                     → ÚNICA fonte de verdade (corrige D2)
│   │   ├── projection.ts              → REFATORA com cap em 174 (corrige D3)
│   │   ├── velocidade.ts              → NOVO (vendas em janelas de tempo)
│   │   ├── cac.ts                     → CAC do mês comercial
│   │   └── inadimplencia.ts           → Agregação por cliente, não por parcela
│   │
│   ├── insights/                      → NOVO (regras de negócio para insights)
│   │   ├── taxaConversaoFunil.ts
│   │   ├── tempoMedioAssinatura.ts
│   │   ├── ritmoCorretor.ts
│   │   ├── concentracaoRisco.ts
│   │   └── index.ts                   → exporta todos
│   │
│   ├── integrations/
│   │   ├── uauApi.ts                  → leitura ERP UAU
│   │   ├── eggsCrm.ts                 → leitura CRM Eggs
│   │   ├── metaAds.ts                 → leitura Meta Ads API
│   │   ├── googleAds.ts               → leitura Google Ads API
│   │   ├── analytics.ts               → leitura GA4
│   │   ├── instagram.ts               → leitura Instagram (Meta Graph)
│   │   └── excelComercial.ts          → leitura + ESCRITA na planilha (NOVO escrita)
│   │
│   └── cache/
│       └── tabCache.ts                → cache 5min entre navegação de abas
│
└── app/api/
    ├── bonus/marcar-pago/route.ts     → NOVO (escreve na planilha Comercial)
    └── ... (rotas existentes)
```

---

## 8. ORDEM DE IMPLEMENTAÇÃO POR FASES

**Estimativa total: 25-35h do Claude Code em 5-7 sessões.**

### FASE 0 — Preparação (30min)
```bash
git checkout -b redesign-v2
# Mover as 11 abas antigas pra _deprecated/ (não apagar)
# Adicionar feature flag NEXT_PUBLIC_DASHBOARD_V2=false
# Versão v1 continua acessível em /legacy
```

### FASE 1 — Fundação (3-4h)
**Antes de mexer em UI, estabelecer base correta:**
1. Criar `lib/constants/projeto.ts` com todas as constantes
2. Criar `lib/utils/mesComercial.ts`
3. Criar `lib/calculations/vgv.ts` único (corrige D1)
4. Criar `lib/calculations/vso.ts` único (corrige D2)
5. Refatorar `lib/calculations/projection.ts` (corrige D3)
6. Criar `lib/calculations/velocidade.ts`
7. Criar componentes atômicos: KpiHero, KpiMedium, KpiSmall, AlertCard, InsightCard, Sparkline, Skeleton, TooltipDefinicao
8. Criar `lib/cache/tabCache.ts`

**Critério de aceitação Fase 1:** todos os componentes renderizam isolados (Storybook ou página de teste), e as funções de cálculo passam em testes unitários básicos (VGV, VSO, projeção dão números corretos).

### FASE 2 — Panorama (4-5h)
1. Criar `app/panorama/page.tsx`
2. Implementar Linha 1 (KPIs gigantes com sparklines)
3. Implementar Linha 2 (Mini-funil de contratos)
4. Implementar Linha 3 (Velocidade de vendas)
5. Implementar Linha 4 (Saúde do Marketing)
6. Implementar Linha 5 (Alertas condicionais)
7. Criar primeiros 4 insights em `lib/insights/`
8. Implementar Linha 6 (Bloco Insights)
9. Testar responsividade mobile

**Critério de aceitação Fase 2:** Panorama renderiza completo, todos os KPIs corretos, alertas aparecem só quando condições verdadeiras, insights atualizam.

### FASE 3 — Pipeline (5-7h)
1. Criar `app/pipeline/page.tsx` com sub-tabs internas
2. Sub-tab Pipeline (default) com funil + tabela + drawer
3. Sub-tab Performance Corretor (excluir Eggs)
4. Sub-tab Estoque
5. Sub-tab Financeiro & Bônus (inadimplência por cliente, não por parcela)
6. Implementar API route `/api/bonus/marcar-pago` com escrita na planilha
7. Implementar `BonusPagamentoCard` com checkbox

**Critério de aceitação Fase 3:** marcar bônus como pago atualiza planilha Comercial e persiste após reload.

### FASE 4 — Marketing (5-7h)
1. Criar `app/marketing/page.tsx` com sub-tabs internas
2. Sub-tab Painel (refatorar a partir do "Marketing MKT" atual)
3. Sub-tab Mídia Digital (consolidar Meta + Google)
4. Sub-tab Orgânico (Instagram + Site + WhatsApp)
5. Sub-tab CRM/Leads (corrigir D5, D7, eliminar "taxa conversão CRM→venda")

**Critério de aceitação Fase 4:** todos os KPIs batem com a planilha Marketing (R$ 85.91M VGV, R$ 1.72M budget, R$ 333K realizado, etc).

### FASE 5 — Admin + Polish (2-3h)
1. Criar `app/admin/page.tsx` com status integrações
2. Migrar tela de APIs pra cá
3. Aplicar skeleton em todas as abas
4. Aplicar cache de 5min
5. Validar responsividade
6. QA cruzando com planilha Marketing e Comercial

### FASE 6 — Toggle de Release (1h)
1. Setar `NEXT_PUBLIC_DASHBOARD_V2=true`
2. Roda 1 semana em paralelo (`/` v2, `/legacy` v1)
3. Se OK após 1 semana, deletar `_deprecated/`

---

## 9. CHECKPOINTS DE REVISÃO (Felipe revisa)

**Checkpoint 1** — após Fase 1: Felipe revisa que os números base estão corretos (VGV, VSO, projeção). Validação cruzada com planilha.

**Checkpoint 2** — após Fase 2: Felipe testa Panorama no celular e desktop. Confirma se os alertas e insights fazem sentido pra ele.

**Checkpoint 3** — após Fase 3: Felipe testa fluxo de marcar bônus como pago. Confirma que escreve corretamente na planilha.

**Checkpoint 4** — após Fase 4: Felipe valida que Marketing reflete o que ele vê na planilha.

**Checkpoint 5** — após Fase 5: review geral antes de virar default.

---

## 10. CRITÉRIOS DE ACEITAÇÃO FINAIS

- [ ] 3 abas no menu principal (Panorama, Pipeline, Marketing) + /admin escondido
- [ ] Todos os KPIs com tooltip explicando fórmula matemática
- [ ] Default temporal = mês comercial atual (dia 15 a 14)
- [ ] VGV = R$ 85.91M em TODA tela (não R$ 90.6M)
- [ ] VSO = mesmo número em TODA tela
- [ ] Projeção limitada a 174 lotes
- [ ] Bônus do Eggs não aparece em listagens por corretor PF
- [ ] Mobile-first no Panorama, funciona em celular sem horizontal scroll
- [ ] Skeleton em todo loading + cache 5min entre abas
- [ ] Marcar bônus como pago escreve na planilha Comercial
- [ ] Nenhum gráfico de pizza com >4 fatias
- [ ] Cores apenas semânticas (verde/amarelo/vermelho/cinza)
- [ ] Sem chartjunk: gradiente, 3D, sombra decorativa
- [ ] Bloco "Insights" tem 4-6 cards atualizando diariamente
- [ ] Versão antiga preservada em /legacy por 1 semana antes de deletar

---

## 11. NÃO-OBJETIVOS DA V1 (fica pra V2)

- Atribuição lead→venda (modelo de negócio não suporta)
- Mapa visual do empreendimento (174 lotes em grid de quadras)
- IA para insights (V1 é regra de negócio, V2 pode ter ML)
- Notificações push de alertas
- Multi-usuário (V1 é single-user — só Felipe)
- Export de relatórios em PDF
- Histórico de mudanças nos KPIs

---

## 12. PRIMEIRA MENSAGEM PARA O CLAUDE CODE

Cole isso na primeira mensagem no Claude Code, depois de fazer `git checkout -b redesign-v2`:

---

> **Claude Code, vamos refatorar este dashboard. O briefing completo está em `BRIEFING_REDESIGN_DASHBOARD.md` na raiz do projeto. NÃO comece codificando ainda.**
>
> **Antes de mexer em qualquer arquivo, me devolva:**
>
> 1. Confirmação de que você leu o briefing inteiro
> 2. Lista dos arquivos que você vai criar / mover / refatorar / deletar na Fase 0 e Fase 1
> 3. Qualquer risco técnico que você identifica (ex: dependência que não existe, integração que vai precisar de chave nova, planilha não acessível)
> 4. Qualquer ambiguidade no briefing que precisa de clarificação
>
> **Princípios não-negociáveis (mesmo se eu pedir o contrário no meio do processo):**
> - Nenhum gráfico de pizza com mais de 4 fatias
> - Cores apenas: verde (✅ meta) · vermelho (🔴 alerta) · amarelo (🟡 atenção) · cinza (neutro)
> - Nada de gradiente, sombra decorativa, 3D
> - Todo KPI deve ter tooltip com fórmula matemática
> - Default de período = mês comercial atual (dia 15 a 14 do mês seguinte)
> - Skeleton em todo loading + cache entre navegação de abas
> - Mobile-first no Panorama
>
> **Quando eu autorizar, comece pela Fase 0 e me peça checkpoint antes de avançar pra Fase 2.**

---

## 13. ANEXO — Definição operacional de "Venda"

**Venda = Contrato em estágio "Assinado" ou posterior** (incluindo Faturado e Entregue ao Incorporador).

**Justificativa:** este é o estágio onde o cliente está comprometido comercialmente. Faturado e Entregue são processos administrativos pós-venda que não devem atrasar o reconhecimento da venda no dashboard.

**Sub-métricas (mostrar como detalhe, não como total principal):**
- Vendas Assinadas: número grande (ex: 40)
- Sub: Faturadas (X) · Entregues (Y)

---

**FIM DO BRIEFING.**

Versão 1 · Mai/2026
Dashboard Cenário dos Lagos · Mangaba Urbanismo
