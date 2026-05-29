/**
 * Constantes globais do projeto Cenário dos Lagos.
 *
 * FONTE DA VERDADE pras premissas estratégicas. Qualquer cálculo que
 * envolva VGV, lotes, budget, metas DEVE importar daqui.
 *
 * Origem dos números:
 *  - Planilha Marketing (OneDrive) → aba PREMISSAS
 *  - Decisões operacionais do Felipe (founder Mangaba Urbanismo)
 *
 * Versão: V1 · Mai/2026
 */

export const PROJETO = {
  // ─── Premissas estratégicas (fonte: planilha Marketing - aba PREMISSAS) ───
  /** R$ 85,91M — VGV INICIAL sem ganho de salto. Substitui o R$ 90,6M incorreto. */
  VGV_INICIAL: 85_907_960.04,

  /** 174 lotes vendáveis = 213 totais − 39 do investidor (Tio Ico). */
  LOTES_VENDAVEIS: 174,

  /** R$ 493.723,91 = VGV_INICIAL / LOTES_VENDAVEIS. */
  VALOR_MEDIO_LOTE: 493_723.91,

  /** Janela comercial planejada (Felipe decidiu 12 meses em vez de 15 originalmente). */
  PRAZO_COMERCIALIZACAO_MESES: 12,

  /** 2% do VGV é o budget total de marketing. */
  PERCENTUAL_MKT_DO_VGV: 0.02,

  /** R$ 1,72M = VGV * 2%. */
  BUDGET_MKT_TOTAL: 1_718_159.20,

  /** Velocidade alvo: 14.5 lotes/mês = 174 ÷ 12 meses. */
  VELOCIDADE_ALVO_LOTES_MES: 14.5,

  /** R$ 9.874,48 — CAC máximo aceitável (budget total / lotes vendáveis). */
  CAC_MAX_ACEITAVEL: 9_874.48,

  // ─── Definições operacionais ─────────────────────────────────────────────
  /** ≥ 5% de VSO acumulado é a meta. */
  VSO_META_PERCENT: 0.05,

  /** Até 3% de inadimplência é verde (saudável). */
  INADIMPLENCIA_VERDE_MAX: 0.03,

  /** 3-5% é amarelo (atenção). Acima de 5% é vermelho. */
  INADIMPLENCIA_AMARELO_MAX: 0.05,

  // ─── Mês comercial (CRÍTICO — não é mês civil) ──────────────────────────
  /** Mês comercial vai do dia 15 ao dia 14 do mês seguinte. */
  DIA_INICIO_MES_COMERCIAL: 15,

  // ─── Definição operacional de "VENDA" ────────────────────────────────────
  /**
   * Venda = contrato Eggs nesses estágios.
   * Faturado e Entregue são sub-métricas, mas contam como venda.
   * Mantém os exatos labels que o Eggs CRM retorna em statusOriginal.
   */
  ESTAGIOS_QUE_CONTAM_COMO_VENDA: [
    "ASSINADO",
    "FATURADO",
    "ENTREGUE AO INCORPORADOR",
  ] as const,

  // ─── Lançamento ─────────────────────────────────────────────────────────
  /** Data do lançamento — usada como fallback de início temporal. */
  DATA_LANCAMENTO: "2026-04-14" as const,
} as const;

/** Type helper: união dos estágios que contam como venda. */
export type EstagioVenda = (typeof PROJETO.ESTAGIOS_QUE_CONTAM_COMO_VENDA)[number];

/** Verifica se um status do Eggs CRM conta como venda. */
export function isVenda(statusEggs: string): boolean {
  return (PROJETO.ESTAGIOS_QUE_CONTAM_COMO_VENDA as readonly string[]).includes(
    statusEggs.toUpperCase().trim(),
  );
}
