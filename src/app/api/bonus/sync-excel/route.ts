/**
 * Sincroniza status de bônus → Excel Cenário_Comercial.xlsx (colunas V/X).
 *  GET  → dry-run (só relatório do que MUDARIA, não escreve)
 *  POST → escreve de verdade
 */
import { NextResponse } from "next/server";
import { syncBonusToExcel } from "@/lib/excel-bonus-sync";

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

export async function POST() {
  try {
    const r = await syncBonusToExcel({ dryRun: false });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
