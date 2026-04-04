import { NextResponse } from "next/server";
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

interface VendaInfo {
  identificador: string;
  dataVenda: string;
  valorVenda: number;
  numVen: number;
  empresa: number;
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
    if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  }
  return s;
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

    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const yyyy = now.getFullYear();
    const todayFormatted = `${mm}-${dd}-${yyyy}`;

    // Use the working endpoint (same as /api/uau/vendas)
    const [espelhoRaw, parcelasRaw] = await Promise.all([
      uauFetch(token, "Espelho/BuscaUnidadesDeAcordoComWhereDetalhado", {
        where: "WHERE Empresa_unid = 2 AND Vendido_unid = 1",
        retorna_venda: true,
        data_tabela_preco: todayFormatted,
      }, 20000),
      uauFetch(token, "Venda/BuscarParcelasAReceber", {
        empresa: 2,
      }, 20000).catch(() => null),
    ]);

    // --- Extract sold units ---
    const rows = extractMyTable(espelhoRaw);
    const baseVendas: VendaInfo[] = [];

    for (const row of rows) {
      const r = row as Record<string, unknown>;
      const id = (r.Identificador_unid as string) || "";
      if (!id) continue;

      const dataVenda = parseDate(r.DataCad_unid as string || "");
      const lote = lotesMap.get(id);
      const erpValor = Number(r.ValorTotal) || Number(r.ValPreco_unid) || 0;
      const valor = erpValor > 0 ? erpValor : (lote?.valorTotal || 0);
      const numVen = (r.Num_Ven as number) || 0;
      const empresa = (r.Empresa_unid as number) || 2;

      baseVendas.push({ identificador: id, numVen, empresa, dataVenda, valorVenda: valor });
    }

    // Enrich with ConsultarResumoVenda in batches
    const vendasComNumero = baseVendas.filter(v => v.numVen > 0);
    const resumoMap = new Map<number, Record<string, unknown>>();
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

    // Build final vendas with enriched data
    const vendas: { dataVenda: string; valorVenda: number }[] = [];
    for (const base of baseVendas) {
      const resumo = resumoMap.get(base.numVen);
      const dataVendaResumo = resumo ? parseDate(resumo.DataVenda_ven as string || resumo.DataVenda as string || "") : "";
      const dataFinal = dataVendaResumo || base.dataVenda;
      const valorFinal = Number(resumo?.ValorVenda_ven) || base.valorVenda || 0;

      vendas.push({ dataVenda: dataFinal, valorVenda: valorFinal });
    }

    const valorVendidoTotal = vendas.reduce((s, v) => s + v.valorVenda, 0);
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
    for (const p of projecoes) {
      p.inadimplenciaProjetada = percentualInadimplencia;
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

function groupByMonth(vendas: { dataVenda: string; valorVenda: number }[]): { mes: string; vendas: number; valor: number }[] {
  const map = new Map<string, { vendas: number; valor: number }>();

  for (const v of vendas) {
    if (!v.dataVenda) continue;
    const mes = v.dataVenda.substring(0, 7);
    if (!map.has(mes)) map.set(mes, { vendas: 0, valor: 0 });
    const m = map.get(mes)!;
    m.vendas++;
    m.valor += v.valorVenda;
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
