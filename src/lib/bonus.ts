/**
 * Bônus de Corretores e Imobiliárias.
 *
 * Regras:
 *  - R$ 3.000 corretora + R$ 1.000 imobiliária = R$ 4.000 por venda válida
 *  - Trigger pra liberar: TODAS as parcelas tipo E (Entrada) pagas
 *  - Status pago: manual no dashboard, persistido em blob bonus-payments.json
 *  - Sem corretor identificado → status "revisar" (flag amarela, decisão manual)
 *  - Cancelamento pós-pagamento → mantém histórico (status "cancelado_pago")
 */
import { list, put } from "@vercel/blob";
import { getContratosEggs, type ContratoEnriquecido } from "@/lib/eggs-contratos";
import { authenticate, isUauConfigured, uauFetch } from "@/lib/uau-auth";
import investorData from "@/data/investor-lots.json";

const INVESTOR_LOTS = new Set<string>(investorData.lots);

export const BONUS_CORRETORA = 3000;
export const BONUS_IMOBILIARIA = 1000;
export const BONUS_TOTAL_POR_VENDA = BONUS_CORRETORA + BONUS_IMOBILIARIA;

const PAGAMENTOS_BLOB = "bonus-payments.json";

export type BonusStatus =
  | "aguardando_entrada"   // Es ainda em aberto
  | "a_pagar"              // Es quitadas, ainda não pago
  | "pago_parcial"         // só corretora OU só imobiliária pago
  | "pago_total"           // ambos pagos
  | "revisar"              // sem corretor identificado (flag)
  | "cancelado_pago";      // contrato cancelado mas bônus já estava pago

export interface BonusPagamento {
  pagoCorretora: boolean;
  dataPagoCorretora: string;     // ISO yyyy-mm-dd
  pagoImobiliaria: boolean;
  dataPagoImobiliaria: string;
  observacao?: string;
}

export interface BonusEntry {
  chaveVenda: string;
  loteId: string;
  bloco: string;
  unidade: string;
  valorContratado: number;
  // Corretor
  corretorNome: string;
  corretorCpf: string;
  corretorCreci: string;
  // Imobiliária
  imobiliariaRazaoSocial: string;
  imobiliariaNomeFantasia: string;
  imobiliariaCnpj: string;
  // Entrada
  entradaQtdTotal: number;
  entradaQtdPaga: number;
  entradaValorTotal: number;
  entradaValorPago: number;
  entradaQuitada: boolean;
  // Bônus
  valorCorretora: number;
  valorImobiliaria: number;
  valorTotal: number;
  status: BonusStatus;
  pagamento: BonusPagamento;
  cancelado: boolean;
  contratoStatus: string;        // status original Eggs ("ASSINADO", "CANCELADO", etc)
  // Cliente (referência)
  clienteNome: string;
}

export interface BonusSummary {
  qtdValidas: number;            // vendas que entram no cálculo
  qtdAguardandoEntrada: number;
  qtdAPagar: number;
  qtdPagoTotal: number;
  qtdPagoParcial: number;
  qtdRevisar: number;
  qtdCancelado: number;
  comprometidoTotal: number;     // soma de TODOS os bônus (independente do status)
  aPagarAgora: number;           // bônus com Es quitadas, ainda não pago
  pagoTotal: number;             // já pago (corretora + imob)
  aguardandoEntrada: number;     // futuro (Es ainda em aberto)
  pendenteRevisar: number;       // sem corretor
}

export interface BonusResponse {
  bonus: BonusEntry[];
  summary: BonusSummary;
  fetchedAt: string;
}

// Cache do bonus enriquecido (5 min)
let cache: { data: BonusResponse; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

// ── Storage de pagamentos manuais (Vercel Blob) ────────────────────────────
async function loadPagamentos(): Promise<Record<string, BonusPagamento>> {
  try {
    const { blobs } = await list({ prefix: PAGAMENTOS_BLOB });
    if (blobs.length === 0) return {};
    const res = await fetch(blobs[0].url, { cache: "no-store" });
    if (!res.ok) return {};
    return await res.json();
  } catch (e) {
    console.error("Erro carregando bonus-payments.json:", e);
    return {};
  }
}

async function savePagamentos(pagamentos: Record<string, BonusPagamento>) {
  await put(PAGAMENTOS_BLOB, JSON.stringify(pagamentos, null, 2), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });
  // Invalida cache
  cache = null;
}

export async function setBonusPagamento(
  chaveVenda: string,
  patch: Partial<BonusPagamento>,
): Promise<BonusPagamento> {
  const pagamentos = await loadPagamentos();
  const atual = pagamentos[chaveVenda] || {
    pagoCorretora: false, dataPagoCorretora: "",
    pagoImobiliaria: false, dataPagoImobiliaria: "",
  };
  const novo: BonusPagamento = { ...atual, ...patch };
  pagamentos[chaveVenda] = novo;
  await savePagamentos(pagamentos);
  return novo;
}

