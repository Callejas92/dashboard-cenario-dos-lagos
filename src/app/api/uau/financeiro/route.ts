import { NextResponse } from "next/server";
import { authenticate, isUauConfigured, uauFetch } from "@/lib/uau-auth";

export const maxDuration = 60;

interface ParcelaRow {
  Numero_ven?: number;
  Empresa_ven?: number;
  Identificador_unid?: string;
  NumParcela?: number;
  DataVencimento?: string;
  ValorParcela?: number;
  ValorPago?: number;
  ValorRecebido?: number;
  StatusParcela?: string;
  Descr_status?: string;
  Nome_pes?: string;
  NomeCliente?: string;
  [key: string]: unknown;
}

interface VendaResumoRow {
  Numero_ven?: number;
  DataVenda_ven?: string;
  ValorVenda_ven?: number;
  Identificador_unid?: string;
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

function parseDate(raw: string): string {
  if (!raw) return "";
  if (raw.includes("T")) return raw.split("T")[0];
  if (raw.includes("/")) {
    const parts = raw.split("/");
    if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  }
  return raw;
}

// Simple in-memory cache
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function GET() {
  if (!isUauConfigured()) {
    return NextResponse.json({ error: "UAU não configurado" }, { status: 503 });
  }

  const cacheKey = "financeiro-global";
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const token = await authenticate();
    const today = new Date().toISOString().split("T")[0];

    // Fetch sales keys for last 24 months to build history
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 24);
    const startStr = startDate.toISOString().split("T")[0];

    const [chavesRaw, parcelasRaw] = await Promise.all([
      uauFetch(token, "Venda/RetornaChavesVendasPorPeriodo", {
        empresa: 2,
        dataInicial: formatDateBR(startStr),
        dataFinal: formatDateBR(today),
      }, 20000).catch(() => null),
      uauFetch(token, "Venda/BuscarParcelasAReceber", {
        empresa: 2,
      }, 20000).catch(() => null),
    ]);

    // --- Process Sales for projections ---
    let vendas: VendaResumoRow[] = [];
    if (chavesRaw) {
      const chaveRows = extractMyTable(chavesRaw);
      // Get resumos in batches
      const resumos = await batchFetchResumos(token, chaveRows);
      vendas = resumos;
    }

    const valorVendidoTotal = vendas.reduce((s, v) => s + (v.ValorVenda_ven || 0), 0);
    const qtdVendas = vendas.length;
    const ticketMedio = qtdVendas > 0 ? valorVendidoTotal / qtdVendas : 0;

    // Group sales by month
    const vendasMensais = groupByMonth(vendas);

    // Projections using weighted moving average
    const projecoes = calcProjecoes(vendasMensais);

    // --- Process Parcelas (Receivables) ---
    const parcelaRows = parcelasRaw ? extractMyTable(parcelasRaw) : [];
    const parcelas = parcelaRows.map((row) => {
      const r = row as ParcelaRow;
      const vencimento = parseDate(r.DataVencimento || "");
      const valor = r.ValorParcela || 0;
      const valorPago = r.ValorPago || r.ValorRecebido || 0;
      const isPaga = valorPago >= valor && valor > 0;
      const isVencida = !isPaga && vencimento < today && vencimento !== "";

      let diasAtraso = 0;
      if (isVencida && vencimento) {
        const diff = new Date(today).getTime() - new Date(vencimento).getTime();
        diasAtraso = Math.floor(diff / (1000 * 60 * 60 * 24));
      }

      return {
        chaveVenda: `${r.Empresa_ven || 2}-${r.Numero_ven}`,
        identificadorUnidade: r.Identificador_unid || "",
        numeroParcela: r.NumParcela || 0,
        dataVencimento: vencimento,
        valor,
        valorPago,
        status: isPaga ? "paga" as const : isVencida ? "vencida" as const : "em_dia" as const,
        diasAtraso,
        clienteNome: r.Nome_pes || r.NomeCliente || "",
      };
    });

    // Inadimplência summary
    const vencidas = parcelas.filter((p) => p.status === "vencida");
    const emDia = parcelas.filter((p) => p.status === "em_dia");
    const pagas = parcelas.filter((p) => p.status === "paga");

