import { NextRequest, NextResponse } from "next/server";

const CRM_API = process.env.CRM_API_URL || "http://leadsc2s.eggs.com.br/api/webhook/leads";

interface LeadRaw {
  id: string;
  internal_id: number;
  attributes: {
    description?: string;
    customer?: {
      id?: string;
      name?: string;
      email?: string;
      phone?: string;
    };
    seller?: {
      name?: string;
      email?: string;
      company?: string;
    };
    lead_source?: {
      id?: number;
      name?: string;
    };
    channel?: {
      id?: number;
      name?: string;
    };
    lead_status?: {
      id?: number;
      alias?: string;
      name?: string;
    };
    funnel_status?: {
      status?: string;
    };
    done_details?: {
      done?: boolean;
      done_price?: number | null;
    };
    tags?: { name?: string }[];
    created_at?: string;
    updated_at?: string;
    url?: string;
  };
}

interface CRMResponse {
  meta: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
  data: LeadRaw[];
}

// In-memory cache
let cachedData: { data: unknown; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  const apiKey = process.env.CRM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      configured: false,
      message: "CRM Eggs não configurado. Adicione CRM_API_KEY nas variáveis de ambiente.",
    });
  }

  // Check cache
  if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL) {
    return NextResponse.json(cachedData.data);
  }

  const { searchParams } = new URL(request.url);
  const pageSize = parseInt(searchParams.get("pageSize") || "200");

  try {
    // Fetch all leads with pagination
    const allLeads: LeadRaw[] = [];
    let offset = 0;
    let totalCount = 0;
    let hasMore = true;

    while (hasMore) {
      const url = `${CRM_API}?offset=${offset}&pageSize=${Math.min(pageSize, 200)}`;
      const res = await fetch(url, {
        headers: { "x-api-key": apiKey },
      });

      if (!res.ok) {
        throw new Error(`CRM API error: ${res.status} — ${await res.text()}`);
      }

      const json: CRMResponse = await res.json();
      totalCount = json.meta.totalCount;
      allLeads.push(...json.data);

      if (allLeads.length >= totalCount || json.data.length === 0) {
        hasMore = false;
      } else {
        offset += json.data.length;
      }
    }

    // Transform leads
    const leads = allLeads.map((raw) => {
      const a = raw.attributes;
      return {
        id: raw.id,
        nome: a.customer?.name || "",
        email: a.customer?.email || "",
        telefone: a.customer?.phone || "",
        corretor: a.seller?.name || "",
        fonte: a.lead_source?.name || "",
        canal: a.channel?.name || "",
        status: a.lead_status?.name || "",
        statusAlias: a.lead_status?.alias || "",
        funnelStatus: a.funnel_status?.status || "",
        convertido: a.done_details?.done || false,
        valorConversao: a.done_details?.done_price || 0,
        url: a.url || "",
        criadoEm: a.created_at || "",
        atualizadoEm: a.updated_at || "",
      };
    });

    // KPIs
    const total = leads.length;
    const novos = leads.filter((l) => l.statusAlias === "new").length;
    const emAtendimento = leads.filter((l) => l.statusAlias === "attending" || l.funnelStatus?.toLowerCase().includes("progress")).length;
    const convertidos = leads.filter((l) => l.convertido).length;
    const taxaConversao = total > 0 ? (convertidos / total) * 100 : 0;

    // Por fonte
    const fonteMap = new Map<string, number>();
    for (const l of leads) {
      const fonte = l.fonte || "Não identificado";
      fonteMap.set(fonte, (fonteMap.get(fonte) || 0) + 1);
    }
    const porFonte = Array.from(fonteMap.entries())
      .map(([fonte, qtd]) => ({ fonte, qtd }))
      .sort((a, b) => b.qtd - a.qtd);

    // Por corretor
    const corretorMap = new Map<string, number>();
    for (const l of leads) {
      const corretor = l.corretor || "Não atribuído";
      corretorMap.set(corretor, (corretorMap.get(corretor) || 0) + 1);
    }
    const porCorretor = Array.from(corretorMap.entries())
      .map(([corretor, qtd]) => ({ corretor, qtd }))
      .sort((a, b) => b.qtd - a.qtd);

    // Por status
    const statusMap = new Map<string, number>();
    for (const l of leads) {
      const status = l.status || "Desconhecido";
      statusMap.set(status, (statusMap.get(status) || 0) + 1);
    }
    const porStatus = Array.from(statusMap.entries())
      .map(([status, qtd]) => ({ status, qtd }))
      .sort((a, b) => b.qtd - a.qtd);

    // Por dia (últimos 30 dias)
    const porDia: { data: string; qtd: number }[] = [];
    const diaMap = new Map<string, number>();
    for (const l of leads) {
      if (!l.criadoEm) continue;
      const dia = l.criadoEm.split("T")[0];
      diaMap.set(dia, (diaMap.get(dia) || 0) + 1);
    }
    for (const [data, qtd] of Array.from(diaMap.entries()).sort()) {
      porDia.push({ data, qtd });
    }

    const response = {
      configured: true,
      totalLeads: total,
      novos,
      emAtendimento,
      convertidos,
      taxaConversao,
      porFonte,
      porCorretor,
      porStatus,
      porDia,
      leads,
      fetchedAt: new Date().toISOString(),
    };

    cachedData = { data: response, timestamp: Date.now() };
    return NextResponse.json(response);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("CRM API error:", errMsg);
    return NextResponse.json({ configured: true, error: errMsg }, { status: 500 });
  }
}
