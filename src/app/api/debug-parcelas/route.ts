// Debug: testa vários endpoints UAU pra achar o que retorna parcelas
import { NextResponse } from "next/server";
import { authenticate, isUauConfigured, uauFetch } from "@/lib/uau-auth";

export const maxDuration = 60;

async function tryEndpoint(token: string, path: string, body: Record<string, unknown>) {
  try {
    const start = Date.now();
    const res = await uauFetch(token, path, body, 15000);
    const ms = Date.now() - start;
    let arrayLen = 0;
    let myTableLen = 0;
    let sampleKeys: string[] = [];
    let sampleData: unknown = null;
    if (Array.isArray(res)) {
      arrayLen = res.length;
      const first = res[0] as { MyTable?: unknown[] };
      if (first?.MyTable && Array.isArray(first.MyTable)) {
        myTableLen = first.MyTable.length;
        if (first.MyTable.length > 1) sampleKeys = Object.keys(first.MyTable[1] as object);
        if (first.MyTable.length > 1) sampleData = first.MyTable[1];
      } else if (res.length > 1) {
        sampleKeys = Object.keys(res[1] as object);
        sampleData = res[1];
      } else if (res.length === 1) {
        sampleKeys = Object.keys(res[0] as object);
        sampleData = res[0];
      }
    } else if (res && typeof res === "object" && "MyTable" in res) {
      const mt = (res as { MyTable?: unknown[] }).MyTable;
      if (Array.isArray(mt)) {
        myTableLen = mt.length;
        if (mt.length > 1) sampleKeys = Object.keys(mt[1] as object);
      }
    }
    return { path, body, ms, ok: true, arrayLen, myTableLen, sampleKeys, sampleData: sampleData ? JSON.stringify(sampleData).slice(0, 800) : null };
  } catch (e) {
    return { path, body, ms: 0, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET() {
  if (!isUauConfigured()) {
    return NextResponse.json({ error: "UAU não configurado" }, { status: 503 });
  }

  const token = await authenticate();

  // Testa vários endpoints UAU relacionados a parcelas/recebimentos
  const candidates = [
    { path: "Venda/BuscarParcelasAReceber", body: { empresa: 2 } },
    { path: "Venda/BuscarParcelasAReceber", body: { codigoEmpresa: 2 } },
    { path: "Venda/ConsultarParcelas", body: { codigoEmpresa: 2 } },
    { path: "Venda/ConsultarParcelasDaVenda", body: { codigoEmpresa: 2, codigoObra: "01VEN", numeroVenda: 1 } },
    { path: "ParcelaVenda/ConsultarParcelas", body: { codigoEmpresa: 2 } },
    { path: "Recebimento/ConsultarRecebimentos", body: { codigoEmpresa: 2 } },
    { path: "Receber/ConsultarContas", body: { codigoEmpresa: 2 } },
    { path: "Financeiro/ConsultarReceberPorEmpresa", body: { codigoEmpresa: 2 } },
    { path: "Financeiro/ConsultarParcelasReceber", body: { codigoEmpresa: 2 } },
    { path: "ContaReceber/Consultar", body: { codigoEmpresa: 2 } },
    { path: "Venda/ConsultarResumoVenda", body: { codigoEmpresa: 2, codigoObra: "01VEN", numeroVenda: 1 } },
  ];

  const results = await Promise.allSettled(
    candidates.map((c) => tryEndpoint(token, c.path, c.body))
  );

  const data = results.map((r) => r.status === "fulfilled" ? r.value : { ok: false, error: String(r.reason) });
  return NextResponse.json({ data });
}
