import { NextResponse } from "next/server";
import { authenticate, isUauConfigured, uauFetch } from "@/lib/uau-auth";
import lotesData from "@/data/lotes.json";
import investorData from "@/data/investor-lots.json";

const INVESTOR_LOTS = new Set<string>(investorData.lots);

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
  // Campos reais retornados por Venda/BuscarParcelasAReceber
  Empresa_prc?: number;
  Obra_Prc?: string;
  NumVend_prc?: number;       // → cruzar com Espelho.Num_Ven pra pegar lote
  NumParc_Prc?: number;
  NumParcGer_Prc?: number;
  Data_Prc?: string;          // data de vencimento (ISO)
  Valor_Prc?: number;
  Status_Prc?: number;        // 0 = aberta/a receber (não pago)
  Tipo_Prc?: string;          // P = Principal, E = Entrada, B = Balão, S = Sinal
  Cliente_Prc?: number;       // código pessoa
  DataPror_Prc?: string;      // data prorrogada (se houve)
  JurosParc_Prc?: number;
  [key: string]: unknown;
}

interface VendaInfo {
  identificador: string;
  dataVenda: string;
  valorVenda: number;
  numVen: number;
  empresa: number;
  obra: string;
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
      // IMPORTANTE: precisa de obra="01VEN", sem isso retorna só schema (vazio)
      uauFetch(token, "Venda/BuscarParcelasAReceber", {
        empresa: 2,
        obra: "01VEN",
      }, 30000).catch(() => null),
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
      const obra = (r.Obra_unid as string) || "01VEN";

      baseVendas.push({ identificador: id, numVen, empresa, obra, dataVenda, valorVenda: valor });
    }

    // Enrich with ConsultarResumoVenda in batches
    const vendasComNumero = baseVendas.filter(v => v.numVen > 0);
    const resumoMap = new Map<number, Record<string, unknown>>();
    const concurrency = 5;

    for (let i = 0; i < vendasComNumero.length; i += concurrency) {
      const batch = vendasComNumero.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        batch.map(async (v) => {
          // API UAU atualizada: codigoObra, codigoEmpresa, numeroVenda
          const res = await uauFetch(token, "Venda/ConsultarResumoVenda", {
            codigoObra: v.obra,
            codigoEmpresa: v.empresa,
            numeroVenda: v.numVen,
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

    // Build final vendas with enriched data (excluindo lotes do investidor)
    const vendas: { dataVenda: string; valorVenda: number }[] = [];
    let vendasInvestidor = 0;
    let valorInvestidor = 0;
    for (const base of baseVendas) {
      const resumo = resumoMap.get(base.numVen);
      const dataVendaResumo = resumo ? parseDate(resumo.DataVenda_ven as string || resumo.DataVenda as string || "") : "";
      const dataFinal = dataVendaResumo || base.dataVenda;
      const valorFinal = Number(resumo?.ValorVenda_ven) || base.valorVenda || 0;

      if (INVESTOR_LOTS.has(base.identificador)) {
        vendasInvestidor++;
        valorInvestidor += valorFinal;
        continue;
      }

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
    // BuscarParcelasAReceber retorna APENAS parcelas em aberto (Status_Prc=0).
    // O response é array direto: [schema, ...dados]. extractMyTable não pega esse formato.
    // Filtra schema row (que tem valores string tipo "System.Int16, mscorlib, ...").
    const rawParcelas: ParcelaRow[] = Array.isArray(parcelasRaw) ? (parcelasRaw as ParcelaRow[]) : [];
    const parcelaRows = rawParcelas.filter((r) => {
      // Schema row tem strings tipo "System.Int16, mscorlib..." em vez de número
      return typeof r.Empresa_prc === "number" && r.Valor_Prc !== undefined;
    });

    // Mapeia NumVend_prc → IdentificadorUnid pra excluir lotes do investidor + ter o lote
    const ventoLote = new Map<number, string>();
    for (const base of baseVendas) {
      if (base.numVen > 0) ventoLote.set(base.numVen, base.identificador);
    }

    const parcelas = parcelaRows.map((r) => {
      // Vencimento: usa DataPror_Prc (data prorrogada) se existe, senão Data_Prc
      const vencimento = parseDate((r.DataPror_Prc || r.Data_Prc) as string || "");
      const valor = Number(r.Valor_Prc) || 0;
      // BuscarParcelasAReceber só traz não-pagas → valorPago = 0
      const valorPago = 0;
      const isVencida = vencimento < today && vencimento !== "";

      let diasAtraso = 0;
      if (isVencida && vencimento) {
        const diff = new Date(today).getTime() - new Date(vencimento).getTime();
        diasAtraso = Math.floor(diff / (1000 * 60 * 60 * 24));
      }

      const numVend = Number(r.NumVend_prc) || 0;
      const identificadorUnidade = ventoLote.get(numVend) || "";

      return {
        chaveVenda: `${r.Empresa_prc || 2}-${numVend}`,
        identificadorUnidade,
        numeroParcela: Number(r.NumParc_Prc) || 0,
        dataVencimento: vencimento,
        valor,
        valorPago,
        status: isVencida ? "vencida" as const : "em_dia" as const,
        diasAtraso,
        tipoParcela: String(r.Tipo_Prc || ""), // P, E, B, S
        clienteCodigo: Number(r.Cliente_Prc) || 0,
        clienteNome: "", // não vem no endpoint — precisaria de outro lookup
      };
    })
    // Exclui parcelas de lotes do investidor (Tio Ico)
    .filter((p) => !p.identificadorUnidade || !INVESTOR_LOTS.has(p.identificadorUnidade));

    // Inadimplência summary
    // BuscarParcelasAReceber retorna SÓ parcelas em aberto (não pagas)
    // → totalPago não é calculável aqui sem endpoint adicional
    const vencidas = parcelas.filter((p) => p.status === "vencida");
    const emDia = parcelas.filter((p) => p.status === "em_dia");

    const totalVencido = vencidas.reduce((s, p) => s + p.valor, 0);
    const totalEmDia = emDia.reduce((s, p) => s + p.valor, 0);
    const totalPago = 0; // endpoint só traz não-pagas

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
      // Vendas do investidor (excluídas - Tio Ico)
      investidor: {
        quantidade: vendasInvestidor,
        valorTotal: valorInvestidor,
        lotesNaLista: INVESTOR_LOTS.size,
      },
      inadimplencia: {
        totalVencido,
        totalEmDia,
        totalPago,
        qtdParcelasVencidas: vencidas.length,
        qtdClientesInadimplentes: clientesInadimplentes.size,
        percentualInadimplencia,
      },
      parcelasAReceber: parcelas.sort((a, b) => b.diasAtraso - a.diasAtraso),
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
