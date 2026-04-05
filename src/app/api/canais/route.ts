import { NextResponse } from "next/server";

const META_API = "https://graph.facebook.com/v21.0";
const CRM_API = "http://leadsc2s.eggs.com.br/api/webhook/leads";

let cachedData: { data: unknown; timestamp: number; key: string } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

// Maps CRM lead_source names to our canal names
const CRM_SOURCE_MAP: Record<string, string> = {
  "Meta Ads": "Meta Ads",
  "Facebook": "Meta Ads",
  "Instagram": "Meta Ads",
  "Facebook Ads": "Meta Ads",
  "Google Ads": "Google Ads",
  "Google": "Google Ads",
  "Site": "Site",
  "Website": "Site",
  "Outdoor": "Outdoor",
  "Radio": "Rádio",
  "Rádio": "Rádio",
  "Jornal": "Jornal",
  "Indicação": "Indicação",
  "Indicacao": "Indicação",
  "Corretor": "Contato Corretor",
  "Contato Corretor": "Contato Corretor",
};

const ALL_CANAIS = ["Google Ads", "Meta Ads", "Outdoor", "Rádio", "Site", "Jornal", "Outros", "Indicação", "Contato Corretor"];

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

async function fetchCRMLeads(from: string, to: string): Promise<Record<string, { leads: number; convertidos: number }>> {
  const key = process.env.CRM_API_KEY?.trim();
  if (!key) return {};

  const result: Record<string, { leads: number; convertidos: number }> = {};
  for (const canal of ALL_CANAIS) result[canal] = { leads: 0, convertidos: 0 };
  result["Outros"] = { leads: 0, convertidos: 0 };

  try {
    let offset = 0;
    const pageSize = 100;
    while (true) {
      const res = await fetch(`${CRM_API}?offset=${offset}&pageSize=${pageSize}`, {
        headers: { "x-api-key": key },
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json();
      const leads = data.data || data.leads || (Array.isArray(data) ? data : []);
      if (leads.length === 0) break;

      for (const lead of leads) {
        const a = lead.attributes || {};
        const createdAt = (a.created_at || "").split("T")[0];
        if (from && createdAt < from) continue;
        if (to && createdAt > to) continue;

        const srcName = a.lead_source?.name || "";
        const canal = CRM_SOURCE_MAP[srcName] || "Outros";
        if (!result[canal]) result[canal] = { leads: 0, convertidos: 0 };
        result[canal].leads++;
        if (a.done_details?.done) result[canal].convertidos++;
      }

      if (leads.length < pageSize) break;
      offset += pageSize;
    }
  } catch { /* ignore */ }

  return result;
}

async function fetchUAUVendas(from: string, to: string): Promise<{ qtdVendas: number; valorTotal: number }> {
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/uau/vendas?startDate=${from}&endDate=${to}`, {
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json();
    return {
      qtdVendas: data.qtdVendas || 0,
      valorTotal: data.valorVendidoTotal || 0,
    };
  } catch { return { qtdVendas: 0, valorTotal: 0 }; }
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
  const [metaAds, crmLeads, uauVendas] = await Promise.all([
    fetchMetaAds(from, to),
    fetchCRMLeads(from, to),
    fetchUAUVendas(from, to),
  ]);

  // Build canal data
  const canais: Record<string, CanalData> = {};
  for (const canal of ALL_CANAIS) {
    const crm = crmLeads[canal] || { leads: 0, convertidos: 0 };
    canais[canal] = {
      investimento: canal === "Meta Ads" ? metaAds.spend : 0,
      leads: canal === "Meta Ads" ? Math.max(metaAds.leads, crm.leads) : crm.leads,
      leadsQualificados: 0,
      vendas: 0,
      valorVendas: 0,
      source: "api",
    };
  }

  // Distribute UAU sales proportionally by leads
  const totalLeads = Object.values(canais).reduce((s, c) => s + c.leads, 0);
  if (uauVendas.qtdVendas > 0 && totalLeads > 0) {
    // Assign to Meta Ads if it has most leads, otherwise distribute
    const metaLeads = canais["Meta Ads"].leads;
    if (metaLeads > 0) {
      canais["Meta Ads"].vendas = uauVendas.qtdVendas;
      canais["Meta Ads"].valorVendas = uauVendas.valorTotal;
    }
  }

  // KPIs totais
  const totalInvestimento = Object.values(canais).reduce((s, c) => s + c.investimento, 0);
  const totalLeadsAll = Object.values(canais).reduce((s, c) => s + c.leads, 0);
  const totalVendas = uauVendas.qtdVendas;
  const totalValorVendas = uauVendas.valorTotal;
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
    daily: metaAds.daily,
    crmTotal: {
      total: Object.values(crmLeads).reduce((s, c) => s + c.leads, 0),
      convertidos: Object.values(crmLeads).reduce((s, c) => s + c.convertidos, 0),
    },
    fetchedAt: new Date().toISOString(),
  };

  cachedData = { data: result, timestamp: Date.now(), key: cacheKey };
  return NextResponse.json(result);
}
