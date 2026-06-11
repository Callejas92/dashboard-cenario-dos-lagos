/**
 * VSO — Vendas Sobre Oferta. ÚNICA fonte de verdade pro V2.
 *
 * Fórmula (acumulado): VSO = vendidos / ofertaTotal
 *  - "vendidos"   = vendas FIRMES (assinado+) do CRM Eggs — a MESMA contagem dos
 *    outros cards (antes vinha do espelho UAU, que contava "CONTRATO" = enviado
 *    p/ assinatura como vendido → 54 vs 46 na mesma tela).
 *  - "ofertaTotal" = lotes vendáveis (174) menos os fora-de-venda.
 *
 * Régua: o VSO ESPERADO até hoje pela curva do projeto (meses decorridos ÷ prazo).
 * A meta fixa de 5% era inútil num acumulado (sempre verde a partir do mês 1).
 */
import { PROJETO } from "@/lib/constants/projeto";
import { corMeta, type Severidade } from "@/lib/utils/cores";

export interface VsoInput {
  /** Vendas firmes (assinado+), fonte CRM Eggs. */
  vendidos: number;
  /** Lotes fora de venda/bloqueados (subtraem da oferta). Default 0. */
  foraDeVenda?: number;
  /** Meses desde o lançamento (pra régua da curva). */
  mesesDecorridos: number;
}

export interface VsoResultado {
  /** Percentual decimal (0.264 = 26,4%). */
  valor: number;
  /** VSO esperado até hoje pela curva (decimal). */
  esperadoHoje: number;
  severidade: Severidade;
  formula: string;
}

export function calcularVso(input: VsoInput): VsoResultado {
  const oferta = Math.max(1, PROJETO.LOTES_VENDAVEIS - (input.foraDeVenda ?? 0));
  const valor = input.vendidos / oferta;
  const esperadoHoje = Math.min(1, input.mesesDecorridos / PROJETO.PRAZO_COMERCIALIZACAO_MESES);

  return {
    valor,
    esperadoHoje,
    severidade: corMeta(valor, esperadoHoje),
    formula:
      `VSO = vendas firmes / oferta = ${input.vendidos} / ${oferta}\n` +
      `Esperado p/ hoje (curva ${PROJETO.PRAZO_COMERCIALIZACAO_MESES}m): ${(esperadoHoje * 100).toFixed(1)}%\n` +
      `Fonte: CRM Eggs (assinado+) — mesma contagem dos demais cards`,
  };
}
