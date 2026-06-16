/**
 * Insight: % dos lotes vendidos cujo bônus já foi liberado/pago.
 *
 * Útil pra acompanhar o ritmo de pagamento de comissões.
 */
import { Award } from "lucide-react";
import { formatBRLCompact } from "@/lib/utils/formatters";
import type { Insight } from "./types";

export interface DadosBonus {
  qtdAPagar: number;        // vendas que pagaram >= 1,5% do contrato, ainda não pago
  qtdPagoTotal: number;     // bônus já pagos
  aPagarAgora: number;      // R$ a pagar
  pagoTotal: number;        // R$ já pago
  completo: boolean;        // false = ERP UAU parcial → qtdAPagar pode estar SUBcontado
}

export function calcularBonusComprometido(dados: DadosBonus): Insight | null {
  if (dados.qtdAPagar === 0 && dados.qtdPagoTotal === 0) return null;

  if (dados.qtdAPagar > 0) {
    const severidade = dados.qtdAPagar >= 5 ? "amarelo" : "cinza";
    return {
      id: "bonus-a-pagar",
      titulo: "Bônus prontos pra pagar",
      texto: `${dados.qtdAPagar} corretor${dados.qtdAPagar > 1 ? "es" : ""} com bônus liberado (${formatBRLCompact(dados.aPagarAgora)}). Pague e anote "pago" no Excel — o painel lê sozinho.`,
      severidade,
      icon: Award,
      prioridade: 70,
    };
  }

  // qtdAPagar === 0: só afirma "nenhum pendente" com dado COMPLETO. Com ERP parcial,
  // qtdAPagar pode estar subcontado (autorizado não confirmado) → não dar positivo falso.
  if (!dados.completo) return null;

  if (dados.qtdPagoTotal > 0) {
    return {
      id: "bonus-pago",
      titulo: "Bônus em dia",
      texto: `Nenhum bônus pendente. Já pagamos ${formatBRLCompact(dados.pagoTotal)} a corretores e imobiliárias até agora.`,
      severidade: "verde",
      icon: Award,
      prioridade: 20,
    };
  }

  return null;
}