// ── UAU: status da entrada por venda ───────────────────────────────────────
interface EntradaStatus {
  qtdTotal: number;
  qtdPaga: number;
  valorTotal: number;
  valorPago: number;
  quitada: boolean;
}

async function getEntradasStatus(loteIds: string[]): Promise<Map<string, EntradaStatus>> {
  const map = new Map<string, EntradaStatus>();
  if (!isUauConfigured() || loteIds.length === 0) return map;

  try {
    const token = await authenticate();
    const now = new Date();
    const td = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${now.getFullYear()}`;

    // Pega espelho (vendas com numVen)
    const espelhoRaw = await uauFetch(token, "Espelho/BuscaUnidadesDeAcordoComWhereDetalhado", {
      where: "WHERE Empresa_unid = 2 AND Vendido_unid = 1",
      retorna_venda: true,
      data_tabela_preco: td,
    }, 20000);

    const rows = Array.isArray(espelhoRaw) && (espelhoRaw[0] as { MyTable?: unknown[] })?.MyTable
      ? ((espelhoRaw[0] as { MyTable: unknown[] }).MyTable as Record<string, unknown>[]).slice(1)
      : [];

    const loteParaVenda = new Map<string, { numVen: number; obra: string; empresa: number }>();
    const loteSet = new Set(loteIds);
    for (const r of rows) {
      const id = String(r.Identificador_unid || "");
      if (!id || !loteSet.has(id)) continue;
      const numVen = Number(r.Num_Ven) || 0;
      if (numVen === 0) continue;
      loteParaVenda.set(id, {
        numVen,
        obra: String(r.Obra_unid || "01VEN"),
        empresa: Number(r.Empresa_unid) || 2,
      });
    }

    // Batch fetch ConsultarResumoVenda pra cada venda
    const vendasComNum = Array.from(loteParaVenda.entries());
    const conc = 10;
    for (let i = 0; i < vendasComNum.length; i += conc) {
      const batch = vendasComNum.slice(i, i + conc);
      const results = await Promise.allSettled(
        batch.map(async ([loteId, v]) => {
          const res = await uauFetch(token, "Venda/ConsultarResumoVenda", {
            codigoObra: v.obra, codigoEmpresa: v.empresa, numeroVenda: v.numVen,
          }, 10000);
          return { loteId, raw: res };
        })
      );
      for (const r of results) {
        if (r.status !== "fulfilled") continue;
        const { loteId, raw } = r.value;
        const data = Array.isArray(raw) ? raw[0] : raw;
        const ptipo = (data as { parcelasportipo?: { tipoParcela?: string; quantidadeParcelaAPagar?: number; quantidadeParcelaPaga?: number; totalParcelaAPagar?: number; totalParcelaPaga?: number }[] })?.parcelasportipo;
        if (!Array.isArray(ptipo)) continue;
        const entradaInfo = ptipo.find((p) => p.tipoParcela === "E");
        if (!entradaInfo) {
          // Sem parcelas tipo E configuradas — considera "sem entrada" (quitada por default)
          map.set(loteId, { qtdTotal: 0, qtdPaga: 0, valorTotal: 0, valorPago: 0, quitada: true });
          continue;
        }
        const qtdAPagar = Number(entradaInfo.quantidadeParcelaAPagar) || 0;
        const qtdPaga = Number(entradaInfo.quantidadeParcelaPaga) || 0;
        const valorAPagar = Number(entradaInfo.totalParcelaAPagar) || 0;
        const valorPago = Number(entradaInfo.totalParcelaPaga) || 0;
        map.set(loteId, {
          qtdTotal: qtdAPagar + qtdPaga,
          qtdPaga,
          valorTotal: valorAPagar + valorPago,
          valorPago,
          quitada: qtdAPagar === 0,
        });
      }
    }
  } catch (e) {
    console.error("Erro pegando entradas status:", e);
  }
  return map;
}

// ── Orquestração principal ─────────────────────────────────────────────────
function classifyStatus(
  entry: { entradaQuitada: boolean; corretorNome: string; cancelado: boolean; pagamento: BonusPagamento }
): BonusStatus {
  const algumPago = entry.pagamento.pagoCorretora || entry.pagamento.pagoImobiliaria;

  if (entry.cancelado && algumPago) return "cancelado_pago";

  // Cancelados sem pagamento são filtrados antes
  if (entry.pagamento.pagoCorretora && entry.pagamento.pagoImobiliaria) return "pago_total";
  if (algumPago) return "pago_parcial";

  if (!entry.corretorNome) return "revisar";
  if (!entry.entradaQuitada) return "aguardando_entrada";
  return "a_pagar";
}

export async function getBonusTracking(): Promise<BonusResponse> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) return cache.data;

  const [contratos, pagamentos] = await Promise.all([
    getContratosEggs(),
    loadPagamentos(),
  ]);

  // Filtra contratos válidos pro cálculo:
  // - Não cancelados (ou cancelados c/ bônus já pago — mantemos no histórico)
  // - Não-investidor (já filtrado em getContratosEggs)
  const contratosValidos: ContratoEnriquecido[] = contratos.filter((c) => {
    if (INVESTOR_LOTS.has(c.loteId)) return false;
    const chave = `${c.id}-${c.loteId}`;
    const pago = pagamentos[chave];
    const algumPago = pago?.pagoCorretora || pago?.pagoImobiliaria;
    // Cancelados sem pagamento: filtra. Com pagamento: mantém pra histórico.
    if (c.cancelado && !algumPago) return false;
    return true;
  });

  // Pega status das entradas em batch
  const loteIds = contratosValidos.map((c) => c.loteId);
  const entradasMap = await getEntradasStatus(loteIds);

  const bonus: BonusEntry[] = contratosValidos.map((c) => {
    const chaveVenda = `${c.id}-${c.loteId}`;
    const pagamento: BonusPagamento = pagamentos[chaveVenda] || {
      pagoCorretora: false, dataPagoCorretora: "",
      pagoImobiliaria: false, dataPagoImobiliaria: "",
    };
    const entrada = entradasMap.get(c.loteId) || { qtdTotal: 0, qtdPaga: 0, valorTotal: 0, valorPago: 0, quitada: false };
    const entry = {
      chaveVenda,
      loteId: c.loteId,
      bloco: c.bloco,
      unidade: c.unidade,
      valorContratado: c.valor,
      corretorNome: c.corretor.nome,
      corretorCpf: c.corretor.cpf,
      corretorCreci: c.corretor.creci,
      imobiliariaRazaoSocial: c.imobiliaria.razaoSocial,
      imobiliariaNomeFantasia: c.imobiliaria.nomeFantasia,
      imobiliariaCnpj: c.imobiliaria.cnpj,
      entradaQtdTotal: entrada.qtdTotal,
      entradaQtdPaga: entrada.qtdPaga,
      entradaValorTotal: entrada.valorTotal,
      entradaValorPago: entrada.valorPago,
      entradaQuitada: entrada.quitada,
      valorCorretora: BONUS_CORRETORA,
      valorImobiliaria: BONUS_IMOBILIARIA,
      valorTotal: BONUS_TOTAL_POR_VENDA,
      status: "a_pagar" as BonusStatus,
      pagamento,
      cancelado: c.cancelado,
      contratoStatus: c.statusOriginal,
      clienteNome: c.cliente,
    };
    entry.status = classifyStatus(entry);
    return entry;
  });

  // Summary
  const sum = bonus.reduce(
    (acc, b) => {
      acc.comprometidoTotal += b.valorTotal;
      if (b.status === "aguardando_entrada") {
        acc.qtdAguardandoEntrada++;
        acc.aguardandoEntrada += b.valorTotal;
      } else if (b.status === "a_pagar") {
        acc.qtdAPagar++;
        acc.aPagarAgora += b.valorTotal;
      } else if (b.status === "pago_total") {
        acc.qtdPagoTotal++;
        acc.pagoTotal += b.valorTotal;
      } else if (b.status === "pago_parcial") {
        acc.qtdPagoParcial++;
        // soma só o que foi pago
        if (b.pagamento.pagoCorretora) acc.pagoTotal += b.valorCorretora;
        if (b.pagamento.pagoImobiliaria) acc.pagoTotal += b.valorImobiliaria;
        // restante vira a_pagar
        if (!b.pagamento.pagoCorretora) acc.aPagarAgora += b.valorCorretora;
        if (!b.pagamento.pagoImobiliaria) acc.aPagarAgora += b.valorImobiliaria;
      } else if (b.status === "revisar") {
        acc.qtdRevisar++;
        acc.pendenteRevisar += b.valorTotal;
      } else if (b.status === "cancelado_pago") {
        acc.qtdCancelado++;
        if (b.pagamento.pagoCorretora) acc.pagoTotal += b.valorCorretora;
        if (b.pagamento.pagoImobiliaria) acc.pagoTotal += b.valorImobiliaria;
      }
      return acc;
    },
    {
      qtdValidas: bonus.length,
      qtdAguardandoEntrada: 0, qtdAPagar: 0, qtdPagoTotal: 0,
      qtdPagoParcial: 0, qtdRevisar: 0, qtdCancelado: 0,
      comprometidoTotal: 0, aPagarAgora: 0, pagoTotal: 0,
      aguardandoEntrada: 0, pendenteRevisar: 0,
    } as BonusSummary,
  );

  const response: BonusResponse = {
    bonus: bonus.sort((a, b) => {
      // Ordena: a_pagar > pago_parcial > revisar > aguardando_entrada > pago_total > cancelado_pago
      const order: Record<BonusStatus, number> = {
        a_pagar: 0, pago_parcial: 1, revisar: 2,
        aguardando_entrada: 3, pago_total: 4, cancelado_pago: 5,
      };
      const d = order[a.status] - order[b.status];
      if (d !== 0) return d;
      return a.loteId.localeCompare(b.loteId);
    }),
    summary: sum,
    fetchedAt: new Date().toISOString(),
  };

  cache = { data: response, timestamp: Date.now() };
  return response;
}

export function clearBonusCache() {
  cache = null;
}
