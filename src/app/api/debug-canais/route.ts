// Endpoint debug: mede tempo de cada call dentro de /api/canais.
// Remover quando o bug estiver resolvido.
import { NextResponse } from "next/server";
import { getCustosOffline } from "@/lib/onedrive-custos";
import { getWhatsAppCost } from "@/lib/whatsapp-cost";
import { getGoogleAdsCost } from "@/lib/google-ads-cost";
import { getCrossSell } from "@/lib/cross-sell";
import { getVendas } from "@/lib/uau-vendas";

export const maxDuration = 60;

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

  // Roda tudo em paralelo, mas mede cada um separadamente
  const results = await Promise.allSettled([
    time("getCustosOffline", () => getCustosOffline()),
    time("getWhatsAppCost", () => getWhatsAppCost(from, to)),
    time("getGoogleAdsCost", () => getGoogleAdsCost(from, to)),
    time("getCrossSell", () => getCrossSell(from, to)),
    time("getVendas(lite)", () => getVendas(from, to, { skipEnrich: true })),
  ]);

  const data = results.map((r) => r.status === "fulfilled" ? r.value : { label: "?", ms: 0, ok: false, preview: String(r.reason) });
  return NextResponse.json({ data });
}
