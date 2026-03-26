import { NextResponse } from "next/server";
import lotesData from "@/data/lotes.json";

const UAU_API = process.env.UAU_API_URL || "https://gamma-api.seniorcloud.com.br:51928/uauAPI";

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

async function authenticate(): Promise<string> {
  const login = process.env.UAU_LOGIN;
  const senha = process.env.UAU_PASSWORD;
  const integrationToken = process.env.UAU_INTEGRATION_TOKEN;

  if (!login || !senha || !integrationToken) {
    throw new Error("Credenciais UAU não configuradas");
  }

  const res = await fetch(
    `${UAU_API}/api/v1/Autenticador/AutenticarUsuario`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-INTEGRATION-Authorization": integrationToken,
      },
      body: JSON.stringify({ login, senha }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Autenticação falhou: ${res.status} — ${err}`);
  }

  const text = await res.text();
  const token = text.replace(/^"|"$/g, "");
  if (!token) {
    throw new Error("Token vazio na resposta de autenticação");
  }

  return token;
}

interface UnitRow {
  Identificador_unid?: string;
  Vendido_unid?: number;
  Descr_status?: string;
  FracaoIdeal_unid?: number;
  DataCad_unid?: string;
}

// Build a lookup map from static data
const lotesMap = new Map<string, LoteStatic>();
for (const l of lotesData as LoteStatic[]) {
  lotesMap.set(l.id, l);
}

function buildEnrichedResponse(
  uauUnits: Array<{ identificador: string; status: string }> | null,
  uauStatus?: string
) {
  const statusMap = new Map<string, string>();
  if (uauUnits) {
    for (const u of uauUnits) {
      statusMap.set(u.identificador, u.status);
    }
  }

  const unidades: Array<{
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
  }> = [];

  for (const lote of lotesData as LoteStatic[]) {
    const id = lote.id;
    let status = "Disponível";
    if (uauUnits) {
      const uauSt = statusMap.get(id);
      if (uauSt) {
        status = uauSt;
      }
    }

    unidades.push({
      identificador: id,
      quadra: `Q${lote.quadra}`,
      lote: `L${lote.lote}`,
      loteNum: lote.lote,
      status,
      area: lote.area,
      valorTotal: lote.valorTotal,
      valorM2: lote.valorM2,
      classificacao: lote.classificacao,
      rua: lote.rua,
    });
  }

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

  const quadrasMap = new Map<string, { total: number; disponivel: number; vendido: number; emVenda: number; vgvTotal: number; vgvVendido: number }>();
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

  const classMap = new Map<string, { total: number; disponivel: number; vendido: number }>();
  for (const u of unidades) {
    if (!classMap.has(u.classificacao)) {
      classMap.set(u.classificacao, { total: 0, disponivel: 0, vendido: 0 });
    }
    const c = classMap.get(u.classificacao)!;
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
      const order = ["A", "B", "C", "D", "E", "F", "2A", "3A"];
      return order.indexOf(a.nome) - order.indexOf(b.nome);
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

export const maxDuration = 30;

export async function GET() {
  const integrationToken = process.env.UAU_INTEGRATION_TOKEN;

  if (!process.env.UAU_LOGIN || !process.env.UAU_PASSWORD || !integrationToken) {
    return NextResponse.json(buildEnrichedResponse(null, "not_configured"));
  }

  try {
    const token = await authenticate();

    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const yyyy = now.getFullYear();
    const todayFormatted = `${mm}-${dd}-${yyyy}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

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
          where: "WHERE Empresa_unid = 2",
          retorna_venda: true,
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

    const myTable: Record<string, unknown>[] = Array.isArray(raw) && raw.length > 0 && raw[0]?.MyTable
      ? raw[0].MyTable
      : [];

    const dataRows: UnitRow[] = myTable.length > 1 ? myTable.slice(1) as UnitRow[] : [];

    const uauUnits = dataRows
      .filter((row) => row.Identificador_unid)
      .map((row) => {
        const id = row.Identificador_unid || "";
        let status = row.Descr_status || "Desconhecido";
        if (!row.Descr_status) {
          status = row.Vendido_unid === 1 ? "Vendida" : "Disponível";
        }
        return { identificador: id, status };
      })
      .filter((u) => lotesMap.has(u.identificador));

    return NextResponse.json(buildEnrichedResponse(uauUnits));
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("UAU API error:", errMsg);
    const response = buildEnrichedResponse(null, "offline");
    response.uauError = errMsg;
    return NextResponse.json(response);
  }
}
