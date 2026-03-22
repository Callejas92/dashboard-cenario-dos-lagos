export interface CanalData {
  investimento: number;
  leads: number;
  vendas: number;
  valorVendas: number;
  leadsQualificados: number;
  comparecimentos: number;
  slaRespostaMin: number;
}

export interface SemanaData {
  semana: number;
  inicio: string;
  fim: string;
  canais: Record<string, CanalData>;
}

export interface Metas {
  cpl: number;
  cac: number;
  roi: number;
  vso: number;
  tlq: number;
  tcs: number;
  slaResposta: number;
}

export interface VGV {
  totalUnidades: number;
  ticketMedio: number;
  vgvTotal: number;
}

export interface Config {
  empreendimento: string;
  inicio: string;
  fim: string;
  totalSemanas: number;
  canais: string[];
  metas: Metas;
  vgv: VGV;
}

export interface MetricsData {
  config: Config;
  semanas: SemanaData[];
}

export function emptyCanalData(): CanalData {
  return {
    investimento: 0,
    leads: 0,
    vendas: 0,
    valorVendas: 0,
    leadsQualificados: 0,
    comparecimentos: 0,
    slaRespostaMin: 0,
  };
}

export function calcKPIs(semanas: SemanaData[], metas: Metas, vgv: VGV) {
  let totalInvestimento = 0;
  let totalLeads = 0;
  let totalVendas = 0;
  let totalValorVendas = 0;
  let totalLeadsQualificados = 0;
  let totalComparecimentos = 0;
  let totalSla = 0;
  let slaCount = 0;

  for (const s of semanas) {
    for (const c of Object.values(s.canais)) {
      totalInvestimento += c.investimento;
      totalLeads += c.leads;
      totalVendas += c.vendas;
      totalValorVendas += c.valorVendas;
      totalLeadsQualificados += c.leadsQualificados;
      totalComparecimentos += c.comparecimentos;
      if (c.slaRespostaMin > 0) {
        totalSla += c.slaRespostaMin;
        slaCount++;
      }
    }
  }

  const cpl = totalLeads > 0 ? totalInvestimento / totalLeads : 0;
  const cac = totalVendas > 0 ? totalInvestimento / totalVendas : 0;
  const roi = totalInvestimento > 0 ? totalValorVendas / totalInvestimento : 0;
  const vso = vgv.totalUnidades > 0 ? (totalVendas / vgv.totalUnidades) * 100 : 0;
  const tlq = totalLeads > 0 ? (totalLeadsQualificados / totalLeads) * 100 : 0;
  const tcs = totalLeadsQualificados > 0 ? (totalComparecimentos / totalLeadsQualificados) * 100 : 0;
  const slaMedia = slaCount > 0 ? totalSla / slaCount : 0;

  return {
    totalInvestimento,
    totalLeads,
    totalVendas,
    totalValorVendas,
    cpl,
    cac,
    roi,
    vso,
    tlq,
    tcs,
    slaMedia,
    metaCpl: metas.cpl,
    metaCac: metas.cac,
    metaRoi: metas.roi,
    metaVso: metas.vso,
    metaTlq: metas.tlq,
    metaTcs: metas.tcs,
    metaSla: metas.slaResposta,
  };
}

export function calcKPIsPorCanal(semanas: SemanaData[], canal: string) {
  let investimento = 0;
  let leads = 0;
  let vendas = 0;
  let valorVendas = 0;

  for (const s of semanas) {
    const c = s.canais[canal];
    if (c) {
      investimento += c.investimento;
      leads += c.leads;
      vendas += c.vendas;
      valorVendas += c.valorVendas;
    }
  }

  return {
    investimento,
    leads,
    vendas,
    valorVendas,
    cpl: leads > 0 ? investimento / leads : 0,
    cac: vendas > 0 ? investimento / vendas : 0,
    roi: investimento > 0 ? valorVendas / investimento : 0,
  };
}

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatPercent(value: number): string {
  return value.toFixed(1) + "%";
}

export function formatNumber(value: number): string {
  return value.toLocaleString("pt-BR");
}