    const totalVencido = vencidas.reduce((s, p) => s + (p.valor - p.valorPago), 0);
    const totalEmDia = emDia.reduce((s, p) => s + p.valor, 0);
    const totalPago = pagas.reduce((s, p) => s + p.valorPago, 0);

    const clientesInadimplentes = new Set(vencidas.map((p) => p.chaveVenda));
    const totalRecebiveis = totalVencido + totalEmDia;
    const percentualInadimplencia = totalRecebiveis > 0 ? (totalVencido / totalRecebiveis) * 100 : 0;

    // Add inadimplência projection to projecoes
    const inadimRate = percentualInadimplencia;
    for (const p of projecoes) {
      p.inadimplenciaProjetada = inadimRate;
    }

    const response = {
      valorVendidoTotal,
      ticketMedio,
      qtdVendas,
      inadimplencia: {
        totalVencido,
        totalEmDia,
        totalPago,
        qtdParcelasVencidas: vencidas.length,
        qtdClientesInadimplentes: clientesInadimplentes.size,
        percentualInadimplencia,
      },
      parcelasAReceber: parcelas.filter((p) => p.status !== "paga").sort((a, b) => b.diasAtraso - a.diasAtraso),
      projecoes,
      vendasMensais,
    };

    cache.set(cacheKey, { data: response, timestamp: Date.now() });
    return NextResponse.json(response);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("UAU Financeiro API error:", errMsg);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

async function batchFetchResumos(token: string, chaveRows: Record<string, unknown>[]): Promise<VendaResumoRow[]> {
  const results: VendaResumoRow[] = [];
  const concurrency = 5;

  for (let i = 0; i < chaveRows.length; i += concurrency) {
    const batch = chaveRows.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(async (chave) => {
        const raw = await uauFetch(token, "Venda/ConsultarResumoVenda", {
          empresa: (chave as Record<string, unknown>).Empresa_ven || 2,
          numero: (chave as Record<string, unknown>).Numero_ven,
        }, 10000);
        return { raw };
      })
    );

    for (const r of batchResults) {
      if (r.status === "fulfilled") {
        const rows = extractMyTable(r.value.raw);
        if (rows.length > 0) {
          for (const row of rows) results.push(row as VendaResumoRow);
        } else {
          const direct = r.value.raw as VendaResumoRow;
          if (direct?.Numero_ven) results.push(direct);
        }
      }
    }
  }

  return results;
}

function groupByMonth(vendas: VendaResumoRow[]): { mes: string; vendas: number; valor: number }[] {
  const map = new Map<string, { vendas: number; valor: number }>();

  for (const v of vendas) {
    const dataRaw = v.DataVenda_ven || "";
    const data = parseDate(dataRaw);
    if (!data) continue;
    const mes = data.substring(0, 7); // YYYY-MM
    if (!map.has(mes)) map.set(mes, { vendas: 0, valor: 0 });
    const m = map.get(mes)!;
    m.vendas++;
    m.valor += v.ValorVenda_ven || 0;
  }

  return Array.from(map.entries())
    .map(([mes, vals]) => ({ mes, ...vals }))
    .sort((a, b) => a.mes.localeCompare(b.mes));
}

function calcProjecoes(vendasMensais: { mes: string; vendas: number; valor: number }[]) {
  const recent = vendasMensais.slice(-6);
  if (recent.length === 0) {
    return [1, 3, 6, 12].map((m) => ({
      periodo: `${m} ${m === 1 ? "mes" : "meses"}`,
      meses: m,
      vendasProjetadasValor: 0,
      lotesProjetados: 0,
      inadimplenciaProjetada: 0,
    }));
  }

  const weights = [1, 1.5, 2, 2.5, 3, 4].slice(-recent.length);
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  const avgVendas = recent.reduce((sum, m, i) => sum + m.vendas * weights[i], 0) / totalWeight;
  const avgValor = recent.reduce((sum, m, i) => sum + m.valor * weights[i], 0) / totalWeight;

  return [1, 3, 6, 12].map((months) => ({
    periodo: `${months} ${months === 1 ? "mes" : "meses"}`,
    meses: months,
    vendasProjetadasValor: Math.round(avgValor * months),
    lotesProjetados: Math.round(avgVendas * months),
    inadimplenciaProjetada: 0,
  }));
}

function formatDateBR(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}
