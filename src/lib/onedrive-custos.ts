import { list, put } from "@vercel/blob";
import * as XLSX from "xlsx";

const ONEDRIVE_FILE_PATH = (process.env.ONEDRIVE_CUSTOS_FILE_PATH || "/Controle de investimento cenario.xlsx").trim().replace(/\\n/g, "");
const TOKEN_BLOB_NAME = "onedrive-token.json";

// Cache compartilhado entre /api/custos-offline e /api/canais
let dataCache: { data: ParsedCustos; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export interface CustoMensal {
  mes: string;
  outdoor: number;
  radio: number;
  jornal: number;
  evento: number;
  outros: number;
  total_offline: number;
}

export interface LancamentoOffline {
  canal: string;
  valor: number;
  mes: string;
  data_pgto: string;
  inicio_veic: string;
  fim_veic: string;
  descricao: string;
}

export interface ParsedCustos {
  custosMensais: CustoMensal[];
  lancamentos: LancamentoOffline[];
  total_offline: number;
  sheets: string[];
}

const CANAIS_OFFLINE = ["Outdoor", "Radio", "Rádio", "Jornal", "Evento", "Outros"];

function normalizeCanal(canal: string): string {
  const c = canal.trim();
  if (c.toLowerCase() === "radio" || c === "Rádio") return "Rádio";
  return c;
}

function parseExcelDate(val: unknown): string {
  if (!val) return "";
  if (typeof val === "number") {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(val);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.split("T")[0];
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
    const [dd, mm, yyyy] = s.split("/");
    return `${yyyy}-${mm}-${dd}`;
  }
  return "";
}

function parseWorkbook(workbook: XLSX.WorkBook): ParsedCustos {
  // ── 1. Aba _DASHBOARD (A5:J23) — totais mensais ──
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

  // ── 2. Aba GASTOS (B26:L500) — lançamentos individuais ──
  const lancamentos: LancamentoOffline[] = [];
  const sheetGastos = workbook.Sheets["GASTOS"];
  if (sheetGastos) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheetGastos, {
      range: "B26:L500",
      header: ["mes", "canal", "descricao", "fornecedor", "data_pgto", "valor", "forma_pgto", "obs", "inicio_veic", "fim_veic", "recorrente"],
    });
    for (const r of rows) {
      const canal = String(r.canal || "").trim();
      if (!canal) continue;
      if (!CANAIS_OFFLINE.some((c) => c.toLowerCase() === canal.toLowerCase())) continue;
      const valor = Number(r.valor) || 0;
      if (valor === 0) continue;

      lancamentos.push({
        canal: normalizeCanal(canal),
        valor,
        mes: String(r.mes || "").trim(),
        data_pgto: parseExcelDate(r.data_pgto),
        inicio_veic: parseExcelDate(r.inicio_veic),
        fim_veic: parseExcelDate(r.fim_veic),
        descricao: String(r.descricao || ""),
      });
    }
  }

  const total_offline = custosMensais.reduce((s, r) => s + r.total_offline, 0);

  return { custosMensais, lancamentos, total_offline, sheets: workbook.SheetNames };
}

async function getAccessToken(): Promise<string> {
  const CLIENT_ID = process.env.ONEDRIVE_CLIENT_ID || "";
  const CLIENT_SECRET = process.env.ONEDRIVE_CLIENT_SECRET || "";

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("ONEDRIVE_CLIENT_ID e ONEDRIVE_CLIENT_SECRET não configurados");
  }

  const { blobs } = await list({ prefix: TOKEN_BLOB_NAME });
  if (blobs.length === 0) {
    throw new Error("OneDrive não conectado. Vá em APIs → OneDrive e autorize o acesso.");
  }

  const tokenRes = await fetch(blobs[0].url, { cache: "no-store" });
  if (!tokenRes.ok) throw new Error("Erro ao ler token do OneDrive");

  const tokenData = await tokenRes.json();

  if (tokenData.access_token && tokenData.expires_at && Date.now() < tokenData.expires_at - 60000) {
    return tokenData.access_token;
  }

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

  if (newTokens.refresh_token) {
    const updatedPayload = {
      refresh_token: newTokens.refresh_token,
      access_token: newTokens.access_token,
      expires_at: Date.now() + (newTokens.expires_in * 1000),
      scope: newTokens.scope,
      connected_at: tokenData.connected_at,
      last_refreshed: new Date().toISOString(),
    };
    put(TOKEN_BLOB_NAME, JSON.stringify(updatedPayload), {
      access: "public",
      addRandomSuffix: false,
    }).catch((err) => console.warn("Falha ao salvar novo refresh token:", err));
  }

  return newTokens.access_token;
}

async function downloadFromOneDrive(): Promise<ArrayBuffer> {
  const accessToken = await getAccessToken();
  const segments = ONEDRIVE_FILE_PATH.split("/").filter(Boolean);

  if (segments.length === 0) {
    throw new Error("ONEDRIVE_CUSTOS_FILE_PATH vazio.");
  }

  let currentId = "root";
  for (const segment of segments) {
    const listUrl = currentId === "root"
      ? "https://graph.microsoft.com/v1.0/me/drive/root/children?$select=name,id&$top=200"
      : `https://graph.microsoft.com/v1.0/me/drive/items/${currentId}/children?$select=name,id&$top=200`;

    const res = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    if (!res.ok) throw new Error(`Erro ao listar pasta no OneDrive (${res.status})`);

    const data = await res.json();
    const items: { name: string; id: string }[] = data.value || [];
    const match = items.find((item) => item.name === segment);

    if (!match) {
      const available = items.slice(0, 15).map((i) => i.name).join(", ");
      throw new Error(`"${segment}" não encontrado. Itens disponíveis: ${available}`);
    }

    currentId = match.id;
  }

  const contentRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${currentId}/content`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      redirect: "follow",
      cache: "no-store",
    }
  );

  if (!contentRes.ok) throw new Error(`Erro ao baixar arquivo (${contentRes.status})`);

  return contentRes.arrayBuffer();
}

// API pública: retorna os dados parseados do Excel, com cache de 5 min
export async function getCustosOffline(): Promise<ParsedCustos> {
  if (dataCache && Date.now() - dataCache.timestamp < CACHE_TTL) {
    return dataCache.data;
  }

  const buffer = await downloadFromOneDrive();
  const workbook = XLSX.read(buffer, { type: "array" });
  const parsed = parseWorkbook(workbook);

  dataCache = { data: parsed, timestamp: Date.now() };
  return parsed;
}

// Limpa o cache (usado pelo POST clear-cache)
export function clearCustosCache() {
  dataCache = null;
}

// Lista arquivos do OneDrive (para o POST list-files)
export async function listOnedriveFiles(folder: string = "/") {
  const accessToken = await getAccessToken();
  const encodedPath = folder === "/" ? "" : `:${folder.split("/").map(encodeURIComponent).join("/")}:`;
  const url = `https://graph.microsoft.com/v1.0/me/drive/root${encodedPath}/children?$filter=file ne null&$select=name,id,size,lastModifiedDateTime&$top=50`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw new Error(`Erro ao listar arquivos (${res.status})`);

  const data = await res.json();
  return (data.value || [])
    .filter((f: { name: string }) => f.name.endsWith(".xlsx") || f.name.endsWith(".xls"))
    .map((f: { name: string; id: string; size: number; lastModifiedDateTime: string }) => ({
      name: f.name,
      id: f.id,
      size: f.size,
      lastModified: f.lastModifiedDateTime,
    }));
}
