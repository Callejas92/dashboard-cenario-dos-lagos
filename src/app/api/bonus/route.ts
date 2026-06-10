import { NextRequest, NextResponse, after } from "next/server";
import { getBonusTracking, setBonusPagamento, clearBonusCache, type BonusPagamento } from "@/lib/bonus";
import { syncBonusToExcel, logSyncFalha } from "@/lib/excel-bonus-sync";
import { checkWriteAuth } from "@/lib/server-auth";

export const maxDuration = 60;

// GET → lista completa + summary
export async function GET() {
  try {
    const data = await getBonusTracking();
    // Mantém o Excel (Cenário_Comercial, colunas V/X) em dia automaticamente —
    // roda pós-resposta (não atrasa a UI) e com throttle de 5 min (não martela o OneDrive).
    if (data.completo) after(() => syncBonusToExcel().catch((e) => logSyncFalha(e)));
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
  const negado = checkWriteAuth(request);
  if (negado) return negado;
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
      // Marcação/liberação deve refletir no Excel na hora (forçado).
      after(() => syncBonusToExcel({ force: true }).catch((e) => logSyncFalha(e)));
      // Devolve o tracking COMPLETO atualizado: a UI aplica direto (read-your-writes),
      // sem depender da releitura do blob (que pode servir versão velha por ~60s).
      return NextResponse.json({ success: true, chaveVenda: chave, pagamento: updated.pagamento, tracking: updated.tracking });
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
      return NextResponse.json({ success: true, chaveVenda: chave, pagamento: updated.pagamento, tracking: updated.tracking });
    }

    if (body.action === "remover-isencao") {
      const chave = String(body.chaveVenda || "");
      if (!chave) return NextResponse.json({ error: "chaveVenda obrigatória" }, { status: 400 });
      const updated = await setBonusPagamento(chave, {
        isento: false, dataIsentado: "", razaoIsentado: "",
      });
      return NextResponse.json({ success: true, chaveVenda: chave, pagamento: updated.pagamento, tracking: updated.tracking });
    }

    return NextResponse.json({ error: "Ação inválida. Use: mark | isentar | remover-isencao | clear-cache" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("POST /api/bonus error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
