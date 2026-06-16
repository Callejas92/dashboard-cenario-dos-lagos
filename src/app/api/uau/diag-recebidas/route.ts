/**
 * TEMPORÁRIO — investigação: o UAU expõe parcelas RECEBIDAS com data?
 * Usa a auth do app (que funciona). Retorna SÓ estrutura (chaves), sem PII.
 * REMOVER após a investigação.
 */
import { NextResponse } from "next/server";
import { authenticate, uauFetch } from "@/lib/uau-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function extractMyTable(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw) && raw.length > 0 && (raw[0] as { MyTable?: unknown })?.MyTable) {
    const table = (raw[0] as { MyTable?: unknown[] }).MyTable;
    return Array.isArray(table) && table.length > 1 ? (table as Record<string, unknown>[]).slice(1) : [];
  }
  if (raw && typeof raw === "object" && "MyTable" in (raw as Record<string, unknown>)) {
    const table = (raw as { MyTable?: unknown[] }).MyTable;
    return Array.isArray(table) && table.length > 1 ? (table as Record<string, unknown>[]).slice(1) : [];
  }
  return [];
}

function keysOf(v: unknown): unknown {
  if (Array.isArray(v)) return v.length && typeof v[0] === "object" ? { _array: v.length, itemKeys: Object.keys(v[0] as object) } : `array(${v.length})`;
  if (v && typeof v === "object") return Object.keys(v as object);
  return typeof v;
}

export async function GET() {
  const out: Record<string, unknown> = {};
  try {
    const token = await authenticate();
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const todayFormatted = `${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${now.getFullYear()}`;

    // 1) Pega um numVen real do espelho
    const espelho = await uauFetch(token, "Espelho/BuscaUnidadesDeAcordoComWhereDetalhado", {
      where: "WHERE Empresa_unid = 2 AND Vendido_unid = 1", retorna_venda: true, data_tabela_preco: todayFormatted,
    }, 25000);
    const rows = extractMyTable(espelho);
    const numVen = rows.map((r) => Number(r.Num_Ven)).find((n) => n > 0) || 0;
    out.numVenAmostra = numVen;

    // 2) ConsultarResumoVenda — estrutura completa (procurar recebimentos com data)
    try {
      const resumo = await uauFetch(token, "Venda/ConsultarResumoVenda", {
        codigoObra: "01VEN", codigoEmpresa: 2, numeroVenda: numVen,
      }, 15000);
      const r0 = (Array.isArray(resumo) ? resumo[0] : resumo) as Record<string, unknown>;
      const nested: Record<string, unknown> = {};
      for (const k of Object.keys(r0 || {})) nested[k] = keysOf(r0[k]);
      out.resumoVenda = { topKeys: Object.keys(r0 || {}), detalhe: nested };
    } catch (e) {
      out.resumoVendaErro = (e instanceof Error ? e.message : String(e)).slice(0, 200);
    }

    // 3) Sonda endpoints candidatos pra parcelas recebidas/baixas com data
    const cands = [
      "Venda/BuscarParcelasRecebidas", "Venda/ConsultarParcelasRecebidas",
      "Venda/BuscarBaixasParcela", "Venda/BuscarParcelasPagas", "Venda/ConsultarBaixas",
      "Venda/ConsultarParcelasVenda", "Venda/BuscarParcelasGeral", "Financeiro/BuscarRecebimentos",
      "Boleto/ConsultarBaixas", "Venda/ConsultarExtratoVenda",
    ];
    const probes: Record<string, unknown> = {};
    for (const ep of cands) {
      try {
        const res = await uauFetch(token, ep, { empresa: 2, obra: "01VEN", codigoEmpresa: 2, codigoObra: "01VEN", numeroVenda: numVen }, 12000);
        const r0 = Array.isArray(res) ? res[0] : res;
        probes[ep] = { existe: true, amostra: keysOf(r0) };
      } catch (e) {
        probes[ep] = { existe: false, msg: (e instanceof Error ? e.message : String(e)).slice(0, 90) };
      }
    }
    out.probes = probes;
  } catch (e) {
    out.erroGeral = e instanceof Error ? e.message : String(e);
  }
  return NextResponse.json(out);
}
