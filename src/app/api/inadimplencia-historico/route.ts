import { NextResponse } from "next/server";
import { lerHistoricoInadimplencia } from "@/lib/inadimplencia-historico";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ dias: await lerHistoricoInadimplencia() });
}
