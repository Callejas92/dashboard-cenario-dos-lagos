import { list } from "@vercel/blob";

const META_API = "https://graph.facebook.com/v21.0";
const BLOB_NAME = "whatsapp-events.json";

const META_PRICING = {
  MARKETING: 0.0625,
  UTILITY: 0.0080,
  AUTHENTICATION: 0.0315,
  SERVICE: 0,
};
const DEFAULT_EXCHANGE_RATE = 5.70;
const DEFAULT_MARKETING_RATIO = 0.99;

interface DayStats { sent: number; delivered: number; read: number; received: number }
interface PricingConfig {
  marketingPerConversation: number;
  servicePerConversation: number;
  marketingRatio: number;
  exchangeRate: number;
}
interface WhatsAppStats {
  daily: Record<string, DayStats>;
  pricing?: PricingConfig;
  updatedAt: string;
}

export interface WhatsAppCostResult {
  custoBRL: number;
  conversas: number;
  mensagensRecebidas: number;
  daily: Record<string, number>; // date → custoBRL
  fonte: "api" | "estimado" | "none";
}

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

async function fetchExchangeRate(): Promise<number> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    return data.rates?.BRL ?? DEFAULT_EXCHANGE_RATE;
  } catch {
    return DEFAULT_EXCHANGE_RATE;
  }
}

interface ConvDataPoint {
  conversation: number;
  cost: number;
  conversation_category?: string;
  start?: number;
}

async function fetchConversationAnalytics(
  wabaId: string, token: string, startTs: number, endTs: number,
): Promise<{ total: number; custoUSD: number; daily: Record<string, number> }> {
  try {
    const url = `${META_API}/${wabaId}/conversation_analytics` +
      `?start=${startTs}&end=${endTs}` +
      `&granularity=DAILY` +
      `&metric_types=${encodeURIComponent(JSON.stringify(["COST", "CONVERSATION"]))}` +
      `&access_token=${token}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();

    let total = 0, custoUSD = 0;
    const daily: Record<string, number> = {};

    for (const entry of (data.data || [])) {
      for (const point of (entry.data_points || []) as ConvDataPoint[]) {
        const vol = point.conversation || 0;
        const cost = point.cost || 0;
        total += vol;
        custoUSD += cost;
        if (point.start) {
          const dateStr = new Date(point.start * 1000).toISOString().split("T")[0];
          daily[dateStr] = (daily[dateStr] || 0) + cost;
        }
      }
    }

    return { total, custoUSD, daily };
  } catch {
    return { total: 0, custoUSD: 0, daily: {} };
  }
}

function sumDays(daily: Record<string, DayStats>, fromDate: string, toDate: string): DayStats {
  const result = { sent: 0, delivered: 0, read: 0, received: 0 };
  for (const [day, stats] of Object.entries(daily)) {
    if (day >= fromDate && day <= toDate) {
      result.sent += stats.sent;
      result.delivered += stats.delivered;
      result.read += stats.read;
      result.received += stats.received;
    }
  }
  return result;
}

/**
 * Custo do WhatsApp para um período específico.
 * Tenta API conversation_analytics primeiro, se 0 estima do webhook delivered.
 */
export async function getWhatsAppCost(from: string, to: string): Promise<WhatsAppCostResult> {
  const token = process.env.WHATSAPP_TOKEN?.trim();
  const wabaId = process.env.WHATSAPP_WABA_ID?.trim();
  if (!token || !wabaId) {
    return { custoBRL: 0, conversas: 0, mensagensRecebidas: 0, daily: {}, fonte: "none" };
  }

  const startTs = Math.floor(new Date(from + "T00:00:00").getTime() / 1000);
  const endTs = Math.floor(new Date(to + "T23:59:59").getTime() / 1000);

  const [convAnalytics, exchangeRate, webhookStats] = await Promise.all([
    fetchConversationAnalytics(wabaId, token, startTs, endTs),
    fetchExchangeRate(),
    loadWebhookStats(),
  ]);

  const mensagens = sumDays(webhookStats.daily, from, to);

  // Se Meta API retornou dados reais, usa eles
  if (convAnalytics.total > 0) {
    const dailyBRL: Record<string, number> = {};
    for (const [date, costUSD] of Object.entries(convAnalytics.daily)) {
      dailyBRL[date] = costUSD * exchangeRate;
    }
    return {
      custoBRL: convAnalytics.custoUSD * exchangeRate,
      conversas: convAnalytics.total,
      mensagensRecebidas: mensagens.received,
      daily: dailyBRL,
      fonte: "api",
    };
  }

  // Fallback: estimar baseado no webhook delivered
  const mktRatio = webhookStats.pricing?.marketingRatio ?? DEFAULT_MARKETING_RATIO;
  const mktPrice = webhookStats.pricing?.marketingPerConversation ?? META_PRICING.MARKETING;
  const conversasMarketing = Math.round(mensagens.delivered * mktRatio);
  const custoUSD = conversasMarketing * mktPrice;
  const custoBRL = custoUSD * exchangeRate;

  // Daily estimado (pelas mensagens entregues do dia)
  const dailyBRL: Record<string, number> = {};
  if (custoBRL > 0 && mensagens.delivered > 0) {
    for (const [date, stats] of Object.entries(webhookStats.daily)) {
      if (date >= from && date <= to && stats.delivered > 0) {
        dailyBRL[date] = (stats.delivered / mensagens.delivered) * custoBRL;
      }
    }
  }

  return {
    custoBRL,
    conversas: mensagens.delivered,
    mensagensRecebidas: mensagens.received,
    daily: dailyBRL,
    fonte: "estimado",
  };
}
