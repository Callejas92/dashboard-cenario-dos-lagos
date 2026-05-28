import { NextRequest, NextResponse } from "next/server";
import { getVendas, clearVendasCache } from "@/lib/uau-vendas";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate") || undefined;
  const endDate = searchParams.get("endDate") || undefined;

  const data = await getVendas(startDate, endDate);
  if (data.error && data.total === 0 && data.vendas.length === 0) {
    return NextResponse.json(data, { status: data.error === "UAU não configurado" ? 503 : 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (body.action === "clear-cache") {
    clearVendasCache();
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: "ação inválida" }, { status: 400 });
}
