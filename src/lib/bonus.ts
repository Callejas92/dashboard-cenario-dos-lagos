/**
 * Bônus de Corretores e Imobiliárias.
 *
 * Regras:
 *  - R$ 3.000 corretora + R$ 1.000 imobiliária = R$ 4.000 por venda válida
 *  - Trigger pra AUTORIZAR: cliente pagou >= 1,5% do contrato (valor recebido no ERP UAU,
 *    "o que veio pra Mangaba"). Abaixo disso → aguardando.
 *  - Status pago: manual no dashboard, persistido em blob bonus-payments.json
 *  - Sem corretor identificado → status "revisar" (flag amarela, decisão manual)
 *  - Cancelamento pós-pagamento → mantém histórico (status "cancelado_pago")
 */
import { list, put, del } from "@vercel/blob";
import { after } from "next/server";
import { getContratosEggs, type ContratoEnriquecido } from "@/lib/eggs-contratos";
import { authenticate, isUauConfigured, uauFetch } from "@/lib/uau-auth";
import { getInvestorLots } from "@/lib/investor-lots";
import { detectarENotificarAutorizados } from "@/lib/bonus-notify";
import { edgeRead } from "@/lib/edge-store";
import { saveDurable } from "@/lib/durable-store";

// Regras de negócio centralizadas em constants/negocio.ts (re-exportadas p/ compat).
import { BONUS_CORRETORA, BONUS_IMOBILIARIA, BONUS_TOTAL_POR_VENDA, PCT_AUTORIZACAO } from "@/lib/constants/negocio";
export { BONUS_CORRETORA, BONUS_IMOBILIARIA, BONUS_TOTAL_POR_VENDA, PCT_AUTORIZACAO };

const PAGAMENTOS_BLOB = "bonus-payments.json";
const PAGAMENTOS_EDGE_KEY = "bonus_payments"; // espelho no Edge Config (sobrevive a bloqueio do Blob)
const TRACKING_BLOB = "cache/bonus-tracking.json"; // último resultado COMPLETO (compartilhado entre instâncias)

export type BonusStatus =
  | "aguardando_entrada"   // Es ainda em aberto
  | "a_pagar"              // Es quitadas, ainda não pago
  | "pago_parcial"         // só corretora OU só imobiliária pago
  | "pago_total"           // ambos pagos
  | "isento"               // marcado como não-pagar (razão registrada)
  | "revisar"              // sem corretor identificado (flag)
  | "cancelado_pago";      // contrato cancelado mas bônus já estava pago

export interface BonusPagamento {
  pagoCorretora: boolean;
  dataPagoCorretora: string;     // ISO yyyy-mm-dd
  pagoImobiliaria: boolean;
  dataPagoImobiliaria: string;
  isento?: boolean;              // marcado como não-pagar (excepção)
  dataIsentado?: string;
  razaoIsentado?: string;
  observacao?: string;
  liberadoManual?: boolean;      // override: libera bônus mesmo sem entrada/sinal detectado no UAU
  dataLiberadoManual?: string;
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
  // Autorização (regra 1,5%)
  valorRecebido: number;   // total pago pelo cliente no ERP (o que veio pra Mangaba)
  metaAutorizado: number;  // 1,5% do contrato — limite pra autorizar
  autorizado: boolean;     // valorRecebido >= 1,5% do contrato (ou liberado manual) → libera o bônus
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
  qtdIsento: number;
  qtdRevisar: number;
  qtdCancelado: number;
  comprometidoTotal: number;     // soma de TODOS os bônus exceto isentos
  aPagarAgora: number;           // bônus com Es quitadas, ainda não pago
  pagoTotal: number;             // já pago (corretora + imob)
  aguardandoEntrada: number;     // futuro (Es ainda em aberto)
  pendenteRevisar: number;       // sem corretor
  isentoTotal: number;           // bônus marcados como não-pagar
}

export interface BonusResponse {
  bonus: BonusEntry[];
  summary: BonusSummary;
  completo: boolean;   // false = alguma consulta de entrada ao UAU falhou (dado parcial — não confiar p/ aviso/Excel)
  fetchedAt: string;
}

