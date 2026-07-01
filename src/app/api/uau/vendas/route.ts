import { NextRequest, NextResponse } from "next/server";
import { getVendas, clearVendasCache } from "@/lib/uau-vendas";
import { cachedJson } from "@/lib/blob-cache";

export const maxDuration = 300;
const CACHE_TTL = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate") || undefined;
  const endDate = searchParams.get("endDate") || undefined;

  const key = `uau-vendas-${startDate ?? "all"}-${endDate ?? "all"}`;
  try {
    const data = await cachedJson(key, CACHE_TTL, async () => {
      const d = await getVendas(startDate, endDate);
      if (d.error && d.total === 0 && d.vendas.length === 0) {
        throw new Error(d.error || "UAU vendas falhou");
      }
      return d;
    });
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: msg, total: 0, vendas: [] },
      { status: msg === "UAU não configurado" ? 503 : 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (body.action === "clear-cache") {
    clearVendasCache();
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: "ação inválida" }, { status: 400 });
}
