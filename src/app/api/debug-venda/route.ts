// Debug: testa endpoints UAU que retornam valor de contrato (sem juros)
import { NextResponse } from "next/server";
import { authenticate, isUauConfigured, uauFetch } from "@/lib/uau-auth";

export const maxDuration = 60;

async function tryEndpoint(token: string, path: string, body: Record<string, unknown>) {
  try {
    const start = Date.now();
    const res = await uauFetch(token, path, body, 15000);
    const ms = Date.now() - start;

    let preview = "";
    let interestingKeys: string[] = [];
    if (Array.isArray(res)) {
      const first = res[0] as Record<string, unknown> & { MyTable?: unknown[] };
      if (first?.MyTable && Array.isArray(first.MyTable) && first.MyTable.length > 1) {
        const row = first.MyTable[1] as Record<string, unknown>;
        interestingKeys = Object.keys(row).filter((k) =>
          /valor|desconto|preco|contrato|venda|tabela|acrescimo/i.test(k)
        );
        const sample: Record<string, unknown> = {};
        for (const k of interestingKeys) sample[k] = row[k];
        preview = JSON.stringify(sample).slice(0, 500);
      } else if (res.length > 1) {
        const row = res[1] as Record<string, unknown>;
        interestingKeys = Object.keys(row).filter((k) =>
          /valor|desconto|preco|contrato|venda|tabela|acrescimo/i.test(k)
        );
        const sample: Record<string, unknown> = {};
        for (const k of interestingKeys) sample[k] = row[k];
        preview = JSON.stringify(sample).slice(0, 500);
      } else if (res.length === 1) {
        const row = res[0] as Record<string, unknown>;
        interestingKeys = Object.keys(row).filter((k) =>
          /valor|desconto|preco|contrato|venda|tabela|acrescimo/i.test(k)
        );
        preview = JSON.stringify({ schema: true, keys: interestingKeys }).slice(0, 300);
      }
    } else if (res && typeof res === "object") {
      interestingKeys = Object.keys(res as object).filter((k) =>
        /valor|desconto|preco|contrato|venda|tabela|acrescimo/i.test(k)
      );
      const sample: Record<string, unknown> = {};
      for (const k of interestingKeys) sample[k] = (res as Record<string, unknown>)[k];
      preview = JSON.stringify(sample).slice(0, 500);
    }

    return { path, body, ms, ok: true, interestingKeys, preview };
  } catch (e) {
    return { path, body, ok: false, error: (e instanceof Error ? e.message : String(e)).slice(0, 100) };
  }
}

export async function GET() {
  if (!isUauConfigured()) return NextResponse.json({ error: "UAU não configurado" }, { status: 503 });

  const token = await authenticate();

  // Testa endpoints relacionados a venda/contrato
  const numVendaTeste = 40; // venda #40 (Q1-L9)
  const candidates = [
    { path: "Venda/ConsultarVendaPorChave", body: { codigoEmpresa: 2, codigoObra: "01VEN", numeroVenda: numVendaTeste } },
    { path: "Venda/ConsultarVenda", body: { codigoEmpresa: 2, codigoObra: "01VEN", numeroVenda: numVendaTeste } },
    { path: "Venda/ConsultarVendas", body: { codigoEmpresa: 2, codigoObra: "01VEN" } },
    { path: "Venda/ConsultarVendaCompleta", body: { codigoEmpresa: 2, codigoObra: "01VEN", numeroVenda: numVendaTeste } },
    { path: "Venda/ConsultarVendaDetalhada", body: { codigoEmpresa: 2, codigoObra: "01VEN", numeroVenda: numVendaTeste } },
    { path: "Venda/BuscarVendaPorChave", body: { codigoEmpresa: 2, codigoObra: "01VEN", numeroVenda: numVendaTeste } },
    { path: "Venda/BuscarVenda", body: { codigoEmpresa: 2, codigoObra: "01VEN", numeroVenda: numVendaTeste } },
    { path: "Venda/ConsultarValorVenda", body: { codigoEmpresa: 2, codigoObra: "01VEN", numeroVenda: numVendaTeste } },
    { path: "Contrato/ConsultarContrato", body: { codigoEmpresa: 2, codigoObra: "01VEN", numeroVenda: numVendaTeste } },
    { path: "Espelho/BuscaUnidadesDeAcordoComWhereDetalhado", body: { where: "WHERE Empresa_unid = 2 AND Num_Ven = 40 AND Vendido_unid = 1", retorna_venda: true, data_tabela_preco: "05-20-2026" } },
    // Variações de body
    { path: "Venda/ConsultarVendaPorChave", body: { Empresa: 2, Obra: "01VEN", NumVend: numVendaTeste } },
    { path: "Venda/ConsultarVendaPorChave", body: { empresa: 2, obra: "01VEN", numVenda: numVendaTeste } },
  ];

  const results = await Promise.allSettled(
    candidates.map((c) => tryEndpoint(token, c.path, c.body))
  );
  const data = results.map((r) => r.status === "fulfilled" ? r.value : { ok: false, error: String(r.reason) });
  return NextResponse.json({ data });
}
