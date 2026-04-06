import { NextResponse } from "next/server";
import lotesData from "@/data/lotes.json";
import { authenticate, UAU_API, isUauConfigured, uauHeaders } from "@/lib/uau-auth";

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
  uauStatus?: string
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
      const { quadra, lote, loteNum } = parseIdentifier(id);

      // Determine status
      let status = row.Descr_status || "";
      if (!status) {
        status = row.Vendido_unid === 1 ? "Vendida" : "Disponível";
      }

      // Area: prefer static JSON, fallback to FracaoIdeal_unid
      const area = staticLote?.area ?? (Number(row.FracaoIdeal_unid) || 0);

      // Price: prefer static JSON, fallback to UAU fields
      const valorTotal =
        staticLote?.valorTotal ??
        (Number(row.ValorTotal) || Number(row.ValPreco_unid) || 0);

      const valorM2 =
        staticLote?.valorM2 ??
        (area > 0 && valorTotal > 0 ? valorTotal / area : Number(row.ValPreco_unid) || 0);

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

  // If API returned nothing, fall back to static JSON with "Disponível" status
  if (uauRows === null || unidadesMap.size === 0) {
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

  const unidades = Array.from(unidadesMap.values());

  // Summary counters
  const total = unidades.length;
  let disponivel = 0;
  let vendido = 0;
  let emVenda = 0;
  let vgvTotal = 0;
  let vgvVendido = 0;
  let areaTotal = 0;
  let areaVendida = 0;

  for (const u of unidades) {
    const s = u.status.toLowerCase();
    vgvTotal += u.valorTotal;
    areaTotal += u.area;
    if (s.includes("vendid")) {
      vendido++;
      vgvVendido += u.valorTotal;
      areaVendida += u.area;
    } else if (s.includes("em venda") || s.includes("em_venda")) {
      emVenda++;
    } else {
      disponivel++;
    }
  }

  // Per-quadra breakdown
  const quadrasMap = new Map<string, {
    total: number; disponivel: number; vendido: number; emVenda: number;
    vgvTotal: number; vgvVendido: number;
  }>();
  for (const u of unidades) {
    if (!quadrasMap.has(u.quadra)) {
      quadrasMap.set(u.quadra, { total: 0, disponivel: 0, vendido: 0, emVenda: 0, vgvTotal: 0, vgvVendido: 0 });
    }
    const q = quadrasMap.get(u.quadra)!;
    q.total++;
    q.vgvTotal += u.valorTotal;
    const s = u.status.toLowerCase();
    if (s.includes("vendid")) {
      q.vendido++;
      q.vgvVendido += u.valorTotal;
    } else if (s.includes("em venda") || s.includes("em_venda")) {
      q.emVenda++;
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
  const classMap = new Map<string, { total: number; disponivel: number; vendido: number }>();
  for (const u of unidades) {
    const key = u.classificacao || "Sem classificação";
    if (!classMap.has(key)) {
      classMap.set(key, { total: 0, disponivel: 0, vendido: 0 });
    }
    const c = classMap.get(key)!;
    c.total++;
    const s = u.status.toLowerCase();
    if (s.includes("vendid")) {
      c.vendido++;
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
    summary: { total, disponivel, vendido, emVenda, vgvTotal, vgvVendido, areaTotal, areaVendida },
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const debug = searchParams.get("debug") === "1";

  if (!isUauConfigured()) {
    return NextResponse.json(buildEnrichedResponse(null, "not_configured"));
  }

  try {
    const token = await authenticate();
    const integrationToken = process.env.UAU_INTEGRATION_TOKEN!;

    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const yyyy = now.getFullYear();
    const todayFormatted = `${mm}-${dd}-${yyyy}`;

    // Fetch available (0), sold (1), and blocked (2) in parallel
    // Also try "all" with no Vendido filter (retorna_venda:false) in debug mode
    const [availableRows, soldRows, blockedRows] = await Promise.allSettled([
      fetchUnits(token, integrationToken, todayFormatted, "WHERE Empresa_unid = 2 AND Vendido_unid = 0", false, 25000),
      fetchUnits(token, integrationToken, todayFormatted, "WHERE Empresa_unid = 2 AND Vendido_unid = 1", true, 25000),
      fetchUnits(token, integrationToken, todayFormatted, "WHERE Empresa_unid = 2 AND Vendido_unid = 2", false, 25000),
    ]);

    // Debug mode: return raw info about what came back
    if (debug) {
      const avail = availableRows.status === "fulfilled" ? availableRows.value : [];
      const sold = soldRows.status === "fulfilled" ? soldRows.value : [];
      const blocked = blockedRows.status === "fulfilled" ? blockedRows.value : [];
      const allRows = [...avail, ...sold, ...blocked];
      return NextResponse.json({
        availableCount: avail.length,
        soldCount: sold.length,
        blockedCount: blocked.length,
        totalCount: allRows.length,
        availableError: availableRows.status === "rejected" ? String(availableRows.reason) : null,
        soldError: soldRows.status === "rejected" ? String(soldRows.reason) : null,
        blockedError: blockedRows.status === "rejected" ? String(blockedRows.reason) : null,
        colunas: allRows.length > 0 ? Object.keys(allRows[0]) : [],
        amostraDisponivel: avail.slice(0, 2),
        amostraVendida: sold.slice(0, 2),
        amostraBloqueada: blocked.slice(0, 2),
      });
    }

    const avail = availableRows.status === "fulfilled" ? availableRows.value : [];
    const sold = soldRows.status === "fulfilled" ? soldRows.value : [];
    const blocked = blockedRows.status === "fulfilled" ? blockedRows.value : [];
    const allRows = [...avail, ...sold, ...blocked];

    // If all queries failed, fall back to static data
    if (allRows.length === 0) {
      const errMsgs = [
        availableRows.status === "rejected" ? String(availableRows.reason) : null,
        soldRows.status === "rejected" ? String(soldRows.reason) : null,
        blockedRows.status === "rejected" ? String(blockedRows.reason) : null,
      ].filter(Boolean).join("; ");

      const response = buildEnrichedResponse(null, "offline");
      if (errMsgs) response.uauError = errMsgs;
      return NextResponse.json(response);
    }

    return NextResponse.json(buildEnrichedResponse(allRows));
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("UAU API error:", errMsg);
    const response = buildEnrichedResponse(null, "offline");
    response.uauError = errMsg;
    return NextResponse.json(response);
  }
}
