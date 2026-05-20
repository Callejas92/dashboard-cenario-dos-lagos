import { NextRequest, NextResponse } from "next/server";
import { getVendas } from "@/lib/uau-vendas";

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
