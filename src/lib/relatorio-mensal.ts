/**
 * Motor do RELATÓRIO MENSAL COMERCIAL (mês comercial 15 → 14).
 *
 * Princípio: NÃO recalcula regra nenhuma — agrega o que já existe (Eggs Contratos +
 * VGV/VSO já auditados), filtrado pelo mês comercial via dataNoMesComercial(dataContrato).
 * Assim, a data que o time põe no Eggs (data_contrato = assinatura do comprador) é
 * exatamente o que cai em cada mês.
 *
 * Fonte: CRM Eggs (rápido, autoridade de "quando a venda aconteceu"). O bloco
 * financeiro/inadimplência é "estado atual" e é montado na página (o ERP UAU não
 * data pagamentos — só dá recebido acumulado + parcelas em aberto).
 */
import { getContratosEggs, type ContratoEnriquecido } from "@/lib/eggs-contratos";
import { calcularVgv } from "@/lib/calculations/vgv";
import { calcularVso } from "@/lib/calculations/vso";
import { isVenda, PROJETO } from "@/lib/constants/projeto";
import { corMeta, type Severidade } from "@/lib/utils/cores";
import {
  getMesComercial,
  getMesComercialAnterior,
  dataNoMesComercial,
  type MesComercial,
} from "@/lib/utils/mesComercial";

export interface RankingItem {
  nome: string;
  lotes: number;
  vgv: number;
  ticket: number;
}

export interface RelatorioMensal {
  /** Chave do mês comercial = ano-mês do dia 15 de início. Ex.: "2026-05" (15/05–14/06). */
  mesISO: string;
  periodo: { inicioISO: string; fimISO: string; label: string; labelCurto: string };
  /** true quando lido de um snapshot congelado (mês já fechado). */
  congelado: boolean;
  geradoEm: string;

  vendasMes: {
    lotes: number;
    vgv: number;
    ticket: number;
    meta: number;
    pctMeta: number;
    severidade: Severidade;
    anteriorLotes: number;
    anteriorVgv: number;
    deltaLotes: number;
    deltaVgv: number;
  };

  acumulado: {
    lotes: number;
    vgv: number;
    vgvTotal: number;
    pctVendido: number;
    vso: number;
    vsoEsperado: number;
    vsoSeveridade: Severidade;
    /** lotes/mês desde o lançamento até o fim do mês. */
    ritmoMedioLotesMes: number;
    /** meses (no ritmo médio) pra vender o estoque restante. null se nada vendido. */
    mesesParaTermino: number | null;
    /** ISO estimado de término (fim do mês + mesesParaTermino). null se indefinido. */
    projecaoTerminoISO: string | null;
    lotesRestantes: number;
  };

  rankingCorretores: RankingItem[];
  rankingImobiliarias: RankingItem[];
}

const DIA_MS = 86_400_000;

/** Meses decorridos (base 30 dias) entre o lançamento e uma data — mesma régua do Panorama. */
function mesesDesdeLancamento(fimISO: string): number {
  const lanc = new Date(PROJETO.DATA_LANCAMENTO + "T00:00:00").getTime();
  const fim = new Date(fimISO + "T23:59:59").getTime();
  return Math.max(0.1, (fim - lanc) / (30 * DIA_MS));
}

function contratoValido(c: ContratoEnriquecido): boolean {
  return !c.cancelado && isVenda(c.status) && !!c.dataContrato;
}

function ranking(contratos: ContratoEnriquecido[], chave: (c: ContratoEnriquecido) => string): RankingItem[] {
  const map = new Map<string, { lotes: number; vgv: number }>();
  for (const c of contratos) {
    const nome = (chave(c) || "").trim() || "(sem identificação)";
    const cur = map.get(nome) || { lotes: 0, vgv: 0 };
    cur.lotes += 1;
    cur.vgv += c.valor || 0;
    map.set(nome, cur);
  }
  return Array.from(map, ([nome, v]) => ({
    nome,
    lotes: v.lotes,
    vgv: v.vgv,
    ticket: v.lotes > 0 ? v.vgv / v.lotes : 0,
  })).sort((a, b) => b.vgv - a.vgv);
}

/**
 * Monta o relatório de um mês comercial a partir da lista de contratos (já filtrada
 * de investidor no servidor). Função PURA — sem fetch, fácil de testar/congelar.
 */
