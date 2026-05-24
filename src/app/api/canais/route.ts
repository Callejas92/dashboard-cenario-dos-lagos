import { NextResponse } from "next/server";
import { getCustosOffline, type LancamentoOffline } from "@/lib/onedrive-custos";
import { getWhatsAppCost } from "@/lib/whatsapp-cost";
import { getGoogleAdsCost } from "@/lib/google-ads-cost";
import { getCrossSell } from "@/lib/cross-sell";
import { getVendas } from "@/lib/uau-vendas";
import { getBonusComoCustoMensal } from "@/lib/bonus";

const META_API = "https://graph.facebook.com/v21.0";
const CRM_API = "http://leadsc2s.eggs.com.br/api/webhook/leads";

export const maxDuration = 60;

let cachedData: { data: unknown; timestamp: number; key: string } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

// Maps CRM lead_source names to our canal names
const CRM_SOURCE_MAP: Record<string, string> = {
  // Meta Ads (Facebook + Instagram)
  "Meta Ads": "Meta Ads",
  "Facebook": "Meta Ads",
  "Facebook Ads": "Meta Ads",
  "Facebook Leads": "Meta Ads",
  "Instagram": "Meta Ads",
  "Instagram Ads": "Meta Ads",
  "Instagram Leads": "Meta Ads",
  // Google Ads
  "Google Ads": "Google Ads",
  "Google": "Google Ads",
  // Site
  "Site": "Site",
  "Website": "Site",
  "Site Form": "Site",
  // Outros canais
  "Outdoor": "Outdoor",
  "Radio": "Rádio",
  "Rádio": "Rádio",
  "Jornal": "Jornal",
  "Evento": "Evento",
  "Indicação": "Indicação",
  "Indicacao": "Indicação",
  "Corretor": "Contato Corretor",
  "Contato Corretor": "Contato Corretor",
  "WhatsApp": "WhatsApp",
  "Whatsapp": "WhatsApp",
  "WPP": "WhatsApp",
};

const ALL_CANAIS = ["Google Ads", "Meta Ads", "WhatsApp", "Outdoor", "Rádio", "Site", "Jornal", "Evento", "Outros", "Indicação", "Contato Corretor", "Comissão Corretor"];

interface CanalData {
  investimento: number;
  leads: number;
  leadsQualificados: number;
  vendas: number;
  valorVendas: number;
  source: "api" | "manual";
}

interface MetaAdsResult {
  spend: number;
  leads: number;
  reach: number;
  impressions: number;
  clicks: number;
  daily: { date: string; spend: number; leads: number }[];
}

async function fetchMetaAds(from: string, to: string): Promise<MetaAdsResult> {
  const token = process.env.META_ACCESS_TOKEN?.trim();
  const accountId = process.env.META_AD_ACCOUNT_ID?.trim();
  if (!token || !accountId) return { spend: 0, leads: 0, reach: 0, impressions: 0, clicks: 0, daily: [] };

  try {
    const fields = "spend,reach,impressions,clicks,actions";
    const timeRange = JSON.stringify({ since: from, until: to });
    const [totalRes, dailyRes] = await Promise.all([
      fetch(`${META_API}/act_${accountId}/insights?fields=${fields}&time_range=${timeRange}&level=account&access_token=${token}`, { signal: AbortSignal.timeout(10000) }),
      fetch(`${META_API}/act_${accountId}/insights?fields=spend,actions&time_range=${timeRange}&time_increment=1&limit=500&access_token=${token}`, { signal: AbortSignal.timeout(10000) }),
    ]);
    const [totalData, dailyData] = await Promise.all([totalRes.json(), dailyRes.json()]);

    const row = (totalData.data || [])[0] || {};
    const leads = (row.actions || []).find((a: { action_type: string }) =>
      a.action_type === "lead" || a.action_type === "onsite_conversion.lead_grouped"
    );

    const daily = (dailyData.data || []).map((d: { date_start?: string; spend?: string; actions?: { action_type: string; value: string }[] }) => {
      const dayLead = (d.actions || []).find((a) => a.action_type === "lead" || a.action_type === "onsite_conversion.lead_grouped");
      return {
        date: d.date_start || "",
        spend: parseFloat(d.spend || "0"),
        leads: dayLead ? parseInt(dayLead.value || "0") : 0,
      };
    });

    return {
      spend: parseFloat(row.spend || "0"),
      leads: leads ? parseInt(leads.value || "0") : 0,
      reach: parseInt(row.reach || "0"),
      impressions: parseInt(row.impressions || "0"),
      clicks: parseInt(row.clicks || "0"),
      daily,
    };
  } catch { return { spend: 0, leads: 0, reach: 0, impressions: 0, clicks: 0, daily: [] }; }
}

