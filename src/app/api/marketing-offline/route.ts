import { NextRequest, NextResponse } from "next/server";
import { getMarketingData, clearMarketingCache, listOnedriveFiles } from "@/lib/onedrive-marketing";

export const maxDuration = 120;

// GET: retorna dados ricos do Cenario_Marketing.xlsx
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view"); // "summary" | "plano" | "eventos" | "gastos" | null (tudo)

  try {
    const data = await getMarketingData();

    if (view === "summary") {
      return NextResponse.json({
        premissas: data.premissas,
        totalRealizado: data.totalRealizado,
        pctBudgetConsumido: data.pctBudgetConsumido,
        resumoPorGrupo: data.resumoPorGrupo,
        qtdGastos: data.gastos.length,
        qtdEventos: data.eventos.length,
        fetchedAt: data.fetchedAt,
      });
    }
    if (view === "plano") {
      return NextResponse.json({
        premissas: data.premissas,
        planoMensal: data.planoMensal,
        mixFases: data.mixFases,
        totalRealizado: data.totalRealizado,
        pctBudgetConsumido: data.pctBudgetConsumido,
      });
    }
    if (view === "eventos") {
      return NextResponse.json({
        eventos: data.eventos,
        naoEventos: data.naoEventos,
        totalEventos: data.eventos.reduce((s, e) => s + e.totalGasto, 0),
        totalNaoEventos: data.naoEventos.reduce((s, e) => s + e.totalGasto, 0),
      });
    }
    if (view === "gastos") {
      return NextResponse.json({
        gastos: data.gastos,
        naturezas: data.naturezas,
        totalRealizado: data.totalRealizado,
      });
    }

    // Default: tudo
    return NextResponse.json(data);
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("marketing-offline GET error:", errMsg);
    return NextResponse.json(
      { error: errMsg, configured: false },
      { status: 200 }
    );
  }
}

// POST: ações administrativas
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    if (body.action === "clear-cache") {
      clearMarketingCache();
      return NextResponse.json({ success: true, message: "Cache limpo." });
    }

    if (body.action === "list-files") {
      const files = await listOnedriveFiles(body.folder || "/");
      return NextResponse.json({ files });
    }

    if (body.action === "test") {
      clearMarketingCache();
      const data = await getMarketingData();
      return NextResponse.json({
        success: true,
        sheets: data.sheets,
        filePath: data.filePath,
        premissas: data.premissas,
        qtdGastos: data.gastos.length,
        qtdNaturezas: data.naturezas.length,
        qtdMesesPlano: data.planoMensal.length,
        qtdEventos: data.eventos.length,
        totalRealizado: data.totalRealizado,
        pctBudgetConsumido: data.pctBudgetConsumido,
      });
    }

    return NextResponse.json({ error: "Ação não reconhecida. Use: clear-cache, list-files, test" }, { status: 400 });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("marketing-offline POST error:", errMsg);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