// Cache do bonus enriquecido (5 min)
let cache: { data: BonusResponse; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

// ── Storage de pagamentos manuais (Edge Config + Vercel Blob) ──────────────
// Espelhado no Edge Config (sobrevive a bloqueio do Blob; Blob é fallback). Retorna
// NULL quando NENHUM storage está legível (≠ de {} "ninguém pago") — sem essa
// distinção, uma falha de leitura zerava os pagos na tela como se fosse verdade
// (aconteceu em 11/06 com o store do Blob bloqueado).
function aplicarRecentes(mapa: Record<string, BonusPagamento>): Record<string, BonusPagamento> {
  for (const [chave, e] of escritasRecentes) {
    if (Date.now() - e.at < JANELA_PROPAGACAO) mapa[chave] = e.pagamento;
    else escritasRecentes.delete(chave);
  }
  return mapa;
}

async function loadPagamentos(): Promise<Record<string, BonusPagamento> | null> {
  // 1) Edge Config (leitura grátis, sobrevive a bloqueio do Blob)
  try {
    const e = await edgeRead<Record<string, BonusPagamento>>(PAGAMENTOS_EDGE_KEY);
    if (e && typeof e === "object" && !Array.isArray(e)) return aplicarRecentes(e);
  } catch { /* segue pro Blob */ }
  // 2) Fallback Blob
  try {
    const { blobs } = await list({ prefix: PAGAMENTOS_BLOB });
    if (blobs.length === 0) return aplicarRecentes({});
    const res = await fetch(blobs[0].url, { cache: "no-store" });
    if (!res.ok) return null; // existe mas ilegível (ex.: store bloqueado) → não zera a tela
    const mapa = (await res.json()) as Record<string, BonusPagamento>;
    return aplicarRecentes(mapa);
  } catch (e) {
    console.error("Erro carregando bonus-payments (Edge+Blob):", e);
    return null;
  }
}

// Escritas recentes DESTA instância: vencem o blob durante a janela de propagação do
// Vercel Blob (~60s pra sobrescrita aparecer na leitura). Sem isso, marcar dois bônus
// em sequência podia perder o primeiro (o load do segundo lia o blob ainda velho).
const escritasRecentes = new Map<string, { at: number; pagamento: BonusPagamento }>();
const JANELA_PROPAGACAO = 2 * 60 * 1000;

async function savePagamentos(pagamentos: Record<string, BonusPagamento>): Promise<BonusResponse | null> {
  // Blob-primeiro com auto-migração: quando o Blob volta, grava lá e limpa o Edge (libera
  // os ~8KB). Enquanto bloqueado, cai no Edge. Ver lib/durable-store.ts.
  const persist = await saveDurable(PAGAMENTOS_BLOB, PAGAMENTOS_EDGE_KEY, pagamentos);
  // "none" = Blob bloqueado E Edge indisponível/cheio → NÃO persistiu. Lança pra NÃO mascarar:
  // o overlay escritasRecentes esconderia a perda por ~2min e a marcação sumiria depois (foi
  // exatamente o que escondeu o bug de import de jun/2026).
  if (persist === "none") throw new Error("Falha ao persistir pagamentos: Blob bloqueado e Edge indisponível (cheio?).");
  // Marcar/desmarcar/isentar é mudança PURA de pagamento — aplica no tracking em memória/blob
  // SEM reconsultar o UAU (lento/instável). Se não houver base completa, força recompute.
  const tracking = await patchTrackingPagamentos(pagamentos);
  if (!tracking) { cache = null; await invalidateTrackingBlob(); }
  return tracking;
}

/**
 * Empurrão de migração Edge→Blob (chamado pelo cron). Relê os pagamentos e regrava
 * via saveDurable — quando o Blob voltar, isso move pro Blob e limpa o Edge. NÃO mexe
 * no tracking (move puro de storage). Best-effort.
 */
export async function nudgeMigracaoPagamentos(): Promise<void> {
  const p = await loadPagamentos();
  if (p && Object.keys(p).length > 0) {
    await saveDurable(PAGAMENTOS_BLOB, PAGAMENTOS_EDGE_KEY, p).catch(() => {});
  }
}

/**
 * Base RÁPIDA pra importação Excel→dashboard: loteId → { chaveVenda, pagamento }.
 * Só de Eggs (contratos válidos) + pagamentos persistidos — SEM tocar no UAU. Assim o
 * sync consegue importar o "pago" do Excel mesmo com o ERP fora/lento (o UAU só é
 * necessário pra ESCREVER o status autorizado/aguardando de volta no Excel).
 */
export async function getBaseImportacao(): Promise<Map<string, { chaveVenda: string; pagamento: BonusPagamento }>> {
  const [contratos, pagamentos] = await Promise.all([getContratosEggs(), loadPagamentos()]);
  const pg = pagamentos ?? {};
  const ELEGIVEL = new Set(["ASSINADO", "FATURADO", "ENTREGUE AO INCORPORADOR"]);
  const map = new Map<string, { chaveVenda: string; pagamento: BonusPagamento }>();
  for (const c of contratos) {
    if (c.cancelado) continue;
    if (!ELEGIVEL.has((c.statusOriginal || c.status || "").toUpperCase().trim())) continue;
    const chaveVenda = `${c.id}-${c.loteId}`;
    map.set(c.loteId, {
      chaveVenda,
      pagamento: pg[chaveVenda] || { pagoCorretora: false, dataPagoCorretora: "", pagoImobiliaria: false, dataPagoImobiliaria: "" },
    });
  }
  return map;
}

// Aplica os pagamentos ao tracking COMPLETO em cache/blob, sem reconsultar o UAU.
// Retorna o tracking atualizado, ou null se não há base completa (chamador força recompute).
async function patchTrackingPagamentos(pagamentos: Record<string, BonusPagamento>): Promise<BonusResponse | null> {
  let base = cache?.data;
  if (!base) base = (await readTrackingBlob())?.data;
  if (!base || !base.bonus?.length || !base.completo) return null;
  const bonus = base.bonus.map((b) => {
    const pagamento: BonusPagamento = pagamentos[b.chaveVenda] || {
      pagoCorretora: false, dataPagoCorretora: "", pagoImobiliaria: false, dataPagoImobiliaria: "",
    };
    const status = classifyStatus({ autorizado: b.autorizado, corretorNome: b.corretorNome, cancelado: b.cancelado, pagamento });
    return { ...b, pagamento, status };
  });
  const data: BonusResponse = {
    bonus: sortBonus(bonus),
    summary: buildSummary(bonus),
    completo: true,
    fetchedAt: new Date().toISOString(),
  };
  cache = { data, timestamp: Date.now() };
  await writeTrackingBlob(data);
  return data;
}

export async function setBonusPagamento(
  chaveVenda: string,
  patch: Partial<BonusPagamento>,
): Promise<{ pagamento: BonusPagamento; tracking: BonusResponse | null }> {
  const carregados = await loadPagamentos();
  // Sem base legível NÃO dá pra mesclar — salvar em cima apagaria os outros pagamentos.
  if (carregados === null) throw new Error("Storage de pagamentos indisponível (store suspenso?) — marcação não salva.");
  const pagamentos = carregados;
  const atual = pagamentos[chaveVenda] || {
    pagoCorretora: false, dataPagoCorretora: "",
    pagoImobiliaria: false, dataPagoImobiliaria: "",
  };
  const novo: BonusPagamento = { ...atual, ...patch };
  pagamentos[chaveVenda] = novo;
  const tracking = await savePagamentos(pagamentos); // lança se não persistir
  // Overlay read-your-writes SÓ depois de persistir (senão mascara falha de save).
  escritasRecentes.set(chaveVenda, { at: Date.now(), pagamento: novo });
  return { pagamento: novo, tracking };
}

/**
 * Aplica VÁRIOS patches de pagamento numa tacada só (1 leitura + 1 escrita no blob,
 * independente do volume). Usado pela importação Excel→dashboard — aplicar um a um
 * estourava o tempo da função quando o Felipe anotava muitos "pago" de uma vez.
 */
export async function setBonusPagamentosEmLote(
  itens: { chaveVenda: string; patch: Partial<BonusPagamento> }[],
): Promise<BonusResponse | null> {
  if (!itens.length) return null;
  const carregados = await loadPagamentos();
  if (carregados === null) throw new Error("Storage de pagamentos indisponível (store suspenso?) — importação não salva.");
  const pagamentos = carregados;
  const aplicados: { chaveVenda: string; novo: BonusPagamento }[] = [];
  for (const { chaveVenda, patch } of itens) {
    const atual = pagamentos[chaveVenda] || {
      pagoCorretora: false, dataPagoCorretora: "",
      pagoImobiliaria: false, dataPagoImobiliaria: "",
    };
    const novo: BonusPagamento = { ...atual, ...patch };
    pagamentos[chaveVenda] = novo;
    aplicados.push({ chaveVenda, novo });
  }
  const tracking = await savePagamentos(pagamentos); // lança se não persistir
  // Overlay read-your-writes SÓ depois de persistir (senão mascara falha de save).
  for (const { chaveVenda, novo } of aplicados) escritasRecentes.set(chaveVenda, { at: Date.now(), pagamento: novo });
  return tracking;
}

// ── UAU: status da entrada por venda ───────────────────────────────────────
interface EntradaStatus {
  qtdTotal: number;
  qtdPaga: number;
  valorTotal: number;
  valorPago: number;
  quitada: boolean;
  totalRecebido: number; // soma de TODAS as parcelas pagas (não só E/S) = valor que veio pra Mangaba no ERP
}

async function getEntradasStatus(loteIds: string[]): Promise<{ map: Map<string, EntradaStatus>; completo: boolean }> {
  const map = new Map<string, EntradaStatus>();
  if (!isUauConfigured() || loteIds.length === 0) return { map, completo: true };

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
    // Espelho vazio/falhou → não dá pra confiar (todas cairiam no default "não pago").
    if (rows.length === 0) return { map, completo: false };

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

    // Consulta o resumo de UMA venda e popula o map. Lança em falha (pra ser re-tentada).
    const fetchOne = async (
      [loteId, v]: [string, { numVen: number; obra: string; empresa: number }],
      timeout: number,
    ): Promise<void> => {
      const raw = await uauFetch(token, "Venda/ConsultarResumoVenda", {
        codigoObra: v.obra, codigoEmpresa: v.empresa, numeroVenda: v.numVen,
      }, timeout);
      const data = Array.isArray(raw) ? raw[0] : raw;
      const ptipo = (data as { parcelasportipo?: { tipoParcela?: string; quantidadeParcelaAPagar?: number; quantidadeParcelaPaga?: number; totalParcelaAPagar?: number; totalParcelaPaga?: number }[] })?.parcelasportipo;
      if (!Array.isArray(ptipo)) throw new Error("resumo sem parcelasportipo");
      // Total recebido = TODAS as parcelas pagas (E/S + parcelas normais) = o que veio pra Mangaba no ERP.
      const totalRecebido = ptipo.reduce((s, p) => s + (Number(p.totalParcelaPaga) || 0), 0);
      // ENTRADA = Entrada (E) + Sinal (S). Felipe: "sinal e entrada valem a mesma coisa".
      const entradaTipos = ptipo.filter((p) => p.tipoParcela === "E" || p.tipoParcela === "S");
      if (entradaTipos.length === 0) {
        // Sem parcelas E nem S (venda à vista, ou tabela sem entrada) — entrada quitada por default.
        map.set(loteId, { qtdTotal: 0, qtdPaga: 0, valorTotal: 0, valorPago: 0, quitada: true, totalRecebido });
        return;
      }
      const qtdAPagar = entradaTipos.reduce((s, p) => s + (Number(p.quantidadeParcelaAPagar) || 0), 0);
      const qtdPaga = entradaTipos.reduce((s, p) => s + (Number(p.quantidadeParcelaPaga) || 0), 0);
      const valorAPagar = entradaTipos.reduce((s, p) => s + (Number(p.totalParcelaAPagar) || 0), 0);
      const valorPago = entradaTipos.reduce((s, p) => s + (Number(p.totalParcelaPaga) || 0), 0);
      map.set(loteId, {
        qtdTotal: qtdAPagar + qtdPaga,
        qtdPaga,
        valorTotal: valorAPagar + valorPago,
        valorPago,
        quitada: qtdAPagar === 0,
        totalRecebido,
      });
    };

    // Resolve todas; RE-TENTA as que estouraram timeout/erro até 3 rodadas (UAU frio derruba algumas).
    // Sem isso, uma chamada que falha cai no default "não pago" e subconta os bônus "a pagar".
    let pendentes = Array.from(loteParaVenda.entries());
    const conc = 10;
    for (let tentativa = 0; tentativa < 3 && pendentes.length > 0; tentativa++) {
      const timeout = tentativa === 0 ? 20000 : 30000;
      const falhou: typeof pendentes = [];
      for (let i = 0; i < pendentes.length; i += conc) {
        const batch = pendentes.slice(i, i + conc);
        const results = await Promise.allSettled(batch.map((e) => fetchOne(e, timeout)));
        results.forEach((r, idx) => {
          if (r.status === "rejected") falhou.push(batch[idx]);
        });
      }
      pendentes = falhou;
    }

    // completo = Espelho ok E todas as vendas com numVen resolvidas (mesmo após retries).
    return { map, completo: pendentes.length === 0 };
  } catch (e) {
    console.error("Erro pegando entradas status:", e);
    return { map, completo: false };
  }
}