export function montarRelatorio(
  contratos: ContratoEnriquecido[],
  mes: MesComercial,
  opts?: { foraDeVenda?: number; congelado?: boolean; geradoEm?: string },
): RelatorioMensal {
  const foraDeVenda = opts?.foraDeVenda ?? 0;
  const anterior = getMesComercialAnterior(mes.inicio);

  // ── Vendas DENTRO do mês comercial (pela data_contrato) ──
  const vendasMes = contratos.filter((c) => contratoValido(c) && dataNoMesComercial(c.dataContrato!, mes));
  const vendasAnt = contratos.filter((c) => contratoValido(c) && dataNoMesComercial(c.dataContrato!, anterior));
  const lotesMes = vendasMes.length;
  const vgvMes = vendasMes.reduce((s, c) => s + (c.valor || 0), 0);
  const lotesAnt = vendasAnt.length;
  const vgvAnt = vendasAnt.reduce((s, c) => s + (c.valor || 0), 0);

  // ── Acumulado ATÉ o fim do mês comercial (estado do projeto no fechamento) ──
  const acumContratos = contratos.filter((c) => contratoValido(c) && c.dataContrato! <= mes.fimISO);
  const vgvAcum = calcularVgv({
    contratos: acumContratos.map((c) => ({ loteId: c.loteId, valorContratado: c.valor, status: c.status, cancelado: c.cancelado })),
  });
  const mesesDecorridos = mesesDesdeLancamento(mes.fimISO);
  const vso = calcularVso({ vendidos: vgvAcum.lotesVendidos, foraDeVenda, mesesDecorridos });

  const ritmoMedio = vgvAcum.lotesVendidos / mesesDecorridos;
  const lotesRestantes = Math.max(0, PROJETO.LOTES_VENDAVEIS - vgvAcum.lotesVendidos);
  const mesesParaTermino = ritmoMedio > 0 ? lotesRestantes / ritmoMedio : null;
  let projecaoTerminoISO: string | null = null;
  if (mesesParaTermino !== null && Number.isFinite(mesesParaTermino)) {
    const t = new Date(mes.fim.getTime() + mesesParaTermino * 30 * DIA_MS);
    projecaoTerminoISO = t.toISOString().split("T")[0];
  }

  return {
    mesISO: `${mes.inicio.getFullYear()}-${String(mes.inicio.getMonth() + 1).padStart(2, "0")}`,
    periodo: { inicioISO: mes.inicioISO, fimISO: mes.fimISO, label: mes.label, labelCurto: mes.labelCurto },
    congelado: opts?.congelado ?? false,
    geradoEm: opts?.geradoEm ?? new Date().toISOString(),

    vendasMes: {
      lotes: lotesMes,
      vgv: vgvMes,
      ticket: lotesMes > 0 ? vgvMes / lotesMes : 0,
      meta: PROJETO.VELOCIDADE_ALVO_LOTES_MES,
      pctMeta: PROJETO.VELOCIDADE_ALVO_LOTES_MES > 0 ? lotesMes / PROJETO.VELOCIDADE_ALVO_LOTES_MES : 0,
      severidade: corMeta(lotesMes, PROJETO.VELOCIDADE_ALVO_LOTES_MES),
      anteriorLotes: lotesAnt,
      anteriorVgv: vgvAnt,
      deltaLotes: lotesMes - lotesAnt,
      deltaVgv: vgvMes - vgvAnt,
    },

    acumulado: {
      lotes: vgvAcum.lotesVendidos,
      vgv: vgvAcum.vgvVendido,
      vgvTotal: vgvAcum.vgvTotal,
      pctVendido: vgvAcum.pctVendido,
      vso: vso.valor,
      vsoEsperado: vso.esperadoHoje,
      vsoSeveridade: vso.severidade,
      ritmoMedioLotesMes: ritmoMedio,
      mesesParaTermino,
      projecaoTerminoISO,
      lotesRestantes,
    },

    rankingCorretores: ranking(vendasMes, (c) => c.corretor?.nome || ""),
    rankingImobiliarias: ranking(vendasMes, (c) => c.imobiliaria?.razaoSocial || c.imobiliaria?.nomeFantasia || ""),
  };
}

/** Resolve o MesComercial a partir de uma chave "YYYY-MM" (= mês do dia 15 de início). */
export function mesComercialDaChave(mesISO?: string): MesComercial {
  if (!mesISO || !/^\d{4}-\d{2}$/.test(mesISO)) {
    // sem chave → mês comercial que JÁ FECHOU (o "oficial" no dia 15)
    return getMesComercialAnterior();
  }
  const [ano, mes] = mesISO.split("-").map(Number);
  // dia 15 daquele mês cai dentro do mês comercial que começa nele
  return getMesComercial(new Date(ano, mes - 1, PROJETO.DIA_INICIO_MES_COMERCIAL, 12, 0, 0));
}

/** Gera o relatório de um mês comercial (busca Eggs). Não congela — quem congela é a camada de snapshot. */
export async function gerarRelatorioMensal(mesISO?: string, foraDeVenda?: number): Promise<RelatorioMensal> {
  const mes = mesComercialDaChave(mesISO);
  const contratos = await getContratosEggs();
  return montarRelatorio(contratos, mes, { foraDeVenda });
}
