/**
 * Eventos de marketing/comercial pra anotar na "Curva de vendas no tempo".
 *
 * São linhas VERTICAIS no gráfico — servem pra ver se a curva de vendas ACELERA
 * depois de uma data (outdoor novo, evento na área, ação em imobiliária etc).
 *
 * ⚠️ NÃO existe API que saiba dessas datas — é manutenção manual aqui.
 *    Felipe me passa { data, nome, tipo } e eu adiciono na lista.
 *
 * ⚠️ Contrato é indicador ATRASADO: a pessoa vê o outdoor / vai ao evento e só
 *    assina dias/semanas depois. Então o efeito aparece deslocado no tempo.
 */
import { PROJETO } from "@/lib/constants/projeto";

export type TipoEvento = "marco" | "midia" | "evento" | "imobiliaria" | "outro";

export interface EventoMarketing {
  data: string; // ISO yyyy-mm-dd
  nome: string; // rótulo curto exibido no gráfico
  tipo?: TipoEvento;
}

/** Cor por tipo (linha vertical + rótulo). */
export const COR_TIPO_EVENTO: Record<TipoEvento, string> = {
  marco: "#64748b", // marco do projeto (cinza)
  midia: "#8b5cf6", // mídia paga / outdoor (violeta)
  evento: "#ec4899", // evento presencial (rosa)
  imobiliaria: "#06b6d4", // ação em imobiliária (ciano)
  outro: "#64748b",
};

export const EVENTOS_MARKETING: EventoMarketing[] = [
  { data: PROJETO.DATA_LANCAMENTO, nome: "Lançamento", tipo: "marco" },

  // 👇 Felipe: adicione aqui (exemplos comentados — troque pelas datas reais):
  // { data: "2026-05-10", nome: "Outdoor Av. Brasil", tipo: "midia" },
  // { data: "2026-05-22", nome: "Evento na área",      tipo: "evento" },
  // { data: "2026-05-28", nome: "Ação Imobiliária X",  tipo: "imobiliaria" },
];