// ── Orquestração principal ─────────────────────────────────────────────────
function classifyStatus(
  entry: { autorizado: boolean; corretorNome: string; cancelado: boolean; pagamento: BonusPagamento }
): BonusStatus {
  const algumPago = entry.pagamento.pagoCorretora || entry.pagamento.pagoImobiliaria;

  if (entry.cancelado && algumPago) return "cancelado_pago";

  // Isento tem prioridade sobre tudo (decisão manual explícita)
  if (entry.pagamento.isento) return "isento";

  // Cancelados sem pagamento são filtrados antes
  if (entry.pagamento.pagoCorretora && entry.pagamento.pagoImobiliaria) return "pago_total";
  if (algumPago) return "pago_parcial";

  if (!entry.corretorNome) return "revisar";
  if (!entry.autorizado) return "aguardando_entrada";
  return "a_pagar";
}

function buildSummary(bonus: BonusEntry[]): BonusSummary {
  return bonus.reduce(
    (acc, b) => {
      // Isentos NÃO contam pro comprometido (não vão sair do caixa)
      if (b.status !== "isento") acc.comprometidoTotal += b.valorTotal;

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
        if (b.pagamento.pagoCorretora) acc.pagoTotal += b.valorCorretora;
        if (b.pagamento.pagoImobiliaria) acc.pagoTotal += b.valorImobiliaria;
        if (!b.pagamento.pagoCorretora) acc.aPagarAgora += b.valorCorretora;
        if (!b.pagamento.pagoImobiliaria) acc.aPagarAgora += b.valorImobiliaria;
      } else if (b.status === "isento") {
        acc.qtdIsento++;
        acc.isentoTotal += b.valorTotal;
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
      qtdPagoParcial: 0, qtdIsento: 0, qtdRevisar: 0, qtdCancelado: 0,
      comprometidoTotal: 0, aPagarAgora: 0, pagoTotal: 0,
      aguardandoEntrada: 0, pendenteRevisar: 0, isentoTotal: 0,
    } as BonusSummary,
  );
}

