import { NextRequest, NextResponse } from "next/server";
import { getBonusTracking, setBonusPagamento, clearBonusCache, type BonusPagamento } from "@/lib/bonus";

export const maxDuration = 60;

// GET → lista completa + summary
export async function GET() {
  try {
    const data = await getBonusTracking();
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("GET /api/bonus error:", msg);
    return NextResponse.json({ error: msg, bonus: [], summary: null }, { status: 500 });
  }
}

// POST → marcar pagamento (corretora ou imobiliária) ou limpar cache
// Body: { action: "mark", chaveVenda: string, patch: Partial<BonusPagamento> }
//   ou  { action: "clear-cache" }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    if (body.action === "clear-cache") {
      clearBonusCache();
      return NextResponse.json({ success: true });
    }

    if (body.action === "mark") {
      const chave = String(body.chaveVenda || "");
      if (!chave) return NextResponse.json({ error: "chaveVenda obrigatória" }, { status: 400 });

      // Validação dos campos do patch
      const raw = body.patch || {};
      const patch: Partial<BonusPagamento> = {};
      if (typeof raw.pagoCorretora === "boolean") patch.pagoCorretora = raw.pagoCorretora;
      if (typeof raw.dataPagoCorretora === "string") patch.dataPagoCorretora = raw.dataPagoCorretora;
      if (typeof raw.pagoImobiliaria === "boolean") patch.pagoImobiliaria = raw.pagoImobiliaria;
      if (typeof raw.dataPagoImobiliaria === "string") patch.dataPagoImobiliaria = raw.dataPagoImobiliaria;
      if (typeof raw.observacao === "string") patch.observacao = raw.observacao;
      if (typeof raw.liberadoManual === "boolean") {
        patch.liberadoManual = raw.liberadoManual;
        patch.dataLiberadoManual = raw.liberadoManual ? new Date().toISOString().split("T")[0] : "";
      }

      const updated = await setBonusPagamento(chave, patch);
      return NextResponse.json({ success: true, chaveVenda: chave, pagamento: updated });
    }

    if (body.action === "isentar") {
      const chave = String(body.chaveVenda || "");
      if (!chave) return NextResponse.json({ error: "chaveVenda obrigatória" }, { status: 400 });
      const razao = String(body.razao || "").trim();
      const dataHoje = new Date().toISOString().split("T")[0];
      const updated = await setBonusPagamento(chave, {
        isento: true,
        dataIsentado: dataHoje,
        razaoIsentado: razao,
      });
      return NextResponse.json({ success: true, chaveVenda: chave, pagamento: updated });
    }

    if (body.action === "remover-isencao") {
      const chave = String(body.chaveVenda || "");
      if (!chave) return NextResponse.json({ error: "chaveVenda obrigatória" }, { status: 400 });
      const updated = await setBonusPagamento(chave, {
        isento: false, dataIsentado: "", razaoIsentado: "",
      });
      return NextResponse.json({ success: true, chaveVenda: chave, pagamento: updated });
    }

    return NextResponse.json({ error: "Ação inválida. Use: mark | isentar | remover-isencao | clear-cache" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("POST /api/bonus error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
