// Debug: compara valor Tabela UAU vs Contrato Eggs vs Total a Pagar UAU, lote por lote
import { NextResponse } from "next/server";
import { authenticate, isUauConfigured, uauFetch } from "@/lib/uau-auth";
import { getContratosEggs } from "@/lib/eggs-contratos";
import lotesData from "@/data/lotes.json";
import investorData from "@/data/investor-lots.json";

export const maxDuration = 60;

interface LoteStatic { id: string; valorTotal: number; }
const lotesMap = new Map<string, LoteStatic>();
for (const l of lotesData as LoteStatic[]) lotesMap.set(l.id, l);
const INVESTOR = new Set<string>(investorData.lots);

function extractMyTable(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw) && raw.length > 0 && (raw[0] as { MyTable?: unknown[] }).MyTable) {
    const t = (raw[0] as { MyTable: unknown[] }).MyTable;
    return Array.isArray(t) && t.length > 1 ? (t as Record<string, unknown>[]).slice(1) : [];
  }
  return [];
}

export async function GET() {
  if (!isUauConfigured()) return NextResponse.json({ error: "UAU não configurado" }, { status: 503 });
  const token = await authenticate();
  const now = new Date();
  const td = `${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}-${now.getFullYear()}`;

  const [espelhoRaw, contratos] = await Promise.all([
    uauFetch(token, "Espelho/BuscaUnidadesDeAcordoComWhereDetalhado", {
      where: "WHERE Empresa_unid = 2 AND Vendido_unid = 1",
      retorna_venda: true,
      data_tabela_preco: td,
    }, 20000),
    getContratosEggs().catch(() => []),
  ]);

  const rows = extractMyTable(espelhoRaw);
  const baseVendas: { id: string; numVen: number; obra: string; emp: number; valorERPTotal: number; valorERPPreco: number }[] = [];
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const id = (r.Identificador_unid as string) || "";
    if (!id || INVESTOR.has(id)) continue;
    baseVendas.push({
      id,
      numVen: (r.Num_Ven as number) || 0,
      obra: (r.Obra_unid as string) || "01VEN",
      emp: (r.Empresa_unid as number) || 2,
      valorERPTotal: Number(r.ValorTotal) || 0,
      valorERPPreco: Number(r.ValPreco_unid) || 0,
    });
  }

  // ConsultarResumoVenda batch (pega totalAPagarComDesconto)
  const resumoMap = new Map<number, Record<string, unknown>>();
  for (let i = 0; i < baseVendas.length; i += 10) {
    const batch = baseVendas.slice(i, i + 10).filter((v) => v.numVen > 0);
    const results = await Promise.allSettled(
      batch.map(async (v) => {
        const res = await uauFetch(token, "Venda/ConsultarResumoVenda", {
          codigoObra: v.obra, codigoEmpresa: v.emp, numeroVenda: v.numVen,
        }, 10000);
        return { numVen: v.numVen, raw: res };
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled") {
        const t = extractMyTable(r.value.raw);
        if (t.length > 0) resumoMap.set(r.value.numVen, t[0]);
        else if (r.value.raw && typeof r.value.raw === "object") {
          resumoMap.set(r.value.numVen, r.value.raw as Record<string, unknown>);
        }
      }
    }
  }

  const contratoPorLote = new Map<string, { valor: number; status: string }>();
  for (const c of contratos) {
    if (c.cancelado) continue;
    contratoPorLote.set(c.loteId, { valor: c.valor, status: c.status });
  }

  // Combina tudo
  const linhas = baseVendas.map((v) => {
    const resumo = resumoMap.get(v.numVen);
    const eggs = contratoPorLote.get(v.id);
    const valorTabelaERP = v.valorERPTotal || v.valorERPPreco || lotesMap.get(v.id)?.valorTotal || 0;
    const totalAPagar = Number(resumo?.totalAPagarComDesconto) || 0;
    const valorEggs = eggs?.valor || 0;
    return {
      lote: v.id,
      tabelaERP: valorTabelaERP,
      eggsContrato: valorEggs,
      totalAPagarUAU: totalAPagar,
      diffEggsVsTabela: valorEggs - valorTabelaERP,
      pctDiff: valorTabelaERP > 0 ? ((valorEggs - valorTabelaERP) / valorTabelaERP) * 100 : 0,
      diffTotalVsEggs: totalAPagar - valorEggs,
      eggsStatus: eggs?.status || "(sem contrato Eggs)",
    };
  });

  linhas.sort((a, b) => Math.abs(b.pctDiff) - Math.abs(a.pctDiff));

  const totals = linhas.reduce((acc, l) => ({
    tabela: acc.tabela + l.tabelaERP,
    eggs: acc.eggs + l.eggsContrato,
    totalAPagar: acc.totalAPagar + l.totalAPagarUAU,
  }), { tabela: 0, eggs: 0, totalAPagar: 0 });

  return NextResponse.json({ totals, linhas });
}
