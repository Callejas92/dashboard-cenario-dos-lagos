import { NextResponse } from "next/server";
import { list } from "@vercel/blob";

const META_API = "https://graph.facebook.com/v21.0";
const BLOB_NAME = "whatsapp-events.json";

let cachedData: { data: unknown; timestamp: number; key: string } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

// ── Meta pricing table (Brazil) ─────────────────────────────────────────
// Source: Meta WhatsApp Business pricing - per conversation (24h window)
const META_PRICING = {
  MARKETING: 0.0625,       // USD per marketing conversation
  UTILITY: 0.0080,         // USD per utility conversation
  AUTHENTICATION: 0.0315,  // USD per auth conversation
  SERVICE: 0,              // free (first 1000/month)
};
const DEFAULT_EXCHANGE_RATE = 5.70; // USD → BRL fallback
const DEFAULT_MARKETING_RATIO = 0.99; // 99% of messages are marketing

// ── Types ───────────────────────────────────────────────────────────────

interface DayStats { sent: number; delivered: number; read: number; received: number }
interface QualityEvent { timestamp: string; phone: string; de: string; para: string }
interface PricingConfig {
  marketingPerConversation: number;
  servicePerConversation: number;
  marketingRatio: number;
  exchangeRate: number;
}
interface WhatsAppStats {
  daily: Record<string, DayStats>;
  qualityHistory?: QualityEvent[];
  pricing?: PricingConfig;
  updatedAt: string;
}

// ── Blob helpers ────────────────────────────────────────────────────────

async function loadWebhookStats(): Promise<WhatsAppStats> {
  try {
    const { blobs } = await list({ prefix: BLOB_NAME });
    if (blobs.length === 0) return { daily: {}, updatedAt: "" };
    const res = await fetch(blobs[0].url, { cache: "no-store" });
    return await res.json();
  } catch {
    return { daily: {}, updatedAt: "" };
  }
}

function sumDays(daily: Record<string, DayStats>, fromDate: string, toDate: string): DayStats {
  const result = { sent: 0, delivered: 0, read: 0, received: 0 };
  for (const [day, stats] of Object.entries(daily)) {
    if (day >= fromDate && day <= toDate) {
      result.sent      += stats.sent;
      result.delivered += stats.delivered;
      result.read      += stats.read;
      result.received  += stats.received;
    }
  }
  return result;
}

// ── Fetch conversation analytics from Meta API ──────────────────────────

interface ConvDataPoint {
  conversation: number;
  cost: number;
  conversation_category?: string;
}

