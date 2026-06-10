import { NextResponse, after } from "next/server";
import { salvarSnapshotInadimplencia } from "@/lib/inadimplencia-historico";
import { authenticate, isUauConfigured, uauFetch } from "@/lib/uau-auth";
import { getContratosEggs } from "@/lib/eggs-contratos";
import { getBonusComoCustoMensal } from "@/lib/bonus";
import { COMISSAO_TOTAL_PCT } from "@/lib/constants/negocio";
import lotesData from "@/data/lotes.json";
import { getInvestorLots } from "@/lib/investor-lots";

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

  const INVESTOR_LOTS = await getInvestorLots();

  try {
    const token = await authenticate();
    const today = new Date().toISOString().split("T")[0];

    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const yyyy = now.getFullYear();
    const todayFormatted = `${mm}-${dd}-${yyyy}`;

    // Use the working endpoint (same as /api/uau/vendas) + contratos Eggs pra valor de contrato
    // + comissões pagas (do blob de bonus) pra incluir no fluxo de caixa
    const [espelhoRaw, parcelasRaw, contratos, comissoes] = await Promise.all([
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
      // Eggs Contratos: valor de venda contratado (com desconto, sem juros do parcelamento)
      getContratosEggs().catch(() => []),
      // Bônus pagos (lançamentos no blob bonus-payments.json)
      getBonusComoCustoMensal("2026-01-01", "2030-12-31").catch(() => ({ totalPago: 0, detalhes: [] })),
    ]);

    // Map loteId → contrato Eggs (pra puxar valor de contrato)
    const contratoPorLote = new Map<string, { valor: number; cliente: string; corretor: string; cancelado: boolean; status: string }>();
    for (const c of contratos) {
      if (c.cancelado) continue;
      contratoPorLote.set(c.loteId, {
        valor: c.valor,
        cliente: c.cliente,
        corretor: c.corretor?.nome || "",
        cancelado: c.cancelado,
        status: c.status,
      });
    }

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
    // Hierarquia de valores:
    //  1. valorContrato (Eggs Contrato): valor efetivamente contratado (com desconto, sem juros) ← FONTE DE VERDADE
    //  2. valorTabela: preço da unidade pela tabela (do espelho UAU)
    //  3. totalAPagar: valor que o cliente vai desembolsar com juros do financiamento (UAU)
    const vendas: {
      dataVenda: string;
      valorVenda: number;          // = valorContrato (Eggs)
      valorTabela: number;
      totalAPagar: number;
      valorRecebido: number;
      saldoDevedor: number;
      valorPrincipal: number;      // = capital sem juros (= ERP "líquido")
      desconto: number;
      pctDesconto: number;
      jurosFin: number;
      qtdVendasComJuros: number;
    }[] = [];
    let vendasInvestidor = 0;
    let valorInvestidor = 0;
    for (const base of baseVendas) {
      const resumo = resumoMap.get(base.numVen);
      const dataVendaResumo = resumo ? parseDate(resumo.DataVenda_ven as string || resumo.DataVenda as string || "") : "";
      const dataFinal = dataVendaResumo || base.dataVenda;

      const contratoEggs = contratoPorLote.get(base.identificador);
      const valorTabela = base.valorVenda || 0;

      // totaisareceber traz a SEPARAÇÃO entre principal e juros do financiamento
      const totaisAR = resumo?.totaisareceber as { valorSaldoDevedor?: number; valorPrincipal?: number; valorJuros?: number }[] | undefined;
      const totaisRec = resumo?.totaisrecebido as { valorTotalRecebido?: number }[] | undefined;
      const ar0 = Array.isArray(totaisAR) && totaisAR.length > 0 ? totaisAR[0] : null;
      const rec0 = Array.isArray(totaisRec) && totaisRec.length > 0 ? totaisRec[0] : null;

      const valorPrincipal = Number(ar0?.valorPrincipal) || 0;       // valor sem juros (capital)
      const jurosFin = Number(ar0?.valorJuros) || 0;                  // juros do financiamento
      const saldoDevedor = Number(ar0?.valorSaldoDevedor) || 0;       // = principal + juros (ainda em aberto)
      const valorRecebido = Number(rec0?.valorTotalRecebido) || 0;    // já pago

      // Total a pagar c/juros = saldoDevedor + valorRecebido (= total bruto da venda)
      const totalAPagar = saldoDevedor + valorRecebido || Number(resumo?.totalAPagarComDesconto) || valorTabela;

      // Prioridade pra "valor de venda": Eggs Contrato > principal UAU > tabela
      const valorVenda = contratoEggs?.valor || valorPrincipal || valorTabela;

      const desconto = valorTabela - valorVenda;
      const pctDesconto = valorTabela > 0 ? (desconto / valorTabela) * 100 : 0;

      if (INVESTOR_LOTS.has(base.identificador)) {
        vendasInvestidor++;
        valorInvestidor += valorVenda;
        continue;
      }

      vendas.push({
        dataVenda: dataFinal,
        valorVenda, valorTabela, totalAPagar,
        valorRecebido, saldoDevedor,
        valorPrincipal,
        desconto, pctDesconto,
        jurosFin,
        qtdVendasComJuros: jurosFin > 0 ? 1 : 0,
      });
    }

    const valorVendidoTotal = vendas.reduce((s, v) => s + v.valorVenda, 0);
    const valorTabelaTotal = vendas.reduce((s, v) => s + v.valorTabela, 0);
    const totalAPagarTotal = vendas.reduce((s, v) => s + v.totalAPagar, 0);
    // Valor principal SEM juros do UAU (vendas lançadas no ERP)
    const valorPrincipalTotal = vendas.reduce((s, v) => s + v.valorPrincipal, 0);
    const COMISSAO_PCT = COMISSAO_TOTAL_PCT; // 5% imob + 1,5% Eggs (fonte: constants/negocio.ts)

    // VGV Mangaba HÍBRIDO (mais preciso):
    //  - Para vendas COM correspondente UAU: usa valorPrincipal direto do ERP
    //  - Para vendas SÓ no Eggs (não lançadas no UAU ainda): aplica -6,5% sobre Eggs.valor
    const lotesUauSet = new Set(baseVendas.filter((b) => b.numVen > 0).map((b) => b.identificador));
    let liquidoVendaUau = 0;       // soma valorPrincipal das vendas no UAU
    let liquidoVendaEggsExclusivo = 0; // soma Eggs×0.935 das vendas SÓ no Eggs
    let qtdSoEggs = 0;
    for (const c of contratos) {
      if (INVESTOR_LOTS.has(c.loteId)) continue;
      if (c.cancelado) continue;
      if (!["ASSINADO", "FATURADO", "ENTREGUE AO INCORPORADOR"].includes(c.statusOriginal || "")) continue;
      if (!lotesUauSet.has(c.loteId)) {
        // venda só no Eggs (UAU não lançou ainda) — aplica desconto estimado de comissões
        liquidoVendaEggsExclusivo += c.valor * (1 - COMISSAO_PCT);
        qtdSoEggs++;
      }
    }
    liquidoVendaUau = valorPrincipalTotal; // já calculado acima
    const valorLiquidoMangabaTotal = liquidoVendaUau + liquidoVendaEggsExclusivo;
    const comissoesTotal = valorVendidoTotal * COMISSAO_PCT;
    const qtdVendas = vendas.length;
    const ticketMedio = qtdVendas > 0 ? valorVendidoTotal / qtdVendas : 0;
    const ticketMedioTabela = qtdVendas > 0 ? valorTabelaTotal / qtdVendas : 0;
    const ticketMedioComJuros = qtdVendas > 0 ? totalAPagarTotal / qtdVendas : 0;
    // Ganho de salto = (contrato Eggs - tabela UAU) / tabela
    const ganhoSaltoTotal = valorVendidoTotal - valorTabelaTotal;
    const pctGanhoSalto = valorTabelaTotal > 0 ? (ganhoSaltoTotal / valorTabelaTotal) * 100 : 0;
    // Juros financiamento = soma dos juros configurados em cada venda (totaisareceber.valorJuros)
    const jurosFinanciamentoTotal = vendas.reduce((s, v) => s + v.jurosFin, 0);
    // Quantas vendas têm juros configurados (financiamento com juros vs sem juros)
    const qtdVendasComJuros = vendas.reduce((s, v) => s + v.qtdVendasComJuros, 0);

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
    const vencidas = parcelas.filter((p) => p.status === "vencida");
    const emDia = parcelas.filter((p) => p.status === "em_dia");

    const totalVencido = vencidas.reduce((s, p) => s + p.valor, 0);
    const totalEmDia = emDia.reduce((s, p) => s + p.valor, 0);
    // Total já recebido vem de ConsultarResumoVenda.totaisrecebido por venda
    const totalPago = vendas.reduce((s, v) => s + v.valorRecebido, 0);

    const clientesInadimplentes = new Set(vencidas.map((p) => p.chaveVenda));
    const totalRecebiveis = totalVencido + totalEmDia;
    const percentualInadimplencia = totalRecebiveis > 0 ? (totalVencido / totalRecebiveis) * 100 : 0;

    // Add inadimplência projection to projecoes
    for (const p of projecoes) {
      p.inadimplenciaProjetada = percentualInadimplencia;
    }

    const response = {
      valorVendidoTotal,         // = contrato Eggs (com ganho de salto, sem juros)
      ticketMedio,
      qtdVendas,
      // Múltiplas perspectivas de valor (lado a lado na UI)
      valoresAgregados: {
        tabelaUAU: valorTabelaTotal,             // sem ganho de salto
        contratoEggs: valorVendidoTotal,         // = VGV BRUTO contratado (R$ 21,5M)
        valorPrincipalErp: valorPrincipalTotal,  // ERP UAU sem juros (R$ 18,5M, bate com tela do ERP)
        liquidoMangaba: valorLiquidoMangabaTotal,// Bruto - 6,5% comissões (R$ 20,1M, bate planilha LÍQUIDA)
        comissoesEstimadas: comissoesTotal,      // 5% imobiliária + 1,5% Eggs
        totalAPagarComJuros: totalAPagarTotal,   // total que cliente vai desembolsar (com juros)
        ganhoSalto: ganhoSaltoTotal,             // diferença Eggs vs Tabela
        pctGanhoSalto,                           // % do ganho
        jurosFinanciamento: jurosFinanciamentoTotal,  // soma dos juros configurados em cada venda
        qtdVendasComJuros,                            // quantas vendas têm juros (vs sem juros)
        ticketMedio,
        ticketMedioTabela,
        ticketMedioComJuros,
      },
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
      // Comissões pagas (R$ 3k corretora + R$ 1k imob) — saídas do caixa
      comissoesPagas: {
        totalPago: comissoes.totalPago,
        porMes: comissoes.detalhes,
      },
    };

    cache.set(cacheKey, { data: response, timestamp: Date.now() });
    // Snapshot diário do histórico de inadimplência (pós-resposta, não atrasa a UI)
    after(() => salvarSnapshotInadimplencia({
      pct: percentualInadimplencia,
      totalVencido,
      qtdClientes: clientesInadimplentes.size,
      qtdParcelas: vencidas.length,
    }));
    return NextResponse.json(response);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("UAU Financeiro API error:", errMsg);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (body.action === "clear-cache") {
    cache.clear();
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: "ação inválida" }, { status: 400 });
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
