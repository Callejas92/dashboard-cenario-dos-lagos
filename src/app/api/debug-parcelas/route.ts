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

  // Inspeção detalhada: tipos de Status_Prc, distribuição de Tipo_Prc, sample dados
  const detailRes = await uauFetch(token, "Venda/BuscarParcelasAReceber", { empresa: 2, obra: "01VEN" }, 20000);
  const parcelas = Array.isArray(detailRes) ? detailRes.slice(1) : [];
  // Conta por status
  const statusCount: Record<string, number> = {};
  const tipoCount: Record<string, number> = {};
  const exemplosPorStatus: Record<string, unknown[]> = {};
  for (const p of parcelas) {
    const r = p as Record<string, unknown>;
    const s = String(r.Status_Prc ?? "?");
    const t = String(r.Tipo_Prc ?? "?");
    statusCount[s] = (statusCount[s] || 0) + 1;
    tipoCount[t] = (tipoCount[t] || 0) + 1;
    if (!exemplosPorStatus[s] || exemplosPorStatus[s].length < 2) {
      if (!exemplosPorStatus[s]) exemplosPorStatus[s] = [];
      exemplosPorStatus[s].push(r);
    }
  }

  // Testa BuscarParcelasAReceber com diferentes filtros / e endpoints alternativos
  const candidates = [
    // Variações de BuscarParcelasAReceber
    { path: "Venda/BuscarParcelasAReceber", body: { empresa: 2, obra: "01VEN" } },
    { path: "Venda/BuscarParcelasAReceber", body: { empresa: 2, obra: "01VEN", dataInicio: "2020-01-01", dataFim: "2030-12-31" } },
    { path: "Venda/BuscarParcelasAReceber", body: { empresa: 2, status: "A" } },
    { path: "Venda/BuscarParcelasAReceber", body: { empresa: 2, dataInicial: "01-01-2020", dataFinal: "31-12-2030" } },
    { path: "Venda/BuscarParcelasAReceber", body: { codigoEmpresa: 2, codigoObra: "01VEN" } },
    { path: "Venda/BuscarParcelasAReceber", body: { Empresa: 2, Obra: "01VEN" } },
    // Outros endpoints
    { path: "Venda/ConsultarParcelasReceberPorVenda", body: { codigoEmpresa: 2, codigoObra: "01VEN", numeroVenda: 1 } },
    { path: "FluxoParcelas/ConsultarParcelas", body: { codigoEmpresa: 2 } },
    { path: "Espelho/BuscarParcelasReceber", body: { codigoEmpresa: 2 } },
    { path: "Espelho/ConsultarParcelasReceber", body: { codigoEmpresa: 2 } },
    { path: "ContasReceber/Consultar", body: { codigoEmpresa: 2 } },
    { path: "Cobranca/ConsultarParcelas", body: { codigoEmpresa: 2 } },
  ];

  const results = await Promise.allSettled(
    candidates.map((c) => tryEndpoint(token, c.path, c.body))
  );

  const data = results.map((r) => r.status === "fulfilled" ? r.value : { ok: false, error: String(r.reason) });
  return NextResponse.json({
    totalParcelas: parcelas.length,
    statusCount,
    tipoCount,
    exemplosPorStatus: Object.fromEntries(
      Object.entries(exemplosPorStatus).map(([s, list]) => [s, list.slice(0, 2)])
    ),
    data,
  });
}
