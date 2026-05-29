import { NextResponse } from "next/server";
import lotesData from "@/data/lotes.json";
import investorData from "@/data/investor-lots.json";
import { authenticate, UAU_API, isUauConfigured, uauHeaders } from "@/lib/uau-auth";

const INVESTOR_LOTS = new Set<string>(investorData.lots);

// Helper: busca dados do CRM Eggs (mais atualizado que ERP/JSON estático)
interface CRMLoteInfo {
  status: string;
  metragem: number;
  valor: number;
  rua: string;
}

async function fetchCRMLotes(): Promise<Map<string, CRMLoteInfo>> {
  const result = new Map<string, CRMLoteInfo>();
  const token = process.env.CRM_EGGS_TOKEN?.trim();
  const empreendimentoId = process.env.CRM_EGGS_EMPREENDIMENTO_ID?.trim() || "10362";
  if (!token) return result;
  try {
    const url = `https://api.eggs.app/api/v1/Espelhovendaitem/unidades?idsempreendimento=${empreendimentoId}`;
    const res = await fetch(url, {
      headers: { token_autorizacao: token },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return result;
    const data = await res.json();
    const root = Array.isArray(data) ? data[0] : data;
    const empreendimento = root?.empreendimentos?.[0];
    const unidades = empreendimento?.unidades || [];
    for (const u of unidades) {
      const q = parseInt(u.bloco) || 0;
      const l = parseInt(u.unidade) || 0;
      const loteId = `Q${q}-L${l}`;
      result.set(loteId, {
        status: u.situacao_unidade || "",
        metragem: u.metragem || 0,
        valor: u.valor || 0,
        rua: u.rua || "",
      });
    }
  } catch { /* fallback to ERP */ }
  return result;
}

// Mantém compatibilidade
async function fetchCRMStatus(): Promise<Map<string, string>> {
  const lotes = await fetchCRMLotes();
  const result = new Map<string, string>();
  for (const [k, v] of lotes) result.set(k, v.status);
  return result;
}

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

interface UnitRow {
  Identificador_unid?: string;
  Vendido_unid?: number;
  Descr_status?: string;
  FracaoIdeal_unid?: number;
  DataCad_unid?: string;
  ValPreco_unid?: number;
  ValorTotal?: number;
  [key: string]: unknown;
}

// Build a lookup map from static data (fallback for rua, classificacao, area, prices)
const lotesMap = new Map<string, LoteStatic>();
for (const l of lotesData as LoteStatic[]) {
  lotesMap.set(l.id, l);
}

function parseIdentifier(id: string): { quadra: string; lote: string; loteNum: number } {
  // Format: Q1-L15 or similar
  const match = id.match(/Q(\d+)-L(\d+)/i);
  if (match) {
    return {
      quadra: `Q${match[1]}`,
      lote: `L${match[2]}`,
      loteNum: parseInt(match[2]),
    };
  }
  return { quadra: "Q?", lote: "L?", loteNum: 0 };
}

async function fetchUnits(
  token: string,
  integrationToken: string,
  todayFormatted: string,
  whereClause: string,
  retornaVenda: boolean,
  timeoutMs: number
): Promise<UnitRow[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(
      `${UAU_API}/api/v1/Espelho/BuscaUnidadesDeAcordoComWhereDetalhado`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token,
          "X-INTEGRATION-Authorization": integrationToken,
        },
        body: JSON.stringify({
          where: whereClause,
          retorna_venda: retornaVenda,
          data_tabela_preco: todayFormatted,
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`BuscaUnidades falhou: ${res.status} — ${err}`);
    }

    const raw = await res.json();
    const myTable: Record<string, unknown>[] =
      Array.isArray(raw) && raw.length > 0 && raw[0]?.MyTable
        ? raw[0].MyTable
        : [];

    return myTable.length > 1 ? (myTable.slice(1) as UnitRow[]) : [];
  } finally {
    clearTimeout(timeout);
  }
}

function buildEnrichedResponse(
  uauRows: UnitRow[] | null,
  uauStatus?: string,
  crmLotes?: Map<string, CRMLoteInfo>,
) {
  // Build unified lot list from API rows + static JSON fallback
  const unidadesMap = new Map<string, {
    identificador: string;
    quadra: string;
    lote: string;
    loteNum: number;
    status: string;
    area: number;
    valorTotal: number;
    valorM2: number;
    classificacao: string;
    rua: string;
  }>();

  if (uauRows && uauRows.length > 0) {
    for (const row of uauRows) {
      const id = row.Identificador_unid || "";
      if (!id) continue;

      const staticLote = lotesMap.get(id);
      const crmLote = crmLotes?.get(id);
      const { quadra, lote, loteNum } = parseIdentifier(id);

      // Status: CRM Eggs prioridade (mais atualizado), ERP UAU fallback
      let status = crmLote?.status || "";
      if (!status) {
        status = row.Descr_status || "";
        if (!status) {
          status = row.Vendido_unid === 1 ? "Vendida" : "Disponível";
        }
      }

      // Área: CRM Eggs > static JSON > ERP UAU
      const area = (crmLote?.metragem && crmLote.metragem > 0)
        ? crmLote.metragem
        : staticLote?.area ?? (Number(row.FracaoIdeal_unid) || 0);

      // Valor: CRM Eggs > static JSON > ERP UAU
      const valorTotal = (crmLote?.valor && crmLote.valor > 0)
        ? crmLote.valor
        : staticLote?.valorTotal ?? (Number(row.ValorTotal) || Number(row.ValPreco_unid) || 0);

      const valorM2 =
        (area > 0 && valorTotal > 0 ? valorTotal / area : 0) ||
        staticLote?.valorM2 ||
        Number(row.ValPreco_unid) || 0;

      unidadesMap.set(id, {
        identificador: id,
        quadra,
        lote,
        loteNum,
        status,
        area,
        valorTotal,
        valorM2,
        classificacao: staticLote?.classificacao ?? "",
        rua: staticLote?.rua ?? "",
      });
    }
  }

  // Adiciona lotes do CRM Eggs que não estão no UAU (CRM tem 213 lotes, UAU pode ter menos)
  if (crmLotes) {
    for (const [loteId, crmLote] of crmLotes) {
      if (unidadesMap.has(loteId)) continue;
      const staticLote = lotesMap.get(loteId);
      const { quadra, lote: loteStr, loteNum } = parseIdentifier(loteId);
      unidadesMap.set(loteId, {
        identificador: loteId,
        quadra,
        lote: loteStr,
        loteNum,
        status: crmLote.status || "Disponível",
        area: crmLote.metragem || staticLote?.area || 0,
        valorTotal: crmLote.valor || staticLote?.valorTotal || 0,
        valorM2: (crmLote.metragem > 0 && crmLote.valor > 0)
          ? crmLote.valor / crmLote.metragem
          : staticLote?.valorM2 || 0,
        classificacao: staticLote?.classificacao || "",
        rua: crmLote.rua || staticLote?.rua || "",
      });
    }
  }

  // Fallback final: se API e CRM falharam, usa JSON estático
  if (uauRows === null && unidadesMap.size === 0) {
    for (const lote of lotesData as LoteStatic[]) {
      const { quadra, lote: loteStr, loteNum } = parseIdentifier(lote.id);
      unidadesMap.set(lote.id, {
        identificador: lote.id,
        quadra,
        lote: loteStr,
        loteNum,
        status: "Disponível",
        area: lote.area,
        valorTotal: lote.valorTotal,
        valorM2: lote.valorM2,
        classificacao: lote.classificacao,
        rua: lote.rua,
      });
    }
  }

  // Lotes do investidor (Tio Ico) são EXCLUÍDOS de tudo — não existem nas métricas
  const unidades = Array.from(unidadesMap.values()).filter(
    (u) => !INVESTOR_LOTS.has(u.identificador)
  );

  function classifyStatus(s: string): "vendido" | "emVenda" | "foraDeVenda" | "disponivel" {
    const sl = s.toLowerCase();
    // CRM Eggs status: LIBERADA, BLOQUEADA, VENDIDA, RESERVADA, CONTRATO, PRÉ-VENDA
    if (sl.includes("vendid")) return "vendido";
    if (sl.includes("contrato") || sl.includes("contratado")) return "vendido"; // contrato fechado = vendido
    if (sl.includes("reservad") || sl.includes("pré-venda") || sl.includes("pre-venda") || sl.includes("em venda") || sl.includes("em_venda")) return "emVenda";
    if (sl.includes("bloquead") || sl.includes("fora de venda") || sl.includes("fora_de_venda")) return "foraDeVenda";
    if (sl.includes("liberada")) return "disponivel";
    return "disponivel";
  }

  // Summary counters
  const total = unidades.length;
  let disponivel = 0;
  let vendido = 0;
  let emVenda = 0;
  let foraDeVenda = 0;
  let vgvTotal = 0;
  let vgvVendido = 0;
  let areaTotal = 0;
  let areaVendida = 0;

  for (const u of unidades) {
    const cat = classifyStatus(u.status);
    vgvTotal += u.valorTotal;
    areaTotal += u.area;
    if (cat === "vendido") {
      vendido++;
      vgvVendido += u.valorTotal;
      areaVendida += u.area;
    } else if (cat === "emVenda") {
      emVenda++;
    } else if (cat === "foraDeVenda") {
      foraDeVenda++;
    } else {
      disponivel++;
    }
  }

  // Per-quadra breakdown
  const quadrasMap = new Map<string, {
    total: number; disponivel: number; vendido: number; emVenda: number; foraDeVenda: number;
    vgvTotal: number; vgvVendido: number;
  }>();
  for (const u of unidades) {
    if (!quadrasMap.has(u.quadra)) {
      quadrasMap.set(u.quadra, { total: 0, disponivel: 0, vendido: 0, emVenda: 0, foraDeVenda: 0, vgvTotal: 0, vgvVendido: 0 });
    }
    const q = quadrasMap.get(u.quadra)!;
    q.total++;
    q.vgvTotal += u.valorTotal;
    const cat = classifyStatus(u.status);
    if (cat === "vendido") {
      q.vendido++;
      q.vgvVendido += u.valorTotal;
    } else if (cat === "emVenda") {
      q.emVenda++;
    } else if (cat === "foraDeVenda") {
      q.foraDeVenda++;
    } else {
      q.disponivel++;
    }
  }

  const quadras = Array.from(quadrasMap.entries())
    .map(([quadra, counts]) => ({ quadra, ...counts }))
    .sort((a, b) => {
      const numA = parseInt(a.quadra.replace(/\D/g, "")) || 0;
      const numB = parseInt(b.quadra.replace(/\D/g, "")) || 0;
      return numA - numB;
    });

  // Per-classificacao breakdown
  const classMap = new Map<string, { total: number; disponivel: number; vendido: number; foraDeVenda: number }>();
  for (const u of unidades) {
    const key = u.classificacao || "Sem classificação";
    if (!classMap.has(key)) {
      classMap.set(key, { total: 0, disponivel: 0, vendido: 0, foraDeVenda: 0 });
    }
    const c = classMap.get(key)!;
    c.total++;
    const cat = classifyStatus(u.status);
    if (cat === "vendido") {
      c.vendido++;
    } else if (cat === "foraDeVenda") {
      c.foraDeVenda++;
    } else {
      c.disponivel++;
    }
  }

  const classificacoes = Array.from(classMap.entries())
    .map(([nome, counts]) => ({ nome, ...counts }))
    .sort((a, b) => {
      const order = ["A", "B", "C", "D", "E", "F", "2A", "3A", "Sem classificação"];
      const ia = order.indexOf(a.nome);
      const ib = order.indexOf(b.nome);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

  const result: Record<string, unknown> = {
    status: "connected",
    summary: { total, disponivel, vendido, emVenda, foraDeVenda, vgvTotal, vgvVendido, areaTotal, areaVendida },
    quadras,
    unidades,
    classificacoes,
  };

  if (uauStatus) {
    result.uauStatus = uauStatus;
  }

  return result;
}

export const maxDuration = 60;

// ── Cache em memória (10min) ───────────────────────────────────────────────
// O Estoque é pesado (2x UAU 25s + 1x CRM 15s). Sem cache, TODA visita esperava
// ~40s. Com cache, só a 1ª chamada após expirar paga o custo.
let estoqueCache: { data: Record<string, unknown>; timestamp: number } | null = null;
const ESTOQUE_CACHE_TTL = 10 * 60 * 1000; // 10 minutos
let estoqueInflight: Promise<Record<string, unknown>> | null = null;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const debug = searchParams.get("debug") === "1";

  if (!isUauConfigured()) {
    return NextResponse.json(buildEnrichedResponse(null, "not_configured"));
  }

  // Cache hit (pula debug — debug sempre fresco)
  if (!debug && estoqueCache && Date.now() - estoqueCache.timestamp < ESTOQUE_CACHE_TTL) {
    return NextResponse.json({ ...estoqueCache.data, cached: true });
  }

  // Dedupe: se já tem uma requisição em vôo, espera ela em vez de disparar outra
  if (!debug && estoqueInflight) {
    const data = await estoqueInflight;
    return NextResponse.json({ ...data, cached: true });
  }

  // ── Fetch fresco (com inflight dedup + cache) ──
  const fetchPromise = (async (): Promise<Record<string, unknown>> => {
    const token = await authenticate();
    const integrationToken = process.env.UAU_INTEGRATION_TOKEN!;

    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const yyyy = now.getFullYear();
    const todayFormatted = `${mm}-${dd}-${yyyy}`;

    // Strategy: ERP UAU + CRM Eggs (status, metragem, valor mais atualizados)
    const [allLotsResult, soldEnrichResult, crmLotesResult] = await Promise.allSettled([
      fetchUnits(token, integrationToken, todayFormatted, "WHERE Empresa_unid = 2", false, 25000),
      fetchUnits(token, integrationToken, todayFormatted, "WHERE Empresa_unid = 2 AND Vendido_unid = 1", true, 25000),
      fetchCRMLotes(),
    ]);

    const crmLotes = crmLotesResult.status === "fulfilled" ? crmLotesResult.value : new Map<string, CRMLoteInfo>();

    // Debug mode (sempre fresco, nunca cacheado)
    if (debug) {
      const allLots = allLotsResult.status === "fulfilled" ? allLotsResult.value : [];
      const sold = soldEnrichResult.status === "fulfilled" ? soldEnrichResult.value : [];
      return {
        _debug: true,
        totalCount: allLots.length,
        soldCount: sold.length,
        allLotsError: allLotsResult.status === "rejected" ? String(allLotsResult.reason) : null,
        soldError: soldEnrichResult.status === "rejected" ? String(soldEnrichResult.reason) : null,
        colunas: allLots.length > 0 ? Object.keys(allLots[0]) : [],
        distinctStatuses: [...new Set(allLots.map(r => r.Descr_status))],
        distinctVendido: [...new Set(allLots.map(r => r.Vendido_unid))],
        amostra: allLots.slice(0, 2),
        amostraVendida: sold.slice(0, 1),
      };
    }

    const allLots = allLotsResult.status === "fulfilled" ? allLotsResult.value : [];
    const soldEnrich = soldEnrichResult.status === "fulfilled" ? soldEnrichResult.value : [];

    // Build a status-override map from sold enrichment (has more accurate price/status data)
    const soldOverride = new Map<string, UnitRow>();
    for (const row of soldEnrich) {
      if (row.Identificador_unid) soldOverride.set(row.Identificador_unid, row);
    }

    // Merge: use all-lots as base, overlay sold rows for enrichment
    const mergedRows = allLots.map(row => {
      const id = row.Identificador_unid || "";
      return soldOverride.has(id) ? { ...row, ...soldOverride.get(id) } : row;
    });

    // If all queries failed, fall back to static data
    if (mergedRows.length === 0) {
      const errMsgs = [
        allLotsResult.status === "rejected" ? String(allLotsResult.reason) : null,
        soldEnrichResult.status === "rejected" ? String(soldEnrichResult.reason) : null,
      ].filter(Boolean).join("; ");

      const response = buildEnrichedResponse(null, "offline");
      if (errMsgs) response.uauError = errMsgs;
      return response;
    }

    return buildEnrichedResponse(mergedRows, undefined, crmLotes);
  })();

  if (!debug) estoqueInflight = fetchPromise;

  try {
    const data = await fetchPromise;
    // Cacheia só respostas "connected" (sucesso real). Offline/erro não cacheia.
    if (!debug && data.status === "connected") {
      estoqueCache = { data, timestamp: Date.now() };
    }
    return NextResponse.json(data);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("UAU API error:", errMsg);
    const response = buildEnrichedResponse(null, "offline");
    response.uauError = errMsg;
    return NextResponse.json(response);
  } finally {
    if (!debug) estoqueInflight = null;
  }
}
