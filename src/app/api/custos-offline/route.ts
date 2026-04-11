import { NextRequest, NextResponse } from "next/server";
import { list, put } from "@vercel/blob";
import * as XLSX from "xlsx";

export const maxDuration = 30;

// Caminho do arquivo Excel no OneDrive (pode ser configurado via env ou POST)
const ONEDRIVE_FILE_PATH = process.env.ONEDRIVE_CUSTOS_FILE_PATH || "/Controle de investimento cenario.xlsx";
const TOKEN_BLOB_NAME = "onedrive-token.json";

// Cache in-memory (5 min TTL)
let cache: { data: unknown; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

interface CustoMensal {
  mes: string;
  outdoor: number;
  radio: number;
  jornal: number;
  evento: number;
  outros: number;
  total_offline: number;
}

interface TimelineEntry {
  data: string;
  canal: string;
  valor: number;
  descricao: string;
}

function parseExcelDate(val: unknown): string {
  if (!val) return "";
  if (typeof val === "number") {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) {
      return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    }
  }
  const s = String(val);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.split("T")[0];
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
    const [dd, mm, yyyy] = s.split("/");
    return `${yyyy}-${mm}-${dd}`;
  }
  return s;
}

const CANAIS_OFFLINE = ["Outdoor", "Radio", "Rádio", "Jornal", "Evento", "Outros"];

function normalizeCanal(canal: string): string {
  const c = canal.trim();
  if (c.toLowerCase() === "radio" || c === "Rádio") return "Rádio";
  return c;
}

function parseWorkbook(workbook: XLSX.WorkBook) {
  // ── 1. Dados mensais agregados (aba _DASHBOARD, A5:J23) ──
  const custosMensais: CustoMensal[] = [];
  const sheetDash = workbook.Sheets["_DASHBOARD"];
  if (sheetDash) {
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheetDash, {
      range: "A5:J23",
      header: ["mes", "meta_ads", "google_ads", "outdoor", "radio", "site", "jornal", "evento", "outros", "total"],
    });
    for (const r of raw) {
      const mes = String(r.mes || "").trim();
      if (!mes || mes === "Mes" || mes === "Mês") continue;

      const outdoor = Number(r.outdoor) || 0;
      const radio = Number(r.radio) || 0;
      const jornal = Number(r.jornal) || 0;
      const evento = Number(r.evento) || 0;
      const outros = Number(r.outros) || 0;

      custosMensais.push({
        mes, outdoor, radio, jornal, evento, outros,
        total_offline: outdoor + radio + jornal + evento + outros,
      });
    }
  }

  // ── 2. Dados individuais com data (aba GASTOS, a partir da linha 26) ──
  const timeline: TimelineEntry[] = [];
  const sheetGastos = workbook.Sheets["GASTOS"];
  if (sheetGastos) {
    const gastos = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheetGastos, {
      range: "A26:J500",
      header: ["mes", "canal", "descricao", "fornecedor", "data_pgto", "valor", "forma_pgto", "obs", "status", "recorrente"],
    });
    for (const r of gastos) {
      const canal = String(r.canal || "").trim();
      if (!canal) continue;
      if (!CANAIS_OFFLINE.some((c) => c.toLowerCase() === canal.toLowerCase())) continue;
      const data = parseExcelDate(r.data_pgto);
      const valor = Number(r.valor) || 0;
      if (!data || valor === 0) continue;

      timeline.push({
        data,
        canal: normalizeCanal(canal),
        valor,
        descricao: String(r.descricao || ""),
      });
    }
    timeline.sort((a, b) => a.data.localeCompare(b.data));
  }

  const total_offline = custosMensais.reduce((s, r) => s + r.total_offline, 0);

  return { custosMensais, timeline, total_offline };
}

// ── Obter access token do OneDrive via refresh token salvo no Blob ──
async function getAccessToken(): Promise<string> {
  const CLIENT_ID = process.env.ONEDRIVE_CLIENT_ID || "";
  const CLIENT_SECRET = process.env.ONEDRIVE_CLIENT_SECRET || "";

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("ONEDRIVE_CLIENT_ID e ONEDRIVE_CLIENT_SECRET não configurados");
  }

  // Ler refresh token do Vercel Blob
  const { blobs } = await list({ prefix: TOKEN_BLOB_NAME });
  if (blobs.length === 0) {
    throw new Error("OneDrive não conectado. Vá em APIs → OneDrive e autorize o acesso.");
  }

  const tokenRes = await fetch(blobs[0].url, { cache: "no-store" });
  if (!tokenRes.ok) {
    throw new Error("Erro ao ler token do OneDrive");
  }

  const tokenData = await tokenRes.json();

  // Checar se o access token ainda é válido
  if (tokenData.access_token && tokenData.expires_at && Date.now() < tokenData.expires_at - 60000) {
    return tokenData.access_token;
  }

  // Refresh do token
  const refreshRes = await fetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: tokenData.refresh_token,
      grant_type: "refresh_token",
      scope: "Files.Read Files.Read.All offline_access",
    }),
  });

  if (!refreshRes.ok) {
    const errText = await refreshRes.text();
    throw new Error(`Refresh token expirado ou inválido (${refreshRes.status}). Reconecte o OneDrive. ${errText}`);
  }

  const newTokens = await refreshRes.json();

  // Salvar novo refresh token no Blob (Microsoft retorna um novo a cada refresh)
  // Isso renova o prazo de 90 dias de inatividade automaticamente
  if (newTokens.refresh_token) {
    const updatedPayload = {
      refresh_token: newTokens.refresh_token,
      access_token: newTokens.access_token,
      expires_at: Date.now() + (newTokens.expires_in * 1000),
      scope: newTokens.scope,
      connected_at: tokenData.connected_at,
      last_refreshed: new Date().toISOString(),
    };

    // Fire-and-forget: não bloqueia o request principal
    put(TOKEN_BLOB_NAME, JSON.stringify(updatedPayload), {
      access: "public",
      addRandomSuffix: false,
    }).catch((err) => console.warn("Falha ao salvar novo refresh token:", err));
  }

  return newTokens.access_token;
}

