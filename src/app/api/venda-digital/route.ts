/**
 * Venda direta do digital — número editável no dashboard.
 *  GET  → { valor }
 *  POST { valor } → grava (protegido por senha; valor inteiro >= 0)
 */
import { NextResponse } from "next/server";
import { getVendaDigital, setVendaDigital } from "@/lib/venda-digital";
import { checkWriteAuth } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ valor: await getVendaDigital() });
}

export async function POST(request: Request) {
  const negado = checkWriteAuth(request);
  if (negado) return negado;
  const body = (await request.json().catch(() => null)) as { valor?: unknown } | null;
  const n = Number(body?.valor);
  if (!Number.isFinite(n) || n < 0) {
    return NextResponse.json({ error: "Envie { valor: número >= 0 }" }, { status: 400 });
  }
  const ok = await setVendaDigital(n);
  if (!ok) {
    return NextResponse.json({ error: "Não foi possível salvar (Edge indisponível)." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, valor: Math.round(n) });
}
