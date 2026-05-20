// Debug: inspeciona parcelas vencidas + resumo de vendas (valor tabela vs valor venda)
import { NextResponse } from "next/server";
import { authenticate, isUauConfigured, uauFetch } from "@/lib/uau-auth";
import lotesData from "@/data/lotes.json";
import investorData from "@/data/investor-lots.json";

export const maxDuration = 60;

interface LoteStatic { id: string; valorTotal: number; valorM2: number; area: number; }
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

function parseDate(s: unknown): string {
  if (!s) return "";
  const str = String(s);
  if (str.includes("T")) return str.split("T")[0];
  return str;
}

export async function GET() {
  if (!isUauConfigured()) return NextResponse.json({ error: "UAU não configurado" }, { status: 503 });

  const token = await authenticate();
  const today = new Date().toISOString().split("T")[0];
  const now = new Date();
  const todayFormatted = `${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}-${now.getFullYear()}`;

  // 1) Pega vendas + parcelas
  const [espelhoRaw, parcelasRaw] = await Promise.all([
    uauFetch(token, "Espelho/BuscaUnidadesDeAcordoComWhereDetalhado", {
      where: "WHERE Empresa_unid = 2 AND Vendido_unid = 1",
      retorna_venda: true,
      data_tabela_preco: todayFormatted,
    }, 20000),
    uauFetch(token, "Venda/BuscarParcelasAReceber", { empresa: 2, obra: "01VEN" }, 30000),
  ]);

  const rows = extractMyTable(espelhoRaw);
  const baseVendas: { id: string; numVen: number; obra: string; empresa: number; dataCad: string; valTabela: number; valorERP: number }[] = [];
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const id = (r.Identificador_unid as string) || "";
    if (!id) continue;
    const lote = lotesMap.get(id);
    baseVendas.push({
      id,
      numVen: (r.Num_Ven as number) || 0,
      obra: (r.Obra_unid as string) || "01VEN",
      empresa: (r.Empresa_unid as number) || 2,
      dataCad: parseDate(r.DataCad_unid),
      valTabela: lote?.valorTotal || 0,
      valorERP: Number(r.ValorTotal) || Number(r.ValPreco_unid) || 0,
    });
  }

  // 2) Enriquece com ConsultarResumoVenda pra cada venda (pega ValorVenda + DataVenda)
  const resumoMap = new Map<number, Record<string, unknown>>();
  const conc = 10;
  for (let i = 0; i < baseVendas.length; i += conc) {
    const batch = baseVendas.slice(i, i + conc).filter((v) => v.numVen > 0);
    const results = await Promise.allSettled(
      batch.map(async (v) => {
        const res = await uauFetch(token, "Venda/ConsultarResumoVenda", {
          codigoObra: v.obra, codigoEmpresa: v.empresa, numeroVenda: v.numVen,
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

  // 3) Inspeciona TODOS os campos disponíveis no resumo (primeira venda)
  let resumoSample: { numVen: number; fields: string[]; data: Record<string, unknown> } | null = null;
  for (const v of baseVendas) {
    const resumo = resumoMap.get(v.numVen);
    if (resumo) {
      resumoSample = { numVen: v.numVen, fields: Object.keys(resumo), data: resumo };
      break;
    }
  }

  // 4) Cruza vendas com tabela (desconto/acréscimo)
  const vendasComDesconto: { id: string; numVen: number; dataVenda: string; valTabela: number; valorVenda: number; diff: number; pct: number }[] = [];
  for (const v of baseVendas) {
    if (INVESTOR.has(v.id)) continue;
    const resumo = resumoMap.get(v.numVen);
    const valorVenda = Number(resumo?.ValorVenda_ven || resumo?.ValorVenda) || v.valorERP || 0;
    const valTabela = v.valTabela || v.valorERP;
    const diff = valorVenda - valTabela;
    const pct = valTabela > 0 ? (diff / valTabela) * 100 : 0;
    vendasComDesconto.push({
      id: v.id, numVen: v.numVen,
      dataVenda: parseDate(resumo?.DataVenda_ven || resumo?.DataVenda || v.dataCad),
      valTabela, valorVenda, diff, pct,
    });
  }
  vendasComDesconto.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  // 5) Parcelas vencidas com lookup de venda
  const parcelas: Record<string, unknown>[] = Array.isArray(parcelasRaw) ? (parcelasRaw as Record<string, unknown>[]) : [];
  const ventoLote = new Map<number, string>();
  for (const v of baseVendas) if (v.numVen > 0) ventoLote.set(v.numVen, v.id);

  const vencidasDetalhe: { lote: string; numVen: number; parc: number; tipo: string; venc: string; valor: number; dias: number; investidor: boolean }[] = [];
  for (const p of parcelas) {
    if (typeof p.Empresa_prc !== "number") continue; // skip schema row
    const venc = parseDate(p.DataPror_Prc || p.Data_Prc);
    if (!venc || venc >= today) continue; // só vencidas
    const numVen = Number(p.NumVend_prc) || 0;
    const lote = ventoLote.get(numVen) || "?";
    const dias = Math.floor((new Date(today).getTime() - new Date(venc).getTime()) / 86400000);
    vencidasDetalhe.push({
      lote, numVen,
      parc: Number(p.NumParc_Prc) || 0,
      tipo: String(p.Tipo_Prc || ""),
      venc, valor: Number(p.Valor_Prc) || 0, dias,
      investidor: INVESTOR.has(lote),
    });
  }
  vencidasDetalhe.sort((a, b) => b.dias - a.dias);

  return NextResponse.json({
    totalVendas: baseVendas.length,
    totalParcelas: parcelas.filter((p) => typeof p.Empresa_prc === "number").length,
    resumoSample,
    vendasComDesconto: vendasComDesconto.slice(0, 30),
    vencidas: vencidasDetalhe,
  });
}
