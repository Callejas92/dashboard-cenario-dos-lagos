/**
 * Ritmo & Previsão — a leitura HONESTA do "vai fechar no prazo?".
 *
 * Junta o que o "Previsão de Término" fazia em texto (ritmo recente, necessário, data
 * prevista) com a DERIVADA (recente vs 30d anteriores) e uma série de PREVISÃO (burn-up):
 * realizado + previsão no ritmo recente + plano até o prazo. O veredito usa o ritmo
 * RECENTE, não a média (que carrega o pico do lançamento e fica verde fácil).
 *
 * Tudo derivável só dos contratos do Eggs (não depende do UAU/Blob). `ref` injetável p/ teste.
 */
import { PROJETO } from "@/lib/constants/projeto";

export interface VendaData { dataVenda: string; valor?: number }
export interface PontoPrevisao { t: number; real: number | null; previsto: number | null; plano: number | null }

export type Direcao = "acelerando" | "estavel" | "desacelerando";
export type Veredito = "no_ritmo" | "caindo" | "abaixo";

export interface Tendencia {
  recente30d: number;        // lotes nos últimos 30d (≈ lotes/mês)
  anterior30d: number;       // lotes nos 30d ANTERIORES (base da derivada)
  deltaPct: number;
  direcao: Direcao;
  necessario: number;        // lotes/mês p/ fechar no prazo
  mediaAcumulada: number;    // ritmo médio desde o lançamento (o número "que engana")
  restantes: number;
  vendidos: number;
  lotesVendaveis: number;
  veredito: Veredito;
  // Previsão (burn-up)
  serie: PontoPrevisao[];    // {t(ms), real, previsto, plano} — p/ o gráfico
  hojeMs: number;
  prazoMs: number;           // fim do prazo planejado (lançamento + PRAZO meses)
  esgotamentoMs: number | null;  // quando a previsão atinge 174 (null = ritmo ~0)
  esgotamentoLabel: string;      // ex.: "nov/26"
  dentroPrazo: boolean;          // esgotamento <= prazo
}

const UM_DIA = 86_400_000;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const diaISO = (ms: number) => new Date(ms).toISOString().split("T")[0];
const mesAno = (ms: number) => { const d = new Date(ms); return `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`; };

export function calcularTendencia(vendas: VendaData[], ref: Date = new Date()): Tendencia {
  const datas = vendas.map((v) => v.dataVenda).filter(Boolean).sort();
  const vendidos = datas.length;
  const LOTES = PROJETO.LOTES_VENDAVEIS;

  const hojeMs = new Date(diaISO(ref.getTime()) + "T12:00:00").getTime();
  const hoje = diaISO(hojeMs);
  const atras = (n: number) => diaISO(hojeMs - n * UM_DIA);
  const cumAt = (ms: number) => { const lim = diaISO(ms); return datas.filter((d) => d <= lim).length; };

  // ── Derivada: ritmo recente vs os 30 dias anteriores ──
  const recente30d = datas.filter((d) => d >= atras(30) && d <= hoje).length;
  const anterior30d = datas.filter((d) => d > atras(60) && d < atras(30)).length;
  const deltaPct = anterior30d > 0 ? (recente30d - anterior30d) / anterior30d : 0;
  let direcao: Direcao = "estavel";
  if (anterior30d >= 3) {
    if (deltaPct <= -0.2) direcao = "desacelerando";
    else if (deltaPct >= 0.2) direcao = "acelerando";
  }

  // ── Prazo / necessário / média ──
  const lancMs = new Date(PROJETO.DATA_LANCAMENTO + "T00:00:00").getTime();
  const prazoDate = new Date(lancMs);
  prazoDate.setMonth(prazoDate.getMonth() + PROJETO.PRAZO_COMERCIALIZACAO_MESES);
  const prazoMs = prazoDate.getTime();
  const restantes = Math.max(0, LOTES - vendidos);
  const mesesDecorridos = Math.max(0.1, (hojeMs - lancMs) / (30 * UM_DIA));
  const mesesAteFimPrazo = Math.max(0.1, (prazoMs - hojeMs) / (30 * UM_DIA));
  const necessario = restantes / mesesAteFimPrazo;
  const mediaAcumulada = vendidos / mesesDecorridos;

  // ── Previsão no ritmo recente ──
  const pacePorDia = recente30d / 30; // lotes/dia (ritmo recente)
  const esgotamentoMs = pacePorDia > 0 && restantes > 0 ? hojeMs + (restantes / pacePorDia) * UM_DIA : (restantes === 0 ? hojeMs : null);
  const TETO_MS = prazoMs + 24 * 30 * UM_DIA; // não deixa a série explodir se o ritmo for ~0
  const endMs = Math.min(TETO_MS, Math.max(prazoMs, esgotamentoMs ?? prazoMs));

  const ptsSet = new Set<number>();
  for (let t = lancMs; t <= endMs; t += 7 * UM_DIA) ptsSet.add(t);
  ptsSet.add(hojeMs); ptsSet.add(prazoMs); ptsSet.add(endMs);
  if (esgotamentoMs && esgotamentoMs <= endMs) ptsSet.add(esgotamentoMs);
  const ts = Array.from(ptsSet).sort((a, b) => a - b);

  const r1 = (x: number) => Math.round(x * 10) / 10;
  const serie: PontoPrevisao[] = ts.map((t) => {
    const real = t <= hojeMs ? cumAt(t) : null;
    const previstoRaw = t >= hojeMs ? Math.min(LOTES, vendidos + pacePorDia * (t - hojeMs) / UM_DIA) : null;
    const plano = t <= prazoMs ? r1(LOTES * (t - lancMs) / (prazoMs - lancMs)) : null;
    return { t, real, previsto: previstoRaw != null ? r1(previstoRaw) : null, plano };
  });

  const dentroPrazo = esgotamentoMs != null && esgotamentoMs <= prazoMs;

  let veredito: Veredito = "no_ritmo";
  if (recente30d < necessario) veredito = "abaixo";
  else if (direcao === "desacelerando") veredito = "caindo";

  return {
    recente30d, anterior30d, deltaPct, direcao,
    necessario, mediaAcumulada, restantes, vendidos, lotesVendaveis: LOTES,
    veredito,
    serie, hojeMs, prazoMs,
    esgotamentoMs,
    esgotamentoLabel: esgotamentoMs ? mesAno(esgotamentoMs) : "—",
    dentroPrazo,
  };
}