function sortBonus(bonus: BonusEntry[]): BonusEntry[] {
  // a_pagar > pago_parcial > revisar > aguardando_entrada > pago_total > isento > cancelado_pago
  const order: Record<BonusStatus, number> = {
    a_pagar: 0, pago_parcial: 1, revisar: 2,
    aguardando_entrada: 3, pago_total: 4, isento: 5, cancelado_pago: 6,
  };
  return bonus.slice().sort((a, b) => {
    const d = order[a.status] - order[b.status];
    if (d !== 0) return d;
    return a.loteId.localeCompare(b.loteId);
  });
}

// Compute pesado (Eggs + UAU). NÃO mexe em cache — o wrapper getBonusTracking cuida disso.
async function computeBonusTracking(): Promise<BonusResponse> {
  const [contratos, pagamentosRaw, INVESTOR_LOTS] = await Promise.all([
    getContratosEggs(),
    loadPagamentos(),
    getInvestorLots(),
  ]);
  // Pagamentos ilegíveis (store suspenso etc.) → dado INCOMPLETO: não persiste, badge
  // some e o banner avisa — em vez de mostrar "ninguém pago" como se fosse verdade.
  const pagamentosOk = pagamentosRaw !== null;
  const pagamentos = pagamentosRaw ?? {};

  // Filtra contratos válidos pro cálculo:
  // - Status ASSINADO apenas (ENVIADO PARA ASSINATURA não conta — ainda pode mudar)
  // - Cancelados c/ bônus já pago: mantemos no histórico
  // - Não-investidor (já filtrado em getContratosEggs)
  const STATUS_ELEGIVEL_BONUS = new Set(["ASSINADO", "FATURADO", "ENTREGUE AO INCORPORADOR"]);
  const contratosValidos: ContratoEnriquecido[] = contratos.filter((c) => {
    if (INVESTOR_LOTS.has(c.loteId)) return false;
    const chave = `${c.id}-${c.loteId}`;
    const pago = pagamentos[chave];
    const algumPago = pago?.pagoCorretora || pago?.pagoImobiliaria || pago?.isento;
    // Cancelado: só mantém se já tem registro de pagamento (histórico)
    if (c.cancelado) return !!algumPago;
    // Só ASSINADO (e similares) entram no bônus.
    // ENVIADO PARA ASSINATURA, RESERVADO, NEGOCIAÇÃO etc: ainda pode mudar, não entra.
    // Exceção: se já tem registro de pagamento manual, mantém pra histórico.
    if (!STATUS_ELEGIVEL_BONUS.has(c.statusOriginal)) return !!algumPago;
    return true;
  });

  // Pega status das entradas em batch (com retry; completo=false se alguma chamada falhou)
  const loteIds = contratosValidos.map((c) => c.loteId);
  const { map: entradasMap, completo: uauCompleto } = await getEntradasStatus(loteIds);
  const completo = uauCompleto && pagamentosOk;

  const bonus: BonusEntry[] = contratosValidos.map((c) => {
    const chaveVenda = `${c.id}-${c.loteId}`;
    const pagamento: BonusPagamento = pagamentos[chaveVenda] || {
      pagoCorretora: false, dataPagoCorretora: "",
      pagoImobiliaria: false, dataPagoImobiliaria: "",
    };
    const entrada = entradasMap.get(c.loteId) || { qtdTotal: 0, qtdPaga: 0, valorTotal: 0, valorPago: 0, quitada: false, totalRecebido: 0 };
    // Override manual: Felipe pode liberar o bônus mesmo sem atingir 1,5%
    // (ex: venda à vista, acordo fora do sistema, UAU sem parcelas).
    const entradaQuitada = entrada.quitada || !!pagamento.liberadoManual;
    const valorRecebido = entrada.totalRecebido;
    const metaAutorizado = PCT_AUTORIZACAO * c.valor;
    const autorizado = valorRecebido >= metaAutorizado || !!pagamento.liberadoManual;
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
      entradaQuitada,
      valorRecebido,
      metaAutorizado,
      autorizado,
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

  const response: BonusResponse = {
    bonus: sortBonus(bonus),
    summary: buildSummary(bonus),
    completo,
    fetchedAt: new Date().toISOString(),
  };

  return response;
}

// ── Persistência compartilhada via Blob (sobrevive entre instâncias serverless) ─────
async function readTrackingBlob(): Promise<{ savedAt: number; data: BonusResponse } | null> {
  try {
    const { blobs } = await list({ prefix: TRACKING_BLOB });
    const hit = blobs.find((b) => b.pathname === TRACKING_BLOB) ?? blobs[0];
    if (!hit) return null;
    // Nota: depois de marcar pago, a leitura pode servir versão anterior por ~60s — a
    // leitura servia a versão ANTERIOR por ~30-60s ("dei pago e não foi").
    const res = await fetch(hit.url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as { savedAt: number; data: BonusResponse };
  } catch {
    return null;
  }
}

async function writeTrackingBlob(data: BonusResponse): Promise<void> {
  await put(TRACKING_BLOB, JSON.stringify({ savedAt: Date.now(), data }), {
    access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json",
  }).catch((err) => console.warn("bonus: falha ao salvar tracking no blob:", err));
}

async function invalidateTrackingBlob(): Promise<void> {
  try {
    const { blobs } = await list({ prefix: TRACKING_BLOB });
    if (blobs.length) await del(blobs.map((b) => b.url));
  } catch {
    /* ignora — pior caso o dado fica stale até o TTL */
  }
}

/**
 * Tracking de bônus com cache em 2 camadas:
 *  1. memória (mesma instância, 5 min)
 *  2. Blob compartilhado (stale-while-revalidate) — serve o último COMPLETO na hora a
 *     QUALQUER instância e revalida em background. Só persiste resultados completos
 *     (um parcial do UAU nunca vira "verdade" pro badge/Excel).
 */
// Memória responde por 60s (não 5min): equilíbrio entre frescor entre instâncias e a
// janela de propagação do Blob (~60s). A consistência IMEDIATA pós-escrita não depende
// disso — o POST devolve o tracking atualizado e a UI aplica direto (read-your-writes).
const MEMORY_TTL = 60 * 1000;

export async function getBonusTracking(): Promise<BonusResponse> {
  if (cache && Date.now() - cache.timestamp < MEMORY_TTL) return cache.data;

  const blob = await readTrackingBlob();
  if (blob?.data?.bonus) {
    // Não regride: se a memória desta instância é MAIS NOVA que o blob lido (escrita
    // recente ainda propagando no storage), continua servindo a memória.
    if (cache && cache.timestamp > blob.savedAt) return cache.data;
    cache = { data: blob.data, timestamp: Date.now() };
    if (Date.now() - blob.savedAt >= CACHE_TTL) {
      const revalidar = async () => {
        try {
          const fresh = await computeBonusTracking();
          if (fresh.completo) {
            cache = { data: fresh, timestamp: Date.now() };
            await writeTrackingBlob(fresh);
            // Notifica bônus que acabaram de cruzar 1,5% (e-mail; ver lib/bonus-notify)
            void detectarENotificarAutorizados(fresh);
          }
        } catch (err) {
          console.warn("bonus: revalidação em background falhou:", err);
        }
      };
      try { after(revalidar); } catch { /* fora de contexto de request: ignora */ }
    }
    return blob.data;
  }

  // Blob ilegível: serve a memória se houver (melhor velho que nada).
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) return cache.data;

  // Sem nada (memória nem blob): computa agora — único caminho que bloqueia.
  const fresh = await computeBonusTracking();
  if (fresh.completo) {
    cache = { data: fresh, timestamp: Date.now() };
    await writeTrackingBlob(fresh);
    void detectarENotificarAutorizados(fresh);
  }
  return fresh;
}

export function clearBonusCache() {
  cache = null;
  void invalidateTrackingBlob();
}

/**
 * Soma de bônus pagos no período [from, to] — usado por /api/canais (CAC)
 * e /api/uau/financeiro (fluxo de caixa).
 *
 * Considera as datas dos pagamentos marcados manualmente:
 *  - dataPagoCorretora: data efetiva de pagamento da R$ 3k
 *  - dataPagoImobiliaria: data efetiva de pagamento da R$ 1k
 * Isentos NÃO entram (não há desembolso).
 */
export async function getBonusComoCustoMensal(from: string, to: string): Promise<{
  totalPago: number;
  detalhes: { mes: string; valor: number; qtd: number }[];
}> {
  const { bonus } = await getBonusTracking();
  let total = 0;
  const porMes = new Map<string, { valor: number; qtd: number }>();

  for (const b of bonus) {
    // Corretora
    if (b.pagamento.pagoCorretora && b.pagamento.dataPagoCorretora) {
      const d = b.pagamento.dataPagoCorretora;
      if (d >= from && d <= to) {
        total += b.valorCorretora;
        const mes = d.slice(0, 7);
        const row = porMes.get(mes) || { valor: 0, qtd: 0 };
        row.valor += b.valorCorretora;
        row.qtd += 1;
        porMes.set(mes, row);
      }
    }
    // Imobiliária
    if (b.pagamento.pagoImobiliaria && b.pagamento.dataPagoImobiliaria) {
      const d = b.pagamento.dataPagoImobiliaria;
      if (d >= from && d <= to) {
        total += b.valorImobiliaria;
        const mes = d.slice(0, 7);
        const row = porMes.get(mes) || { valor: 0, qtd: 0 };
        row.valor += b.valorImobiliaria;
        row.qtd += 1;
        porMes.set(mes, row);
      }
    }
  }

  return {
    totalPago: total,
    detalhes: Array.from(porMes.entries())
      .map(([mes, v]) => ({ mes, ...v }))
      .sort((a, b) => a.mes.localeCompare(b.mes)),
  };
}
