/**
 * VGV — Valor Geral de Vendas. ÚNICA fonte de verdade pro V2.
 *
 * Corrige D1: dashboard atual mostra R$ 90,6M em alguns lugares (errado).
 * O VGV correto é R$ 85.907.960,04 — vem da planilha Marketing aba PREMISSAS.
 * 39 lotes do investidor (Tio Ico) são EXCLUÍDOS de tudo.
 *
 * Hierarquia de "valor vendido":
 *  1. Eggs Contrato (valorContratado) — preço efetivo com ganho de salto
 *  2. UAU principal (valorPrincipal) — capital sem juros do financiamento
 *  3. UAU tabela (ValorTotal_unid) — preço de lista pré-ganho
 */
import { PROJETO, isVenda } from "@/lib/constants/projeto";

export interface VgvInput {
  /** Lista de contratos com loteId, valor e status. */
  contratos: { loteId: string; valorContratado: number; status: string; cancelado: boolean }[];
  /**
   * Lotes do investidor (excluídos). Default: vazio — os dados de /api/crm/contratos
   * JÁ chegam filtrados no servidor (getInvestorLots). Só passe se a fonte for crua.
   */
  lotesInvestidor?: Set<string>;
}

export interface VgvResultado {
  /** R$ 85.91M — VGV total planejado (constante). */
  vgvTotal: number;
  /** Soma de contratos válidos (assinado, não cancelado, não investidor). */
  vgvVendido: number;
  /** vgvVendido / vgvTotal. */
  pctVendido: number;
  /** Lotes vendáveis: 174. */
  lotesTotal: number;
  /** Qtd de contratos válidos. */
  lotesVendidos: number;
  /** Estoque restante. */
  lotesRestantes: number;
  /** vgvTotal - vgvVendido. */
  vgvRestante: number;
}

export function calcularVgv(input: VgvInput): VgvResultado {
  const investidor = input.lotesInvestidor ?? new Set<string>();

  const validos = input.contratos.filter((c) =>
    !c.cancelado &&
    !investidor.has(c.loteId) &&
    isVenda(c.status),
  );

  const vgvVendido = validos.reduce((s, c) => s + c.valorContratado, 0);
  const lotesVendidos = validos.length;

  return {
    vgvTotal: PROJETO.VGV_INICIAL,
    vgvVendido,
    pctVendido: PROJETO.VGV_INICIAL > 0 ? vgvVendido / PROJETO.VGV_INICIAL : 0,
    lotesTotal: PROJETO.LOTES_VENDAVEIS,
    lotesVendidos,
    lotesRestantes: PROJETO.LOTES_VENDAVEIS - lotesVendidos,
    vgvRestante: PROJETO.VGV_INICIAL - vgvVendido,
  };
}
