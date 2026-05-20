// Endpoint debug: mede tempo de cada call dentro de /api/canais.
import { NextResponse } from "next/server";
import { getCustosOffline } from "@/lib/onedrive-custos";
import { getWhatsAppCost } from "@/lib/whatsapp-cost";
import { getGoogleAdsCost } from "@/lib/google-ads-cost";
import { getCrossSell } from "@/lib/cross-sell";
import { getVendas } from "@/lib/uau-vendas";

export const maxDuration = 60;

const META_API = "https://graph.facebook.com/v21.0";
const CRM_API = "http://leadsc2s.eggs.com.br/api/webhook/leads";

async function fetchMetaAdsTest(from: string, to: string) {
  const token = process.env.META_ACCESS_TOKEN?.trim();
  const accountId = process.env.META_AD_ACCOUNT_ID?.trim();
  if (!token || !accountId) return { spend: 0 };
  const timeRange = JSON.stringify({ since: from, until: to });
  const res = await fetch(`${META_API}/act_${accountId}/insights?fields=spend,actions&time_range=${timeRange}&level=account&access_token=${token}`, { signal: AbortSignal.timeout(15000) });
  const data = await res.json();
  return { spend: Number(data.data?.[0]?.spend || 0) };
}

async function fetchMetaAdsDailyTest(from: string, to: string) {
  const token = process.env.META_ACCESS_TOKEN?.trim();
  const accountId = process.env.META_AD_ACCOUNT_ID?.trim();
  if (!token || !accountId) return { days: 0 };
  const timeRange = JSON.stringify({ since: from, until: to });
  const res = await fetch(`${META_API}/act_${accountId}/insights?fields=spend,actions&time_range=${timeRange}&time_increment=1&limit=500&access_token=${token}`, { signal: AbortSignal.timeout(15000) });
  const data = await res.json();
  return { days: (data.data || []).length };
}

async function fetchCRMLeadsTest() {
  const key = process.env.CRM_API_KEY?.trim();
  if (!key) return { total: 0 };
  let count = 0;
  let offset = 0;
  let pages = 0;
  while (true) {
    const res = await fetch(`${CRM_API}?offset=${offset}&pageSize=100`, { headers: { "x-api-key": key }, signal: AbortSignal.timeout(15000) });
    const data = await res.json();
    const leads = data.data || data.leads || (Array.isArray(data) ? data : []);
    if (leads.length === 0) break;
    count += leads.length;
    pages++;
    if (leads.length < 100) break;
    offset += 100;
    if (pages > 50) break;
  }
  return { total: count, pages };
}

async function time<T>(label: string, fn: () => Promise<T>): Promise<{ label: string; ms: number; ok: boolean; preview?: string }> {
  const start = Date.now();
  try {
    const res = await fn();
    const ms = Date.now() - start;
    return { label, ms, ok: true, preview: typeof res === "object" ? JSON.stringify(res).slice(0, 200) : String(res).slice(0, 200) };
  } catch (e) {
    return { label, ms: Date.now() - start, ok: false, preview: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET() {
  const from = "2026-04-14";
  const to = "2026-05-19";

  const results = await Promise.allSettled([
    time("getCustosOffline", () => getCustosOffline()),
    time("getWhatsAppCost", () => getWhatsAppCost(from, to)),
    time("getGoogleAdsCost", () => getGoogleAdsCost(from, to)),
    time("getCrossSell", () => getCrossSell(from, to)),
    time("getVendas(lite)", () => getVendas(from, to, { skipEnrich: true })),
    time("fetchMetaAds(total)", () => fetchMetaAdsTest(from, to)),
    time("fetchMetaAds(daily)", () => fetchMetaAdsDailyTest(from, to)),
    time("fetchCRMLeads", () => fetchCRMLeadsTest()),
  ]);

  const data = results.map((r) => r.status === "fulfilled" ? r.value : { label: "?", ms: 0, ok: false, preview: String(r.reason) });
  return NextResponse.json({ data });
}