async function fetchConversationAnalytics(
  wabaId: string, token: string, startTs: number, endTs: number,
): Promise<{ total: number; custoUSD: number; porCategoria: { categoria: string; qtd: number; custoUSD: number }[] }> {
  try {
    const url = `${META_API}/${wabaId}/conversation_analytics` +
      `?start=${startTs}&end=${endTs}` +
      `&granularity=DAILY` +
      `&metric_types=${encodeURIComponent(JSON.stringify(["COST", "CONVERSATION"]))}` +
      `&dimensions=${encodeURIComponent(JSON.stringify(["CONVERSATION_CATEGORY"]))}` +
      `&access_token=${token}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();

    let total = 0, custoUSD = 0;
    const cats: Record<string, { qtd: number; custoUSD: number }> = {};

    for (const entry of (data.data || [])) {
      for (const point of (entry.data_points || []) as ConvDataPoint[]) {
        const vol = point.conversation || 0;
        const cost = point.cost || 0;
        total += vol;
        custoUSD += cost;
        const cat = point.conversation_category || "OTHER";
        if (!cats[cat]) cats[cat] = { qtd: 0, custoUSD: 0 };
        cats[cat].qtd += vol;
        cats[cat].custoUSD += cost;
      }
    }

    return {
      total, custoUSD,
      porCategoria: Object.entries(cats).map(([categoria, v]) => ({ categoria, ...v })),
    };
  } catch {
    return { total: 0, custoUSD: 0, porCategoria: [] };
  }
}

// ── Fetch live exchange rate (USD → BRL) ────────────────────────────────

async function fetchExchangeRate(): Promise<number> {
  try {
    const res = await fetch(
      "https://open.er-api.com/v6/latest/USD",
      { signal: AbortSignal.timeout(5000) },
    );
    const data = await res.json();
    return data.rates?.BRL ?? DEFAULT_EXCHANGE_RATE;
  } catch {
    return DEFAULT_EXCHANGE_RATE;
  }
}

// ── Estimate cost from webhook message counts ───────────────────────────

function estimateCost(
  delivered: number,
  pricing: PricingConfig | undefined,
  exchangeRate: number,
): {
  custoUSD: number;
  custoBRL: number;
  conversasMarketing: number;
  conversasServico: number;
  porCategoria: { categoria: string; label: string; qtd: number; custoUSD: number; custoBRL: number }[];
} {
  const mktRatio = pricing?.marketingRatio ?? DEFAULT_MARKETING_RATIO;
  const mktPrice = pricing?.marketingPerConversation ?? META_PRICING.MARKETING;

  const conversasMarketing = Math.round(delivered * mktRatio);
  const conversasServico = delivered - conversasMarketing;

  const custoMktUSD = conversasMarketing * mktPrice;
  const custoSvcUSD = 0; // free
  const custoUSD = custoMktUSD + custoSvcUSD;
  const custoBRL = custoUSD * exchangeRate;

  return {
    custoUSD,
    custoBRL,
    conversasMarketing,
    conversasServico,
    porCategoria: [
      {
        categoria: "MARKETING",
        label: "Marketing",
        qtd: conversasMarketing,
        custoUSD: custoMktUSD,
        custoBRL: custoMktUSD * exchangeRate,
      },
      ...(conversasServico > 0
        ? [{
            categoria: "SERVICE",
            label: "Serviço",
            qtd: conversasServico,
            custoUSD: 0,
            custoBRL: 0,
          }]
        : []),
    ],
  };
}

// ── GET /api/whatsapp?days=30 ─────────────────────────────────────────────

export async function GET(request: Request) {
  const token   = process.env.WHATSAPP_TOKEN?.trim();
  const phoneId = process.env.WHATSAPP_PHONE_ID?.trim();
  const wabaId  = process.env.WHATSAPP_WABA_ID?.trim();

  if (!token || !phoneId || !wabaId) {
    return NextResponse.json({
      configured: false,
      message: "WhatsApp não configurado. Adicione WHATSAPP_TOKEN, WHATSAPP_PHONE_ID e WHATSAPP_WABA_ID.",
    });
  }

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") || "30");
  const cacheKey = `wpp-${days}`;

  if (cachedData && cachedData.key === cacheKey && Date.now() - cachedData.timestamp < CACHE_TTL) {
    return NextResponse.json(cachedData.data);
  }

  const now = new Date();
  const endDate   = now.toISOString().split("T")[0];
  const startD    = new Date(now); startD.setDate(startD.getDate() - days);
  const startDate = startD.toISOString().split("T")[0];
  const endTs   = Math.floor(now.getTime() / 1000);
  const startTs = Math.floor(startD.getTime() / 1000);

  try {
    // Fetch all in parallel
    const [phoneRes, templatesRes, webhookStats, convAnalytics, exchangeRate] = await Promise.all([
      fetch(`${META_API}/${phoneId}?fields=id,display_phone_number,verified_name,quality_rating,platform_type&access_token=${token}`),
      fetch(`${META_API}/${wabaId}/message_templates?fields=name,status,category,language&limit=50&access_token=${token}`),
      loadWebhookStats(),
      fetchConversationAnalytics(wabaId, token, startTs, endTs),
      fetchExchangeRate(),
    ]);

    const [phoneData, templatesData] = await Promise.all([
      phoneRes.json(),
      templatesRes.json(),
    ]);

    // Message counts from webhook
    const mensagens = sumDays(webhookStats.daily, startDate, endDate);

    // Daily chart
    const dailyChart: { data: string; sent: number; delivered: number; read: number; received: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      const st = webhookStats.daily[key] ?? { sent: 0, delivered: 0, read: 0, received: 0 };
      dailyChart.push({ data: key, ...st });
    }

    // Templates
    const templates = (templatesData.data || []).map((t: { name: string; status: string; category: string; language?: string }) => ({
      nome: t.name,
      status: t.status,
      categoria: t.category,
      idioma: t.language || "pt_BR",
    }));
    const aprovados  = templates.filter((t: { status: string }) => t.status === "APPROVED").length;
    const pendentes  = templates.filter((t: { status: string }) => t.status === "PENDING").length;
    const rejeitados = templates.filter((t: { status: string }) => t.status === "REJECTED").length;

    // Category labels
    const CAT_LABELS: Record<string, string> = {
      MARKETING: "Marketing", UTILITY: "Utilidade", AUTHENTICATION: "Autenticação",
      SERVICE: "Serviço", REFERRAL_CONVERSION: "Conversão", OTHER: "Outros",
    };

    // ── Cost: try API first, fallback to estimation ─────────────────
    let conversas;
    if (convAnalytics.total > 0) {
      // API returned real data
      conversas = {
        total: convAnalytics.total,
        custoUSD: convAnalytics.custoUSD,
        custoBRL: convAnalytics.custoUSD * exchangeRate,
        porCategoria: convAnalytics.porCategoria.map((c) => ({
          ...c,
          label: CAT_LABELS[c.categoria] || c.categoria,
          custoBRL: c.custoUSD * exchangeRate,
        })),
        fonte: "api" as const,
        cambio: exchangeRate,
      };
    } else {
      // Estimate from webhook delivered count + Meta pricing table
      const est = estimateCost(mensagens.delivered, webhookStats.pricing, exchangeRate);
      conversas = {
        total: mensagens.delivered,
        custoUSD: est.custoUSD,
        custoBRL: est.custoBRL,
        porCategoria: est.porCategoria,
        fonte: "estimado" as const,
        cambio: exchangeRate,
      };
    }

    const result = {
      configured: true,
      numero: {
        telefone:   phoneData.display_phone_number || "",
        nome:       phoneData.verified_name || "",
        qualidade:  phoneData.quality_rating || "—",
        plataforma: phoneData.platform_type || "CLOUD_API",
      },
      mensagens,
      conversas,
      templates: { total: templates.length, aprovados, pendentes, rejeitados, lista: templates },
      dailyChart,
      webhookAtivo: Object.keys(webhookStats.daily).length > 0,
      webhookUpdatedAt: webhookStats.updatedAt,
      qualityHistory: webhookStats.qualityHistory ?? [],
      periodo: { dias: days, inicio: startDate, fim: endDate },
      fetchedAt: new Date().toISOString(),
    };

    cachedData = { data: result, timestamp: Date.now(), key: cacheKey };
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ configured: true, error: String(error) }, { status: 500 });
  }
}