// ── Download do arquivo Excel do OneDrive via Graph API ──
async function downloadFromOneDrive(): Promise<ArrayBuffer> {
  const accessToken = await getAccessToken();
  const filePath = ONEDRIVE_FILE_PATH;

  // Buscar arquivo pelo caminho no OneDrive
  // Encode path segments for URL
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  const url = `https://graph.microsoft.com/v1.0/me/drive/root:${encodedPath}:/content`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    redirect: "follow",
    cache: "no-store",
  });

  if (res.status === 404) {
    // Tentar buscar pelo nome em root
    const searchUrl = `https://graph.microsoft.com/v1.0/me/drive/root/search(q='${encodeURIComponent(filePath.replace(/^\//, "").replace(/\.xlsx$/, ""))}')?$top=5&$select=name,id,size,lastModifiedDateTime`;
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const files = searchData.value || [];

      if (files.length > 0) {
        // Pegar o primeiro resultado que é xlsx
        const xlsxFile = files.find((f: { name: string }) => f.name.endsWith(".xlsx") || f.name.endsWith(".xls")) || files[0];
        const contentUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${xlsxFile.id}/content`;
        const contentRes = await fetch(contentUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
          redirect: "follow",
          cache: "no-store",
        });

        if (contentRes.ok) {
          return contentRes.arrayBuffer();
        }
      }
    }

    throw new Error(`Arquivo não encontrado no OneDrive: ${filePath}. Verifique o caminho na variável ONEDRIVE_CUSTOS_FILE_PATH.`);
  }

  if (!res.ok) {
    throw new Error(`Erro ao baixar arquivo do OneDrive (${res.status}): ${await res.text()}`);
  }

  return res.arrayBuffer();
}

// ── GET: read Excel from OneDrive and parse ──
export async function GET() {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  try {
    const buffer = await downloadFromOneDrive();
    const workbook = XLSX.read(buffer, { type: "array" });
    const parsed = parseWorkbook(workbook);

    const result = {
      ...parsed,
      updated_at: new Date().toISOString(),
      source: "onedrive",
      sheets: workbook.SheetNames,
    };

    cache = { data: result, timestamp: Date.now() };
    return NextResponse.json(result);
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Custos offline GET error:", errMsg);
    return NextResponse.json(
      { error: errMsg, custosMensais: [], timeline: [], total_offline: 0 },
      { status: 200 }
    );
  }
}

// ── POST: ações administrativas ──
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    // Limpar cache (forçar re-leitura do OneDrive)
    if (body.action === "clear-cache") {
      cache = null;
      return NextResponse.json({ success: true, message: "Cache limpo. Próximo GET lerá do OneDrive." });
    }

    // Buscar arquivos do OneDrive (para o user escolher o arquivo)
    if (body.action === "list-files") {
      const accessToken = await getAccessToken();
      const folder = body.folder || "/";
      const encodedPath = folder === "/" ? "" : `:${folder.split("/").map(encodeURIComponent).join("/")}:`;
      const url = `https://graph.microsoft.com/v1.0/me/drive/root${encodedPath}/children?$filter=file ne null&$select=name,id,size,lastModifiedDateTime&$top=50`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        return NextResponse.json({ error: `Erro ao listar arquivos (${res.status})` }, { status: 400 });
      }

      const data = await res.json();
      const files = (data.value || [])
        .filter((f: { name: string }) => f.name.endsWith(".xlsx") || f.name.endsWith(".xls"))
        .map((f: { name: string; id: string; size: number; lastModifiedDateTime: string }) => ({
          name: f.name,
          id: f.id,
          size: f.size,
          lastModified: f.lastModifiedDateTime,
        }));

      return NextResponse.json({ files });
    }

    // Testar leitura do arquivo configurado
    if (body.action === "test") {
      const buffer = await downloadFromOneDrive();
      const workbook = XLSX.read(buffer, { type: "array" });
      const parsed = parseWorkbook(workbook);
      cache = null; // limpa cache antigo

      return NextResponse.json({
        success: true,
        sheets: workbook.SheetNames,
        custosMensais: parsed.custosMensais.length,
        timeline: parsed.timeline.length,
        total_offline: parsed.total_offline,
      });
    }

    return NextResponse.json({ error: "Ação não reconhecida. Use: clear-cache, list-files, test" }, { status: 400 });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Custos offline POST error:", errMsg);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
