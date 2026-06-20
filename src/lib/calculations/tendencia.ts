/**
 * Tendência (derivada) do ritmo de vendas — a leitura HONESTA que o selo "no prazo" esconde.
 *
 * O selo verde compara a MÉDIA desde o lançamento (que carrega o pico) com o necessário.
 * Aqui o que importa é o ritmo RECENTE e a DIREÇÃO: 24 → 16 → ... está acelerando ou caindo?
 *
 * Tudo derivável só dos contratos do Eggs (não depende do UAU/Blob). `ref` injetável
 * pra teste determinístico. Mesma conta do "necessário" do PrevisaoTermino (não diverge).
 */
import { PROJETO } from "@/lib/constants/projeto";

export interface VendaData { dataVenda: string; valor?: number }
export interface PontoRitmo { data: string; ritmo30d: number }

export type Direcao = "acelerando" | "estavel" | "desacelerando";
export type Veredito = "no_ritmo" | "caindo" | "abaixo";

export interface Tendencia {
  recente30d: number;        // lotes nos últimos 30d (≈ lotes/mês)
  anterior30d: number;       // lotes nos 30d ANTERIORES a esses (base da derivada)
  deltaPct: number;          // variação recente vs anterior (−1..+∞); 0 se sem base
  direcao: Direcao;
  necessario: number;        // lotes/mês p/ fechar no prazo (= PrevisaoTermino)
  mediaAcumulada: number;    // ritmo médio desde o lançamento (o número que o selo verde usa — "engana")
  restantes: number;
  mesesAteFimPrazo: number;
  serie: PontoRitmo[];       // ritmo móvel 30d, semanal — p/ o sparkline da curva
  veredito: Veredito;        // baseado no ritmo RECENTE + direção (não na média)
}

const UM_DIA = 86_400_000;
const diaISO = (ms: number) => new Date(ms).toISOString().split("T")[0];

export function calcularTendencia(vendas: VendaData[], ref: Date = new Date()): Tendencia {
  const datas = vendas.map((v) => v.dataVenda).filter(Boolean).sort();
  const totalVendido = datas.length;

  const hojeMs = new Date(diaISO(ref.getTime()) + "T12:00:00").getTime();
  const hoje = diaISO(hojeMs);
  const atras = (n: number) => diaISO(hojeMs - n * UM_DIA);
  const noIntervalo = (ini: string, fim: string, incluiIni: boolean) =>
    datas.filter((d) => (incluiIni ? d >= ini : d > ini) && d <= fim).length;

  // recente: [hoje−30, hoje] (mesma convenção do calcularVelocidade.ultimos30d → bate na tela)
  const recente30d = noIntervalo(atras(30), hoje, true);
  // anterior: (hoje−60, hoje−30) — sem sobrepor a borda do recente
  const anterior30d = datas.filter((d) => d > atras(60) && d < atras(30)).length;

  const deltaPct = anterior30d > 0 ? (recente30d - anterior30d) / anterior30d : 0;
  let direcao: Direcao = "estavel";
  // Só sinaliza tendência com base mínima (≥3 no período anterior) — evita ruído de número pequeno.
  if (anterior30d >= 3) {
    if (deltaPct <= -0.2) direcao = "desacelerando";
    else if (deltaPct >= 0.2) direcao = "acelerando";
  }

  const restantes = Math.max(0, PROJETO.LOTES_VENDAVEIS - totalVendido);
  const lancMs = new Date(PROJETO.DATA_LANCAMENTO + "T00:00:00").getTime();
  const mesesDecorridos = Math.max(0.1, (hojeMs - lancMs) / (30 * UM_DIA));
  const mesesAteFimPrazo = Math.max(0.1, PROJETO.PRAZO_COMERCIALIZACAO_MESES - mesesDecorridos);
  const necessario = restantes / mesesAteFimPrazo;
  const mediaAcumulada = totalVendido / mesesDecorridos;

  // Série semanal do ritmo móvel 30d (primeiro ponto com janela cheia: lançamento+30d).
  const serie: PontoRitmo[] = [];
  for (let t = lancMs + 30 * UM_DIA; t <= hojeMs; t += 7 * UM_DIA) {
    const fim = diaISO(t);
    const ini = diaISO(t - 30 * UM_DIA);
    serie.push({ data: fim, ritmo30d: datas.filter((d) => d > ini && d <= fim).length });
  }

  let veredito: Veredito = "no_ritmo";
  if (recente30d < necessario) veredito = "abaixo";
  else if (direcao === "desacelerando") veredito = "caindo";

  return {
    recente30d,
    anterior30d,
    deltaPct,
    direcao,
    necessario,
    mediaAcumulada,
    restantes,
    mesesAteFimPrazo,
    serie,
    veredito,
  };
}
