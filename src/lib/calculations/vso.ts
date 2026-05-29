/**
 * VSO — Velocidade Sobre Oferta. ÚNICA fonte de verdade pro V2.
 *
 * Corrige D2: dashboard atual mostra 23% (Visão Geral) vs 28.2% (Estoque) — inconsistente.
 *
 * Fórmula padrão (mercado imobiliário):
 *   VSO = vendidos / (vendidos + disponivel)
 *
 * Onde:
 *  - "vendidos" = lotes em estágio assinado/faturado/entregue
 *  - "disponivel" = lotes liberados pra venda (não bloqueados, não fora-de-venda)
 *
 * Meta: ≥ 5% acumulado.
 */
import { PROJETO } from "@/lib/constants/projeto";
import { corMeta, type Severidade } from "@/lib/utils/cores";

export interface VsoInput {
  vendidos: number;
  disponivel: number;
}

export interface VsoResultado {
  /** Percentual decimal (0.282 = 28.2%). */
  valor: number;
  /** Meta (0.05 = 5%). */
  meta: number;
  /** Classificação visual semântica. */
  severidade: Severidade;
  /** Texto explicativo da fórmula pra tooltip. */
  formula: string;
}

export function calcularVso(input: VsoInput): VsoResultado {
  const denom = input.vendidos + input.disponivel;
  const valor = denom > 0 ? input.vendidos / denom : 0;

  return {
    valor,
    meta: PROJETO.VSO_META_PERCENT,
    severidade: corMeta(valor, PROJETO.VSO_META_PERCENT),
    formula: `VSO = vendidos / (vendidos + disponivel) = ${input.vendidos} / ${denom}`,
  };
}
