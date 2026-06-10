/**
 * Sincroniza status de bônus → Excel Cenário_Comercial.xlsx (colunas V/X).
 *  GET  → dry-run (só relatório do que MUDARIA, não escreve)
 *  POST → escreve de verdade
 */
import { NextResponse } from "next/server";
import { syncBonusToExcel, logSyncFalha, deletarColunasBonusFixas, diagnosticoExcel, configurarDropdownStatus } from "@/lib/excel-bonus-sync";
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
    const body = await request.json().catch(() => ({}));
    // Diagnóstico: qual arquivo/aba o sync usa + todos os candidatos achados.
    if (body?.acao === "diagnostico") {
      return NextResponse.json(await diagnosticoExcel());
    }
    // Dropdown das colunas de status com as 3 opções combinadas.
    if (body?.acao === "configurar-dropdown") {
      return NextResponse.json(await configurarDropdownStatus());
    }
    // Manutenção one-off: deletar colunas de valor fixo (Bônus Corretor / Bônus Imob).
    if (body?.acao === "deletar-colunas-fixas") {
      const r = await deletarColunasBonusFixas();
      return NextResponse.json(r);
    }
    const r = await syncBonusToExcel({ dryRun: false, force: true });
    return NextResponse.json(r);
  } catch (e) {
    await logSyncFalha(e);
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
