/**
 * Sincroniza status de bônus → Excel Cenário_Comercial.xlsx (colunas V/X).
 *  GET  → dry-run (só relatório do que MUDARIA, não escreve)
 *  POST → escreve de verdade
 */
import { NextResponse } from "next/server";
import { syncBonusToExcel, logSyncFalha } from "@/lib/excel-bonus-sync";
import { checkWriteAuth } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const r = await syncBonusToExcel({ dryRun: true });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const negado = checkWriteAuth(request);
  if (negado) return negado;
  try {
    const r = await syncBonusToExcel({ dryRun: false, force: true });
    return NextResponse.json(r);
  } catch (e) {
    await logSyncFalha(e);
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
