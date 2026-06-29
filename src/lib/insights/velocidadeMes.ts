/**
 * Insight: ritmo de venda do mês (calendário) vs alvo.
 *
 * Comenta se está acima/abaixo/no ritmo da velocidade alvo (11.6 lotes/mês).
 */
import { TrendingUp } from "lucide-react";
import { PROJETO } from "@/lib/constants/projeto";
import type { Insight } from "./types";

export interface DadosVelocidade {
  vendasMesComercial: number;
  diasDecorridosNoMesComercial: number;
}

export function calcularVelocidadeMes(dados: DadosVelocidade): Insight | null {
  if (dados.diasDecorridosNoMesComercial <= 0) return null;

  // Ritmo extrapolado pro mês inteiro (30 dias)
  const ritmoMensal = (dados.vendasMesComercial / dados.diasDecorridosNoMesComercial) * 30;
  const diff = ritmoMensal - PROJETO.VELOCIDADE_ALVO_LOTES_MES;

  let severidade: "verde" | "amarelo" | "vermelho" | "cinza";
  let comentario: string;

  if (diff >= 2) {
    severidade = "verde";
    comentario = `Acima do alvo (${PROJETO.VELOCIDADE_ALVO_LOTES_MES.toFixed(1)} lotes/mês). Ritmo atual extrapolaria pra ${ritmoMensal.toFixed(1)}/mês.`;
  } else if (diff <= -2) {
    severidade = "amarelo";
    comentario = `Abaixo do alvo. No ritmo atual fecharíamos ${ritmoMensal.toFixed(1)} lotes (alvo ${PROJETO.VELOCIDADE_ALVO_LOTES_MES.toFixed(1)}).`;
  } else {
    severidade = "cinza";
    comentario = `No ritmo planejado (~${PROJETO.VELOCIDADE_ALVO_LOTES_MES.toFixed(1)} lotes/mês).`;
  }

  return {
    id: "velocidade-mes",
    titulo: "Velocidade do mês",
    texto: `${dados.vendasMesComercial} venda${dados.vendasMesComercial === 1 ? "" : "s"} em ${dados.diasDecorridosNoMesComercial} dia${dados.diasDecorridosNoMesComercial === 1 ? "" : "s"}. ${comentario}`,
    severidade,
    icon: TrendingUp,
    prioridade: 80,
  };
}
