/**
 * Insight: % do budget de marketing consumido até agora.
 *
 * Compara contra o budget total (R$ 1,72M) ou o esperado pelo mês comercial.
 */
import { DollarSign } from "lucide-react";
import { PROJETO } from "@/lib/constants/projeto";
import { formatBRLCompact } from "@/lib/utils/formatters";
import type { Insight } from "./types";

export interface DadosBudget {
  realizadoAcumulado: number;     // total já gasto desde o lançamento
  mesesDecorridos: number;        // quantos meses comerciais já passaram
}

export function calcularBudgetConsumido(dados: DadosBudget): Insight | null {
  if (dados.realizadoAcumulado <= 0) return null;

  const pctConsumido = dados.realizadoAcumulado / PROJETO.BUDGET_MKT_TOTAL;
  const pctEsperado = dados.mesesDecorridos / PROJETO.PRAZO_COMERCIALIZACAO_MESES;

  // Severidade: se consumiu MAIS rápido que o esperado, atenção.
  let severidade: "verde" | "amarelo" | "vermelho" | "cinza" = "cinza";
  let comparacao = "";
  if (pctEsperado > 0) {
    const diff = pctConsumido - pctEsperado;
    if (diff > 0.1) {
      severidade = "amarelo";
      comparacao = ` (${(diff * 100).toFixed(0)}pp acima do ritmo planejado).`;
    } else if (diff < -0.1) {
      severidade = "verde";
      comparacao = ` (${(Math.abs(diff) * 100).toFixed(0)}pp abaixo do ritmo planejado).`;
    } else {
      comparacao = " (no ritmo planejado).";
    }
  }

  return {
    id: "budget-consumido",
    titulo: "Budget de marketing",
    texto: `${formatBRLCompact(dados.realizadoAcumulado)} de ${formatBRLCompact(PROJETO.BUDGET_MKT_TOTAL)} = ${(pctConsumido * 100).toFixed(0)}% consumido${comparacao}`,
    severidade,
    icon: DollarSign,
    prioridade: 60,
  };
}
