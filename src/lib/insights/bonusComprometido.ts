/**
 * Insight: % dos lotes vendidos cujo bônus já foi liberado/pago.
 *
 * Útil pra acompanhar o ritmo de pagamento de comissões.
 */
import { Award } from "lucide-react";
import { formatBRLCompact } from "@/lib/utils/formatters";
import type { Insight } from "./types";

export interface DadosBonus {
  qtdAPagar: number;        // vendas com entrada quitada, ainda não pago
  qtdPagoTotal: number;     // bônus já pagos
  aPagarAgora: number;      // R$ a pagar
  pagoTotal: number;        // R$ já pago
}

export function calcularBonusComprometido(dados: DadosBonus): Insight | null {
  if (dados.qtdAPagar === 0 && dados.qtdPagoTotal === 0) return null;

  if (dados.qtdAPagar > 0) {
    const severidade = dados.qtdAPagar >= 5 ? "amarelo" : "cinza";
    return {
      id: "bonus-a-pagar",
      titulo: "Bônus prontos pra pagar",
      texto: `${dados.qtdAPagar} corretor${dados.qtdAPagar > 1 ? "es" : ""} com bônus liberado (${formatBRLCompact(dados.aPagarAgora)}). Marque na aba Pipeline > Bônus quando pagar.`,
      severidade,
      icon: Award,
      prioridade: 70,
    };
  }

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