interface CRMLeadsResult {
  totals: Record<string, { leads: number; convertidos: number }>;
  daily: Record<string, Record<string, number>>; // date → canal → leads
}

async function fetchCRMLeads(from: string, to: string): Promise<CRMLeadsResult> {
  const key = process.env.CRM_API_KEY?.trim();
  if (!key) return { totals: {}, daily: {} };

  const totals: Record<string, { leads: number; convertidos: number }> = {};
  const daily: Record<string, Record<string, number>> = {};
  for (const canal of ALL_CANAIS) totals[canal] = { leads: 0, convertidos: 0 };
  totals["Outros"] = { leads: 0, convertidos: 0 };

  const pageSize = 200; // dobra page size = metade do total de páginas
  const fetchPage = async (offset: number) => {
    const res = await fetch(`${CRM_API}?offset=${offset}&pageSize=${pageSize}`, {
      headers: { "x-api-key": key },
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    return data.data || data.leads || (Array.isArray(data) ? data : []);
  };

  const processLeads = (leads: { attributes?: { created_at?: string; lead_source?: { name?: string }; done_details?: { done?: boolean } } }[]) => {
    for (const lead of leads) {
      const a = lead.attributes || {};
      const createdAt = (a.created_at || "").split("T")[0];
      if (from && createdAt < from) continue;
      if (to && createdAt > to) continue;

      const srcName = a.lead_source?.name || "";
      const canal = CRM_SOURCE_MAP[srcName] || "Outros";
      if (!totals[canal]) totals[canal] = { leads: 0, convertidos: 0 };
      totals[canal].leads++;
      if (a.done_details?.done) totals[canal].convertidos++;

      if (!daily[createdAt]) daily[createdAt] = {};
      daily[createdAt][canal] = (daily[createdAt][canal] || 0) + 1;
    }
  };

  try {
    // Paginação paralela em batches de 10 páginas (≈2000 leads por batch)
    // Para = quando algum batch retorna menos que o esperado (última página).
    const batchSize = 10;
    let batchStart = 0;
    while (true) {
      const offsets = Array.from({ length: batchSize }, (_, i) => (batchStart + i) * pageSize);
      const pages = await Promise.all(
        offsets.map((offset) => fetchPage(offset).catch(() => []))
      );

      let totalThisBatch = 0;
      for (const leads of pages) {
        processLeads(leads);
        totalThisBatch += leads.length;
      }

      // Se algum batch retornou < pageSize, terminamos (achamos a última página)
      const allFull = pages.every((p) => p.length === pageSize);
      if (!allFull || totalThisBatch === 0) break;

      batchStart += batchSize;
      if (batchStart > 100) break; // safety: 100 batches × 200 = 20k leads max
    }
  } catch { /* ignore */ }

  return { totals, daily };
}

// ── Custo WhatsApp via lib compartilhado (mesma lógica do /api/whatsapp) ──
async function fetchWhatsAppCost(from: string, to: string) {
  try {
    return await getWhatsAppCost(from, to);
  } catch (err) {
    console.error("fetchWhatsAppCost error:", err);
    return { custoBRL: 0, conversas: 0, mensagensRecebidas: 0, daily: {}, fonte: "none" as const };
  }
}

// ── Custo Google Ads via lib compartilhado (sem HTTP self-call) ──
async function fetchGoogleAdsCost(from: string, to: string) {
  try {
    return await getGoogleAdsCost(from, to);
  } catch (err) {
    console.error("fetchGoogleAdsCost error:", err);
    return { custoBRL: 0, conversoes: 0, clicks: 0, impressions: 0, campaignCount: 0 };
  }
}

async function fetchUAUVendas(from: string, to: string): Promise<{ qtdVendas: number; valorTotal: number; porDia: { data: string; quantidade: number; valorTotal: number }[] }> {
  try {
    // skipEnrich: /api/canais não precisa de Nome/CPF, só qtd+valor — economiza ~30s
    const data = await getVendas(from, to, { skipEnrich: true });
    return {
      qtdVendas: data.total || 0,
      valorTotal: data.valorTotal || 0,
      porDia: data.porDia || [],
    };
  } catch { return { qtdVendas: 0, valorTotal: 0, porDia: [] }; }
}

// ── Cruzamento Lead × Venda (atribui canal correto às vendas) ──
interface CrossSellPorCanal {
  vendas: number;
  receita: number;
}

async function fetchCrossSell(from: string, to: string) {
  try {
    const data = await getCrossSell(from, to);
    return {
      porCanal: data.porCanal,
      matches: data.matches,
      totalMatches: data.stats.totalMatches,
      taxaMatching: data.stats.taxaMatching,
    };
  } catch (err) {
    console.error("fetchCrossSell error:", err);
    return { porCanal: {}, matches: [], totalMatches: 0, taxaMatching: 0 };
  }
}

// ── Custos offline do OneDrive Excel (chamada direta ao lib, sem HTTP) ──
async function fetchCustosOffline(): Promise<LancamentoOffline[]> {
  try {
    const parsed = await getCustosOffline();
    return parsed.lancamentos;
  } catch (err) {
    console.error("Erro ao buscar custos offline:", err);
    return [];
  }
}

// Parse "Abr/26" → { year: 2026, month: 4 }
const MESES_MAP: Record<string, number> = {
  "jan": 1, "fev": 2, "mar": 3, "abr": 4, "mai": 5, "jun": 6,
  "jul": 7, "ago": 8, "set": 9, "out": 10, "nov": 11, "dez": 12,
};

function parseMes(mes: string): { year: number; month: number } | null {
  const parts = mes.split("/");
  if (parts.length !== 2) return null;
  const m = MESES_MAP[parts[0].toLowerCase()];
  if (!m) return null;
  const y = parseInt(parts[1]);
  return { year: y < 100 ? 2000 + y : y, month: m };
}

// Calcula custos offline por canal para o período [from, to].
// Cada lançamento da aba GASTOS é processado por UMA das regras (sem duplicação):
// 1. Inicio Veic + Fim Veic preenchidos → pro-rata por dias de veiculação
// 2. Só Data Pgto preenchida → valor inteiro se data cai no período
// 3. Nenhuma data, só coluna Mes → mês cheio (se filtro intersecta o mês)
function calcOfflineForRange(lancamentos: LancamentoOffline[], from: string, to: string): Record<string, number> {
  const result: Record<string, number> = {};

  for (const lanc of lancamentos) {
    let valor = 0;

    if (lanc.inicio_veic && lanc.fim_veic) {
      // Regra 1: Pro-rata por veiculação
      if (to < lanc.inicio_veic || from > lanc.fim_veic) continue;
      const overlapStart = from > lanc.inicio_veic ? from : lanc.inicio_veic;
      const overlapEnd = to < lanc.fim_veic ? to : lanc.fim_veic;
      const overlapDays = Math.floor((new Date(overlapEnd).getTime() - new Date(overlapStart).getTime()) / 86400000) + 1;
      const totalDays = Math.floor((new Date(lanc.fim_veic).getTime() - new Date(lanc.inicio_veic).getTime()) / 86400000) + 1;
      valor = lanc.valor * (overlapDays / totalDays);
    } else if (lanc.data_pgto) {
      // Regra 2: Data de pagamento exata
      if (lanc.data_pgto >= from && lanc.data_pgto <= to) {
        valor = lanc.valor;
      }
    } else if (lanc.mes) {
      // Regra 3: Mês cheio (sem datas específicas)
      const parsed = parseMes(lanc.mes);
      if (parsed) {
        const monthStart = `${parsed.year}-${String(parsed.month).padStart(2, "0")}-01`;
        const lastDay = new Date(parsed.year, parsed.month, 0).getDate();
        const monthEnd = `${parsed.year}-${String(parsed.month).padStart(2, "0")}-${lastDay}`;
        if (!(to < monthStart || from > monthEnd)) {
          valor = lanc.valor;
        }
      }
    }

    if (valor > 0) {
      result[lanc.canal] = (result[lanc.canal] || 0) + valor;
    }
  }

  return result;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const to = searchParams.get("to") || new Date().toISOString().split("T")[0];
  const from = searchParams.get("from") || (() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0];
  })();

  const cacheKey = `${from}|${to}`;
  if (cachedData && cachedData.key === cacheKey && Date.now() - cachedData.timestamp < CACHE_TTL) {
    return NextResponse.json(cachedData.data);
  }

  // Fetch all sources in parallel
  const [metaAds, crmLeads, uauVendas, custosOffline, whatsApp, crossSell, googleAds, bonusPagos] = await Promise.all([
    fetchMetaAds(from, to),
    fetchCRMLeads(from, to),
    fetchUAUVendas(from, to),
    fetchCustosOffline(),
    fetchWhatsAppCost(from, to),
    fetchCrossSell(from, to),
    fetchGoogleAdsCost(from, to),
    getBonusComoCustoMensal(from, to).catch(() => ({ totalPago: 0, detalhes: [] })),
  ]);

  // Calculate offline costs for the selected date range
  const offlinePorCanal = calcOfflineForRange(custosOffline, from, to);

  // Build canal data
  const canais: Record<string, CanalData> = {};
  for (const canal of ALL_CANAIS) {
    const crm = crmLeads.totals[canal] || { leads: 0, convertidos: 0 };
    const offline = offlinePorCanal[canal] || 0;

    let investimento = offline;
    let leads = crm.leads;

    if (canal === "Meta Ads") {
      investimento += metaAds.spend;
      leads = Math.max(metaAds.leads, crm.leads);
    } else if (canal === "WhatsApp") {
      // WhatsApp tem custo via API Meta. Leads vêm do CRM (lead_source = "WhatsApp")
      investimento += whatsApp.custoBRL;
    } else if (canal === "Google Ads") {
      // Google Ads tem custo via API. Leads vêm do CRM (lead_source = "Google Ads")
      investimento += googleAds.custoBRL;
    } else if (canal === "Comissão Corretor") {
      // Comissões/bônus pagos no período (vem do blob bonus-payments.json).
      // Aumenta o investimento total → impacta CAC global.
      investimento = bonusPagos.totalPago;
    }

    canais[canal] = {
      investimento,
      leads,
      leadsQualificados: 0,
      vendas: 0,
      valorVendas: 0,
      source: "api",
    };
  }

  // Atribuir vendas/receita por canal via cross-sell (CRM × ERP)
  // Cada venda foi matchada com lead → canal real conhecido
  // Vendas sem lead correspondente caem em "Contato Corretor" (carteira própria do corretor)
  for (const [canalNome, dados] of Object.entries(crossSell.porCanal)) {
    if (canais[canalNome]) {
      canais[canalNome].vendas = dados.vendas;
      canais[canalNome].valorVendas = dados.receita;
    }
  }

  // KPIs totais
  const totalInvestimento = Object.values(canais).reduce((s, c) => s + c.investimento, 0);
  const totalLeadsAll = Object.values(canais).reduce((s, c) => s + c.leads, 0);
  // Total de vendas vem do cross-sell (que combina contratos Eggs + UAU)
  // Fallback para UAU direto se cross-sell vazio
  const totalVendas = Object.values(canais).reduce((s, c) => s + c.vendas, 0) || uauVendas.qtdVendas;
  const totalValorVendas = Object.values(canais).reduce((s, c) => s + c.valorVendas, 0) || uauVendas.valorTotal;
  const cpl = totalLeadsAll > 0 ? totalInvestimento / totalLeadsAll : 0;
  const cac = totalVendas > 0 ? totalInvestimento / totalVendas : 0;
  const roi = totalInvestimento > 0 ? totalValorVendas / totalInvestimento : 0;

  // Meta Ads extras
  const metaExtras = {
    reach: metaAds.reach,
    impressions: metaAds.impressions,
    clicks: metaAds.clicks,
    ctr: metaAds.impressions > 0 ? (metaAds.clicks / metaAds.impressions) * 100 : 0,
    cpc: metaAds.clicks > 0 ? metaAds.spend / metaAds.clicks : 0,
  };

  // ── Build daily breakdown per canal ──
  // Estrutura: array de { date, canal, investimento, leads, vendas, valorVendas }
  // Canais offline NÃO aparecem aqui (só têm dados mensais/agregados)
  const dailyEntries: { date: string; canal: string; investimento: number; leads: number; vendas: number; valorVendas: number }[] = [];

  // Meta Ads daily (já tem date, spend, leads)
  for (const d of metaAds.daily) {
    if (d.date < from || d.date > to) continue;
    dailyEntries.push({
      date: d.date,
      canal: "Meta Ads",
      investimento: d.spend,
      leads: d.leads,
      vendas: 0,
      valorVendas: 0,
    });
  }

  // WhatsApp daily (custo por dia)
  for (const [date, custo] of Object.entries(whatsApp.daily)) {
    if (date < from || date > to) continue;
    dailyEntries.push({
      date,
      canal: "WhatsApp",
      investimento: custo,
      leads: 0,
      vendas: 0,
      valorVendas: 0,
    });
  }

  // CRM leads daily (por canal por dia)
  for (const [date, canalMap] of Object.entries(crmLeads.daily)) {
    for (const [canal, leadsCount] of Object.entries(canalMap)) {
      if (date < from || date > to) continue;
      // Skip Meta Ads se já temos do Meta API (evita dupla contagem)
      if (canal === "Meta Ads") {
        // Adiciona apenas se não tem entry de Meta Ads nesse dia
        const exists = dailyEntries.find((e) => e.date === date && e.canal === "Meta Ads");
        if (exists) {
          exists.leads = Math.max(exists.leads, leadsCount);
          continue;
        }
      }
      // Procura entry existente desse canal+dia
      const existing = dailyEntries.find((e) => e.date === date && e.canal === canal);
      if (existing) {
        existing.leads += leadsCount;
      } else {
        dailyEntries.push({
          date,
          canal,
          investimento: 0,
          leads: leadsCount,
          vendas: 0,
          valorVendas: 0,
        });
      }
    }
  }

  // Vendas/Receita daily por canal (do cross-sell)
  for (const m of crossSell.matches) {
    if (!m.venda.dataVenda) continue;
    const date = m.venda.dataVenda;
    if (date < from || date > to) continue;
    const canal = m.canal; // pode ser "Contato Corretor" se sem lead match (carteira própria)

    const existing = dailyEntries.find((e) => e.date === date && e.canal === canal);
    if (existing) {
      existing.vendas += 1;
      existing.valorVendas += m.venda.valorVenda;
    } else {
      dailyEntries.push({
        date,
        canal,
        investimento: 0,
        leads: 0,
        vendas: 1,
        valorVendas: m.venda.valorVenda,
      });
    }
  }

  dailyEntries.sort((a, b) => a.date.localeCompare(b.date) || a.canal.localeCompare(b.canal));

  const result = {
    dateFrom: from,
    dateTo: to,
    canais,
    kpis: {
      totalLeads: totalLeadsAll,
      totalInvestimento,
      totalVendas,
      totalValorVendas,
      cpl,
      cac,
      roi,
    },
    metaExtras,
    daily: metaAds.daily, // legacy: usado por outros componentes
    dailyByCanal: dailyEntries, // novo: para Wave 5 (Por Canal por Dia)
    canaisSemDadosDiarios: ["Outdoor", "Rádio", "Jornal", "Evento", "Outros", "Site", "Indicação", "Contato Corretor", "Google Ads"],
    crmTotal: {
      total: Object.values(crmLeads.totals).reduce((s, c) => s + c.leads, 0),
      convertidos: Object.values(crmLeads.totals).reduce((s, c) => s + c.convertidos, 0),
    },
    fetchedAt: new Date().toISOString(),
  };

  cachedData = { data: result, timestamp: Date.now(), key: cacheKey };
  return NextResponse.json(result);
}
