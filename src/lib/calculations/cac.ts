/**
 * CAC — Custo de Aquisição de Cliente.
 *
 * CAC = investimento total em marketing no período / qtd vendas no período
 *
 * Meta máxima: R$ 9.874,48 (CAC_MAX_ACEITAVEL = budget total / lotes vendáveis)
 */
import { PROJETO } from "@/lib/constants/projeto";
import { corMetaInversa, type Severidade } from "@/lib/utils/cores";

export interface CacInput {
  investimentoTotal: number;
  qtdVendas: number;
}

export interface CacResultado {
  valor: number;
  meta: number;
  severidade: Severidade;
  formula: string;
}

export function calcularCac(input: CacInput): CacResultado {
  const valor = input.qtdVendas > 0 ? input.investimentoTotal / input.qtdVendas : 0;
  return {
    valor,
    meta: PROJETO.CAC_MAX_ACEITAVEL,
    severidade: corMetaInversa(valor, PROJETO.CAC_MAX_ACEITAVEL),
    formula: `CAC = R$ ${input.investimentoTotal.toLocaleString("pt-BR")} / ${input.qtdVendas} vendas`,
  };
}
