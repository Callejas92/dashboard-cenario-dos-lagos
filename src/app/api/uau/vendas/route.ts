import { NextRequest, NextResponse } from "next/server";
import { authenticate, isUauConfigured, uauFetch } from "@/lib/uau-auth";

export const maxDuration = 60;

interface VendaChave {
  Empresa_ven?: number;
  Numero_ven?: number;
  [key: string]: unknown;
}

interface ResumoVenda {
  Numero_ven?: number;
  DataVenda_ven?: string;
  ValorVenda_ven?: number;
  Identificador_unid?: string;
  Nome_pes?: string;
  CpfCnpj_pes?: string;
  Corretor_ven?: string;
  NomeCorretor?: string;
  Nome_Corretor?: string;
  Descr_FormaPgto?: string;
  FormaPagamento?: string;
  QtdParcelas?: number;
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

async function batchProcess<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map(processor));
    for (const r of batchResults) {
      if (r.status === "fulfilled") results.push(r.value);
    }
  }
  return results;
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

    // 1. Get sale keys by period
    const chavesRaw = await uauFetch(token, "Venda/RetornaChavesVendasPorPeriodo", {
      empresa: 2,
      dataInicial: formatDateBR(startDate),
      dataFinal: formatDateBR(endDate),
    }, 20000);

    const chavesRows = extractMyTable(chavesRaw);

    if (chavesRows.length === 0) {
      const emptyResponse = {
        vendas: [],
        porDia: [],
        total: 0,
        valorTotal: 0,
        periodo: { inicio: startDate, fim: endDate },
      };
      cache.set(cacheKey, { data: emptyResponse, timestamp: Date.now() });
      return NextResponse.json(emptyResponse);
    }

    const chaves: VendaChave[] = chavesRows as VendaChave[];

    // 2. Get details for each sale (batch of 5)
    const resumos = await batchProcess(
      chaves,
      async (chave) => {
        const raw = await uauFetch(token, "Venda/ConsultarResumoVenda", {
          empresa: chave.Empresa_ven || 2,
          numero: chave.Numero_ven,
        }, 10000);
        return { chave, raw };
      },
      5
    );

    // 3. Parse sales data
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

    for (const { chave, raw } of resumos) {
      const rows = extractMyTable(raw);
      if (rows.length === 0) {
        // Try direct object response
        const directData = raw as ResumoVenda;
        if (directData && directData.Numero_ven) {
          vendas.push(parseSaleRecord(chave, directData));
          continue;
        }
        continue;
      }
      for (const row of rows) {
        const r = row as ResumoVenda;
        vendas.push(parseSaleRecord(chave, r));
      }
    }

    // Sort by date
    vendas.sort((a, b) => a.dataVenda.localeCompare(b.dataVenda));

    // Aggregate by day
    const dayMap = new Map<string, { quantidade: number; valorTotal: number }>();
    for (const v of vendas) {
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
    };

    cache.set(cacheKey, { data: response, timestamp: Date.now() });
    return NextResponse.json(response);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("UAU Vendas API error:", errMsg);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

function parseSaleRecord(chave: VendaChave, r: ResumoVenda) {
  const dataRaw = r.DataVenda_ven || "";
  let dataVenda = "";
  if (dataRaw.includes("T")) {
    dataVenda = dataRaw.split("T")[0];
  } else if (dataRaw.includes("/")) {
    const parts = dataRaw.split("/");
    if (parts.length === 3) {
      dataVenda = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    }
  } else {
    dataVenda = dataRaw;
  }

  return {
    chaveVenda: `${chave.Empresa_ven || 2}-${chave.Numero_ven}`,
    identificadorUnidade: r.Identificador_unid || "",
    dataVenda,
    valorVenda: r.ValorVenda_ven || 0,
    compradorNome: r.Nome_pes || "",
    compradorCpfCnpj: r.CpfCnpj_pes || "",
    corretor: r.NomeCorretor || r.Nome_Corretor || r.Corretor_ven || "",
    formaPagamento: r.Descr_FormaPgto || r.FormaPagamento || "",
    qtdParcelas: r.QtdParcelas || 0,
  };
}

function formatDateBR(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
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
