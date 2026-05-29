/**
 * Mês comercial Cenário dos Lagos: vai do dia 15 ao dia 14 do mês seguinte.
 *
 * Exemplo:
 *  - hoje = 2026-05-20 → mês comercial: 2026-05-15 a 2026-06-14
 *  - hoje = 2026-05-10 → mês comercial: 2026-04-15 a 2026-05-14
 *
 * IMPORTANTE: este é o DEFAULT temporal de toda métrica do dashboard V2.
 * Quem precisar mês civil deve pedir explicitamente.
 */
import { PROJETO } from "@/lib/constants/projeto";

export interface MesComercial {
  /** Início do mês comercial (00:00:00 do dia 15). */
  inicio: Date;
  /** Fim do mês comercial (23:59:59 do dia 14). */
  fim: Date;
  /** ISO yyyy-mm-dd do início — útil pra queries de API. */
  inicioISO: string;
  /** ISO yyyy-mm-dd do fim. */
  fimISO: string;
  /** Label legível: "15/05/2026 – 14/06/2026". */
  label: string;
  /** Label curto: "Mai/26 (comercial)". */
  labelCurto: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatBR(d: Date): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const MESES_BR = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

/**
 * Retorna o mês comercial que CONTÉM a data informada.
 * Default: hoje.
 */
export function getMesComercial(refDate?: Date): MesComercial {
  const ref = refDate ?? new Date();
  const dia = ref.getDate();
  const mes = ref.getMonth();
  const ano = ref.getFullYear();

  // Se dia >= 15, mês comercial atual começou no dia 15 deste mês.
  // Se dia < 15, começou no dia 15 do mês anterior.
  const inicio = dia >= PROJETO.DIA_INICIO_MES_COMERCIAL
    ? new Date(ano, mes, PROJETO.DIA_INICIO_MES_COMERCIAL, 0, 0, 0, 0)
    : new Date(ano, mes - 1, PROJETO.DIA_INICIO_MES_COMERCIAL, 0, 0, 0, 0);

  // Fim = dia 14 do mês seguinte ao início, 23:59:59.
  const fim = new Date(inicio);
  fim.setMonth(fim.getMonth() + 1);
  fim.setDate(PROJETO.DIA_INICIO_MES_COMERCIAL - 1);
  fim.setHours(23, 59, 59, 999);

  return {
    inicio,
    fim,
    inicioISO: toISO(inicio),
    fimISO: toISO(fim),
    label: `${formatBR(inicio)} – ${formatBR(fim)}`,
    labelCurto: `${MESES_BR[inicio.getMonth()]}/${String(inicio.getFullYear()).slice(-2)} (comercial)`,
  };
}

/** Atalho: mês comercial atual (= mês comercial contendo hoje). */
export function getMesComercialAtual(): MesComercial {
  return getMesComercial();
}

/** Mês comercial ANTERIOR ao informado (ou ao atual). */
export function getMesComercialAnterior(refDate?: Date): MesComercial {
  const atual = getMesComercial(refDate);
  // 1 dia antes do início → cai dentro do mês comercial anterior
  const umDiaAntes = new Date(atual.inicio);
  umDiaAntes.setDate(umDiaAntes.getDate() - 1);
  return getMesComercial(umDiaAntes);
}

/** Mês comercial PRÓXIMO ao informado. */
export function getProximoMesComercial(refDate?: Date): MesComercial {
  const atual = getMesComercial(refDate);
  // 1 dia depois do fim → cai dentro do próximo mês comercial
  const umDiaDepois = new Date(atual.fim);
  umDiaDepois.setDate(umDiaDepois.getDate() + 1);
  return getMesComercial(umDiaDepois);
}

/**
 * Lista os últimos N meses comerciais (incluindo o atual).
 * Útil pra gráficos e séries temporais.
 */
export function listarUltimosMesesComerciais(n: number): MesComercial[] {
  const result: MesComercial[] = [getMesComercialAtual()];
  for (let i = 1; i < n; i++) {
    result.unshift(getMesComercialAnterior(result[0].inicio));
  }
  return result;
}

/** Verifica se uma data (ISO yyyy-mm-dd ou Date) cai dentro do mês comercial. */
export function dataNoMesComercial(data: string | Date, mes: MesComercial): boolean {
  const d = typeof data === "string" ? new Date(data + "T12:00:00") : data;
  return d >= mes.inicio && d <= mes.fim;
}
