import { NextRequest, NextResponse } from "next/server";
import { authenticate, isUauConfigured, uauFetch } from "@/lib/uau-auth";
import lotesData from "@/data/lotes.json";

export const maxDuration = 60;

interface LoteStatic {
  id: string;
  quadra: number;
  lote: number;
  area: number;
  rua: string;
  valorTotal: number;
  valorM2: number;
  classificacao: string;
}

const lotesMap = new Map<string, LoteStatic>();
for (const l of lotesData as LoteStatic[]) {
  lotesMap.set(l.id, l);
}

interface UnitRow {
  Identificador_unid?: string;
  Vendido_unid?: number;
  Descr_status?: string;
  DataCad_unid?: string;
  DataVenda_unid?: string;
  DataVenda?: string;
  Numero_ven?: number;
  Empresa_ven?: number;
  Nome_pes?: string;
  Nome_Corretor?: string;
  NomeCorretor?: string;
  Corretor_ven?: string;
  CpfCnpj_pes?: string;
  Descr_FormaPgto?: string;
  FormaPagamento?: string;
  ValorVenda_ven?: number;
  ValorTotal_unid?: number;
  [key: string]: unknown;
}

function extractMyTable(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw) && raw.length > 0 && raw[0]?.MyTable) {
    const table = raw[0].MyTable;
    return Array.isArray(table) && table.length > 1 ? table.slice(1) : [];
  }
  if (raw && typeof raw === "object" && "MyTable" in (raw as Record<string, unknown>)) {
    const table = (raw as Record<string, unknown>).MyTable;
    return Array.isArray(table) && table.length > 1 ? (table as Record<string, unknown>[]).slice(1) : [];
  }
  return [];
}

function parseDate(raw: string | undefined | null): string {
  if (!raw) return "";
  const s = String(raw);
  if (s.includes("T")) return s.split("T")[0];
  if (s.includes("/")) {
    const parts = s.split("/");
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    }
  }
  return s;
}

// Simple in-memory cache
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  if (!isUauConfigured()) {
    return NextResponse.json({ error: "UAU não configurado" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate") || getDefaultStartDate();
  const endDate = searchParams.get("endDate") || getToday();

  const cacheKey = `vendas-${startDate}-${endDate}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const token = await authenticate();

    // Use the same endpoint that works for estoque, but filter sold units
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const yyyy = now.getFullYear();
    const todayFormatted = `${mm}-${dd}-${yyyy}`;

    const raw = await uauFetch(token, "Espelho/BuscaUnidadesDeAcordoComWhereDetalhado", {
      where: "WHERE Empresa_unid = 2 AND Vendido_unid = 1",
      retorna_venda: true,
      data_tabela_preco: todayFormatted,
    }, 20000);

    const rows = extractMyTable(raw);

    // Parse sold units and enrich with sale details
    const vendas: Array<{
      chaveVenda: string;
      identificadorUnidade: string;
      dataVenda: string;
      valorVenda: number;
      compradorNome: string;
      compradorCpfCnpj: string;
      corretor: string;
      formaPagamento: string;
      qtdParcelas: number;
    }> = [];

    // Build base vendas from espelho data
    interface BaseVenda {
      id: string;
      numVen: number;
      empresa: number;
      dataVenda: string;
      valorVenda: number;
    }
    const baseVendas: BaseVenda[] = [];

    for (const row of rows) {
      const r = row as UnitRow;
      const id = r.Identificador_unid || "";
      if (!id) continue;

      const dataVenda = parseDate(r.DataCad_unid as string || "");
      const lote = lotesMap.get(id);
      const erpValor = Number(r.ValorTotal) || Number(r.ValPreco_unid) || 0;
      const valor = erpValor > 0 ? erpValor : (lote?.valorTotal || 0);
      const numVen = (r.Num_Ven as number) || 0;
      const empresa = (r.Empresa_unid as unknown as number) || 2;

      baseVendas.push({ id, numVen, empresa, dataVenda, valorVenda: valor });
    }

    // Enrich with ConsultarResumoVenda for each sale that has Num_Ven
    const vendasComNumero = baseVendas.filter(v => v.numVen > 0);
    const resumoMap = new Map<number, Record<string, unknown>>();

    // Batch fetch resumos
    const concurrency = 5;
    for (let i = 0; i < vendasComNumero.length; i += concurrency) {
      const batch = vendasComNumero.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        batch.map(async (v) => {
          const res = await uauFetch(token, "Venda/ConsultarResumoVenda", {
            empresa: v.empresa,
            numero: v.numVen,
          }, 10000);
          return { numVen: v.numVen, raw: res };
        })
      );
      for (const r of results) {
        if (r.status === "fulfilled") {
          const resumoRows = extractMyTable(r.value.raw);
          if (resumoRows.length > 0) {
            resumoMap.set(r.value.numVen, resumoRows[0]);
          } else if (r.value.raw && typeof r.value.raw === "object") {
            resumoMap.set(r.value.numVen, r.value.raw as Record<string, unknown>);
          }
        }
      }
    }

    // Merge base data with resumo data
    for (const base of baseVendas) {
      const resumo = resumoMap.get(base.numVen);
      const dataVendaResumo = resumo ? parseDate(resumo.DataVenda_ven as string || resumo.DataVenda as string || "") : "";
      const dataFinal = dataVendaResumo || base.dataVenda;

      // Filter by date range
      if (dataFinal && dataFinal < startDate) continue;
      if (dataFinal && dataFinal > endDate) continue;

      vendas.push({
        chaveVenda: `${base.empresa}-${base.numVen || base.id}`,
        identificadorUnidade: base.id,
        dataVenda: dataFinal,
        valorVenda: Number(resumo?.ValorVenda_ven) || base.valorVenda || 0,
        compradorNome: (resumo?.Nome_pes as string) || "",
        compradorCpfCnpj: (resumo?.CpfCnpj_pes as string) || "",
        corretor: (resumo?.NomeCorretor as string) || (resumo?.Nome_Corretor as string) || (resumo?.Corretor_ven as string) || "",
        formaPagamento: (resumo?.Descr_FormaPgto as string) || (resumo?.FormaPagamento as string) || "",
        qtdParcelas: (resumo?.QtdParcelas as number) || 0,
      });
    }

    // Sort by date
    vendas.sort((a, b) => a.dataVenda.localeCompare(b.dataVenda));

    // Aggregate by day
    const dayMap = new Map<string, { quantidade: number; valorTotal: number }>();
    for (const v of vendas) {
      if (!v.dataVenda) continue;
      const day = v.dataVenda;
      if (!dayMap.has(day)) dayMap.set(day, { quantidade: 0, valorTotal: 0 });
      const d = dayMap.get(day)!;
      d.quantidade++;
      d.valorTotal += v.valorVenda;
    }

    const porDia = Array.from(dayMap.entries())
      .map(([data, vals]) => ({ data, ...vals }))
      .sort((a, b) => a.data.localeCompare(b.data));

    const valorTotal = vendas.reduce((sum, v) => sum + v.valorVenda, 0);

    const response = {
      vendas,
      porDia,
      total: vendas.length,
      valorTotal,
      periodo: { inicio: startDate, fim: endDate },
      _debug: {
        totalRowsFromERP: rows.length,
        sampleFields: rows.length > 0 ? Object.keys(rows[0]) : [],
      },
    };

    cache.set(cacheKey, { data: response, timestamp: Date.now() });
    return NextResponse.json(response);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("UAU Vendas API error:", errMsg);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

function getToday(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

function getDefaultStartDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().split("T")[0];
}
