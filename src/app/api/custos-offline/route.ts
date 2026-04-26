import { NextRequest, NextResponse } from "next/server";
import { getCustosOffline, clearCustosCache, listOnedriveFiles } from "@/lib/onedrive-custos";

export const maxDuration = 30;

// Re-exporta o tipo pra outros arquivos importarem daqui (compat)
export type { LancamentoOffline } from "@/lib/onedrive-custos";

// ── GET: lê Excel do OneDrive e parseia ──
export async function GET() {
  try {
    const parsed = await getCustosOffline();
    return NextResponse.json({
      ...parsed,
      updated_at: new Date().toISOString(),
      source: "onedrive",
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Custos offline GET error:", errMsg);
    return NextResponse.json(
      { error: errMsg, custosMensais: [], lancamentos: [], total_offline: 0 },
      { status: 200 }
    );
  }
}

// ── POST: ações administrativas ──
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    if (body.action === "clear-cache") {
      clearCustosCache();
      return NextResponse.json({ success: true, message: "Cache limpo. Próximo GET lerá do OneDrive." });
    }

    if (body.action === "list-files") {
      const files = await listOnedriveFiles(body.folder || "/");
      return NextResponse.json({ files });
    }

    if (body.action === "test") {
      clearCustosCache();
      const parsed = await getCustosOffline();
      return NextResponse.json({
        success: true,
        sheets: parsed.sheets,
        custosMensais: parsed.custosMensais.length,
        lancamentos: parsed.lancamentos.length,
        total_offline: parsed.total_offline,
      });
    }

    return NextResponse.json({ error: "Ação não reconhecida. Use: clear-cache, list-files, test" }, { status: 400 });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Custos offline POST error:", errMsg);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
