/**
 * Mês do dashboard Cenário dos Lagos: mês de CALENDÁRIO (dia 1 ao último dia do mês).
 *
 * Exemplo:
 *  - hoje = 2026-05-20 → mês: 2026-05-01 a 2026-05-31
 *  - hoje = 2026-05-10 → mês: 2026-05-01 a 2026-05-31
 *
 * HISTÓRICO: até jun/2026 o dashboard usava "mês comercial" (15 → 14 do mês seguinte).
 * A pedido do Felipe, migrou pro mês civil. Os NOMES das funções foram mantidos
 * (getMesComercial, dataNoMesComercial, etc.) só pra não quebrar os ~17 consumidores —
 * o que mudou foi a LÓGICA (agora calendário) e os labels (sem "comercial").
 *
 * IMPORTANTE: este é o DEFAULT temporal de toda métrica mensal do dashboard V2.
 */

export interface MesComercial {
  /** Início do mês (00:00:00 do dia 1). */
  inicio: Date;
  /** Fim do mês (23:59:59 do último dia). */
  fim: Date;
  /** ISO yyyy-mm-dd do início — útil pra queries de API. */
  inicioISO: string;
  /** ISO yyyy-mm-dd do fim. */
  fimISO: string;
  /** Label legível: "01/05/2026 – 31/05/2026". */
  label: string;
  /** Label curto: "Mai/26". */
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
 * Retorna o mês de calendário que CONTÉM a data informada.
 * Default: hoje.
 */
export function getMesComercial(refDate?: Date): MesComercial {
  const ref = refDate ?? new Date();
  const mes = ref.getMonth();
  const ano = ref.getFullYear();

  // Mês civil: dia 1 ao último dia (dia 0 do mês seguinte = último dia deste mês).
  const inicio = new Date(ano, mes, 1, 0, 0, 0, 0);
  const fim = new Date(ano, mes + 1, 0, 23, 59, 59, 999);

  return {
    inicio,
    fim,
    inicioISO: toISO(inicio),
    fimISO: toISO(fim),
    label: `${formatBR(inicio)} – ${formatBR(fim)}`,
    labelCurto: `${MESES_BR[inicio.getMonth()]}/${String(inicio.getFullYear()).slice(-2)}`,
  };
}

/** Atalho: mês atual (= mês de calendário contendo hoje). */
export function getMesComercialAtual(): MesComercial {
  return getMesComercial();
}

/** Mês ANTERIOR ao informado (ou ao atual). */
export function getMesComercialAnterior(refDate?: Date): MesComercial {
  const atual = getMesComercial(refDate);
  // 1 dia antes do dia 1 → cai no último dia do mês anterior
  const umDiaAntes = new Date(atual.inicio);
  umDiaAntes.setDate(umDiaAntes.getDate() - 1);
  return getMesComercial(umDiaAntes);
}

/** PRÓXIMO mês ao informado. */
export function getProximoMesComercial(refDate?: Date): MesComercial {
  const atual = getMesComercial(refDate);
  // 1 dia depois do último dia → cai no dia 1 do mês seguinte
  const umDiaDepois = new Date(atual.fim);
  umDiaDepois.setDate(umDiaDepois.getDate() + 1);
  return getMesComercial(umDiaDepois);
}

/**
 * Lista os últimos N meses (incluindo o atual).
 * Útil pra gráficos e séries temporais.
 */
export function listarUltimosMesesComerciais(n: number): MesComercial[] {
  const result: MesComercial[] = [getMesComercialAtual()];
  for (let i = 1; i < n; i++) {
    result.unshift(getMesComercialAnterior(result[0].inicio));
  }
  return result;
}

/** Verifica se uma data (ISO yyyy-mm-dd ou Date) cai dentro do mês. */
export function dataNoMesComercial(data: string | Date, mes: MesComercial): boolean {
  const d = typeof data === "string" ? new Date(data + "T12:00:00") : data;
  return d >= mes.inicio && d <= mes.fim;
}
