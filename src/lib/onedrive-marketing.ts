/**
 * OneDrive Marketing — parser do Cenario_Marketing.xlsx
 *
 * Lê o Excel mestre de marketing do OneDrive e expõe dados estruturados:
 *  - Premissas (VGV, lotes, budget, CAC alvo)
 *  - Gastos (lançamentos detalhados com Natureza + Centro de Custo)
 *  - Plano vs Realizado mensal (18 meses)
 *  - Mix de canais por fase
 *  - Resumo de eventos
 *
 * O lib também é fonte para a camada legacy `onedrive-custos.ts` que projeta
 * os dados em `LancamentoOffline[]` para os endpoints antigos.
 */
import { list, put } from "@vercel/blob";
import * as XLSX from "xlsx";

const ONEDRIVE_FILE_PATH = (process.env.ONEDRIVE_CUSTOS_FILE_PATH ||
  "/Cenário dos Lagos/90-100 Pessoal/Cenario_Marketing.xlsx").trim().replace(/\\n/g, "");
const TOKEN_BLOB_NAME = "onedrive-token.json";

const CACHE_TTL = 60 * 1000; // 60s — TabMarketing chama clear-cache no mount, isso é só pra burst protection
let dataCache: { data: MarketingData; timestamp: number } | null = null;
// Cache do file ID — não muda enquanto o arquivo não for movido/renomeado
let fileIdCache: { id: string; path: string } | null = null;

// ── Tipos ──────────────────────────────────────────────────────────────────
export interface Premissas {
  vgv: number;
  totalLotes: number;
  valorMedioLote: number;
  prazoComercializacaoMeses: number;
  pctMarketing: number;          // 0.02 = 2%
  budgetMarketing: number;       // VGV * pctMarketing
  velocidadeAlvo: number;        // lotes/mês
  cacMaximo: number;
  ipca: number;
  pctComissaoImobiliaria: number;
  pctComissaoEggs: number;
  mesInicialSerial: number;
  horizonteMeses: number;
}

export interface NaturezaInfo {
  natureza: string;       // "Outdoor"
  grupoPlano: string;     // "2. Mídia Offline Local"
  categoria: string;      // "Mídia Paga Offline"
  ativo: boolean;
  canalDashboard: string | null; // mapeado para canais do dashboard (null = ignorar)
}

export interface Gasto {
  data: string;           // ISO yyyy-mm-dd
  dataSerial: number;     // serial Excel
  mes: string;            // "Abr/26"
  natureza: string;       // "Outdoor"
  centroCusto: string;    // "Mídia Geral" | "Meeting" | ...
  descricao: string;
  valor: number;
  formaPgto: string;
  observacao: string;
  fornecedor: string;
  // Derivados
  grupoPlano: string;     // do MODELO
  canalDashboard: string | null;
  isEvento: boolean;      // centroCusto é um evento (não Mídia Geral/Pré-lançamento/Operacional)
}

export interface MesPlanoRealizado {
  mes: string;            // "Abr/26"
  mesIdx: number;         // 1..18
  planoSugerido: number;
  planoOverride: number | null;
  planoEfetivo: number;
  realizado: number;
  saldo: number;          // planoEfetivo - realizado
  pctConsumido: number;   // realizado/planoEfetivo
}

export interface MixFase {
  fase: string;           // "Fase 1 (M1-M3)"
  faseIdx: number;        // 1..5
  porGrupo: Record<string, number>; // "1. Mídia Digital Performance" => 0.30
}

export interface Evento {
  centroCusto: string;
  tipo: string;           // "Lançamento Corretores"
  data: string;           // ISO
  dataSerial: number;
  status: string;         // "Realizado" | "Em Execução" | "Planejado"
  totalGasto: number;
}

export interface NaoEvento {
  centroCusto: string;    // "Mídia Geral" | "Pré-lançamento" | "Operacional Geral"
  totalGasto: number;
}

export interface ResumoPorGrupo {
  grupo: string;
  totalGasto: number;
  pctOrcamento: number;   // totalGasto / budgetMarketing
}

export interface MarketingData {
  premissas: Premissas;
  naturezas: NaturezaInfo[];
  gastos: Gasto[];
  planoMensal: MesPlanoRealizado[];
  mixFases: MixFase[];
  eventos: Evento[];
  naoEventos: NaoEvento[];
  resumoPorGrupo: ResumoPorGrupo[];
  totalRealizado: number;
  pctBudgetConsumido: number;
  sheets: string[];
  filePath: string;
  fetchedAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (v === null || v === undefined || v === "") return 0;
  const s = String(v).replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function excelSerialToISO(serial: unknown): string {
  if (typeof serial !== "number" || !Number.isFinite(serial)) {
    const s = str(serial);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.split("T")[0];
    return "";
  }
  const d = XLSX.SSF.parse_date_code(serial);
  if (!d) return "";
  return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
}

// Mapeia Natureza do Excel → canal do dashboard. null = ignorar (já coberto por API).
const NATUREZA_PARA_CANAL: Record<string, string | null> = {
  "Meta Ads": null,
  "Google Ads": null,
  "Assessoria/Influence": "Outros",
  "Outdoor": "Outdoor",
  "Painel": "Outdoor",
  "Radio": "Rádio",
  "Rádio": "Rádio",
  "Jornal": "Jornal",
  "TV": "Jornal",
  "Audio Visual": "Outros",
  "Agencia": "Outros",
  "Agência": "Outros",
  "Grafica": "Outros",
  "Gráfica": "Outros",
  "Site": "Site",
  "Sistema": "Site",
  "Buffet": "Evento",
  "Locação": "Evento",
  "Decoração": "Evento",
  "Brinde": "Evento",
  "Patrocínio": "Evento",
  "Outros": "Outros",
};

const CENTROS_NAO_EVENTO = new Set(["Mídia Geral", "Pré-lançamento", "Pre-lancamento", "Operacional Geral"]);

// ── Parsers por aba ────────────────────────────────────────────────────────
function parsePremissas(ws: XLSX.WorkSheet | undefined): Premissas {
  const fallback: Premissas = {
    vgv: 0, totalLotes: 174, valorMedioLote: 0, prazoComercializacaoMeses: 15,
    pctMarketing: 0.02, budgetMarketing: 0, velocidadeAlvo: 0, cacMaximo: 0,
    ipca: 0.045, pctComissaoImobiliaria: 0.05, pctComissaoEggs: 0.015,
    mesInicialSerial: 0, horizonteMeses: 192,
  };
  if (!ws) return fallback;

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    range: "B4:E25",
    header: ["premissa", "valor", "unidade", "obs"],
    defval: "",
  });

  const find = (regex: RegExp): number => {
    const row = rows.find((r) => regex.test(str(r.premissa)));
    return row ? num(row.valor) : 0;
  };

  const vgv = find(/^VGV Inicial/i) || find(/VGV/i);
  const totalLotes = find(/Total de Lotes/i) || 174;
  const valorMedio = find(/Valor M[eé]dio do Lote/i);
  const prazo = find(/Prazo de Comercializa/i);
  const pct = find(/% do VGV/i);
  const budget = find(/Or[çc]amento Total/i);
  const veloc = find(/Velocidade/i);
  const cac = find(/CAC M[aá]ximo/i);
  const ipca = find(/IPCA/i);
  const comImob = find(/Comiss[aã]o Imobili[aá]ria/i);
  const comEggs = find(/Comiss[aã]o Eggs/i);
  const mesIni = find(/M[eê]s Inicial/i);
  const horizonte = find(/Horizonte/i);

  return {
    vgv: vgv || 0,
    totalLotes: totalLotes || 174,
    valorMedioLote: valorMedio || (totalLotes > 0 ? vgv / totalLotes : 0),
    prazoComercializacaoMeses: prazo || 15,
    pctMarketing: pct || 0.02,
    budgetMarketing: budget || vgv * (pct || 0.02),
    velocidadeAlvo: veloc || 0,
    cacMaximo: cac || 0,
    ipca: ipca || 0.045,
    pctComissaoImobiliaria: comImob || 0.05,
    pctComissaoEggs: comEggs || 0.015,
    mesInicialSerial: mesIni || 0,
    horizonteMeses: horizonte || 192,
  };
}

function parseModelo(ws: XLSX.WorkSheet | undefined): NaturezaInfo[] {
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    range: "B4:E40",
    header: ["natureza", "grupo", "categoria", "ativo"],
    defval: "",
  });
  const result: NaturezaInfo[] = [];
  for (const r of rows) {
    const natureza = str(r.natureza);
    if (!natureza || natureza === "Natureza") continue;
    const grupo = str(r.grupo);
    if (!grupo) continue; // pula linhas vazias / "Calendário"
    result.push({
      natureza,
      grupoPlano: grupo,
      categoria: str(r.categoria),
      ativo: /^sim$/i.test(str(r.ativo)),
      canalDashboard: NATUREZA_PARA_CANAL[natureza] ?? "Outros",
    });
  }
  return result;
}

function parseGastos(ws: XLSX.WorkSheet | undefined, naturezas: NaturezaInfo[]): Gasto[] {
  if (!ws) return [];
  const naturezaMap = new Map(naturezas.map((n) => [n.natureza, n]));
  const naturezaValidas = new Set(naturezas.map((n) => n.natureza));

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    range: "B5:M500",
    header: [
      "data", "mes", "natureza", "centroCusto", "descricao", "valor",
      "_r1", "formaPgto", "obs", "fornecedor", "_r2", "_r3",
    ],
    defval: "",
  });
  const gastos: Gasto[] = [];
  for (const r of rows) {
    const natureza = str(r.natureza);
    // só linhas com Natureza válida (do MODELO) — descarta lixo de tabelas auxiliares no fim da aba
    if (!natureza || natureza === "Natureza" || !naturezaValidas.has(natureza)) continue;
    const valor = num(r.valor);
    if (valor === 0) continue;
    const centroCusto = str(r.centroCusto);
    const info = naturezaMap.get(natureza);
    gastos.push({
      data: excelSerialToISO(r.data),
      dataSerial: typeof r.data === "number" ? r.data : 0,
      mes: str(r.mes),
      natureza,
      centroCusto,
      descricao: str(r.descricao),
      valor,
      formaPgto: str(r.formaPgto),
      observacao: str(r.obs),
      fornecedor: str(r.fornecedor),
      grupoPlano: info?.grupoPlano || "",
      canalDashboard: info?.canalDashboard ?? NATUREZA_PARA_CANAL[natureza] ?? "Outros",
      isEvento: !!centroCusto && !CENTROS_NAO_EVENTO.has(centroCusto),
    });
  }
  return gastos;
}

function parsePlanoMensal(ws: XLSX.WorkSheet | undefined, gastos: Gasto[]): MesPlanoRealizado[] {
  if (!ws) return [];

  // Linhas 15-19 do Excel: Item | M1.. / Mês | Abr/26.. / Sugestão / Override / Plan Efetivo
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    range: "B15:BD19",
    header: 1,
    defval: "",
  });

  const headerLabels = (rows[0] || []) as unknown[];  // ["Item","M1","M2"...]
  const headerMeses = (rows[1] || []) as unknown[];   // ["","Abr/26","Mai/26"...]
  const sugestao = (rows[2] || []) as unknown[];      // ["Sugestão da Curva", val...]
  const override = (rows[3] || []) as unknown[];      // ["Override Mensal (opc)", val...]
  const efetivo = (rows[4] || []) as unknown[];       // ["Plan Efetivo Mensal", val...]

  // Identifica colunas M1..M18 (col 0 é label, cols 1+ são meses)
  const mesesPorIdx: { idx: number; mes: string }[] = [];
  for (let i = 1; i < headerLabels.length; i++) {
    const label = str(headerLabels[i]);
    if (!/^M\d+$/i.test(label)) continue;
    const idx = parseInt(label.slice(1));
    const mes = str(headerMeses[i]);
    if (mes) mesesPorIdx.push({ idx, mes });
  }

  // Soma realizado por mes
  const realizadoPorMes = new Map<string, number>();
  for (const g of gastos) {
    if (!g.mes) continue;
    realizadoPorMes.set(g.mes, (realizadoPorMes.get(g.mes) || 0) + g.valor);
  }

  const result: MesPlanoRealizado[] = [];
  for (let i = 1; i < headerLabels.length; i++) {
    const label = str(headerLabels[i]);
    if (!/^M\d+$/i.test(label)) continue;
    const mesIdx = parseInt(label.slice(1));
    const mes = str(headerMeses[i]);
    if (!mes) continue;
    const planoSug = num(sugestao[i]);
    const ov = override[i];
    const planoOverride = (ov === "" || ov === null || ov === undefined) ? null : num(ov);
    const planoEfetivo = num(efetivo[i]) || (planoOverride ?? planoSug);
    const realizado = realizadoPorMes.get(mes) || 0;
    result.push({
      mes,
      mesIdx,
      planoSugerido: planoSug,
      planoOverride,
      planoEfetivo,
      realizado,
      saldo: planoEfetivo - realizado,
      pctConsumido: planoEfetivo > 0 ? realizado / planoEfetivo : 0,
    });
  }
  return result;
}

function parseMixFases(ws: XLSX.WorkSheet | undefined): MixFase[] {
  if (!ws) return [];
  // Linha 22 (Excel): header "Canal | Fase 1 | Fase 2 ..." / Linhas 23-30: 8 grupos
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    range: "B22:G31",
    header: 1,
    defval: "",
  });
  // rows[0] = header com nomes das fases
  const header = (rows[0] || []) as unknown[];
  const faseLabels: { col: number; label: string }[] = [];
  for (let c = 1; c < header.length; c++) {
    const l = str(header[c]);
    if (/Fase\s*\d/i.test(l)) faseLabels.push({ col: c, label: l });
  }
  if (faseLabels.length === 0) return [];

  // rows[1..N] = grupos × %
  const porFase: Record<string, MixFase> = {};
  for (const { col, label } of faseLabels) {
    const m = label.match(/Fase\s*(\d)/i);
    porFase[label] = { fase: label, faseIdx: m ? parseInt(m[1]) : 0, porGrupo: {} };
  }
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const grupo = str(r[0]);
    if (!grupo || /Soma/i.test(grupo)) continue;
    if (!/^\d+\./.test(grupo)) continue; // só linhas "1. ..." "2. ..."
    for (const { col, label } of faseLabels) {
      const pct = num(r[col]);
      porFase[label].porGrupo[grupo] = pct;
    }
  }
  return Object.values(porFase).sort((a, b) => a.faseIdx - b.faseIdx);
}

function parseResumoEventos(ws: XLSX.WorkSheet | undefined): { eventos: Evento[]; naoEventos: NaoEvento[] } {
  const eventos: Evento[] = [];
  const naoEventos: NaoEvento[] = [];
  if (!ws) return { eventos, naoEventos };

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    range: "B5:F30",
    header: 1,
    defval: "",
  });

  // Detecta seção via marcadores explícitos:
  //  - "🎉 EVENTOS" / "EVENTOS"            → inicio da seção eventos
  //  - "📁 NÃO-EVENTOS" / "NÃO-EVENTOS"    → inicio da seção não-eventos
  // Skip: "Centro de Custo" (header), "TOTAL" (totalização), "═══" (divisor), vazios
  let secao: "eventos" | "naoEventos" | null = null;
  for (const r of rows) {
    const centro = str(r[0]);
    if (!centro) continue;
    if (/EVENTOS/i.test(centro) && /N[ÃA]O[-\s]EVENTOS/i.test(centro)) {
      secao = "naoEventos"; continue;
    }
    if (/N[ÃA]O[-\s]EVENTOS/i.test(centro)) { secao = "naoEventos"; continue; }
    if (/EVENTOS/i.test(centro) && !/N[ÃA]O/i.test(centro)) { secao = "eventos"; continue; }
    if (/^Centro de Custo/i.test(centro)) continue; // header
    if (/^TOTAL/i.test(centro)) continue;
    if (/═══/.test(centro)) continue;

    if (secao === "eventos") {
      const tipo = str(r[1]);
      if (!tipo) continue;
      const dataSerial = typeof r[2] === "number" ? (r[2] as number) : 0;
      eventos.push({
        centroCusto: centro,
        tipo,
        data: excelSerialToISO(r[2]),
        dataSerial,
        status: str(r[3]),
        totalGasto: num(r[4]),
      });
    } else if (secao === "naoEventos") {
      const total = num(r[4]);
      if (total === 0) continue;
      naoEventos.push({ centroCusto: centro, totalGasto: total });
    }
  }
  return { eventos, naoEventos };
}

function buildResumoPorGrupo(gastos: Gasto[], budget: number): ResumoPorGrupo[] {
  const map = new Map<string, number>();
  for (const g of gastos) {
    if (!g.grupoPlano) continue;
    map.set(g.grupoPlano, (map.get(g.grupoPlano) || 0) + g.valor);
  }
  return Array.from(map.entries())
    .map(([grupo, totalGasto]) => ({
      grupo,
      totalGasto,
      pctOrcamento: budget > 0 ? totalGasto / budget : 0,
    }))
    .sort((a, b) => b.totalGasto - a.totalGasto);
}

function parseWorkbook(workbook: XLSX.WorkBook): MarketingData {
  // Acha sheets ignorando emoji prefix
  const findSheet = (regex: RegExp) =>
    workbook.SheetNames.find((n) => regex.test(n));

  const wsPremissas = workbook.Sheets[findSheet(/PREMISSAS/i) || ""];
  const wsModelo = workbook.Sheets[findSheet(/MODELO/i) || ""];
  const wsGastos = workbook.Sheets[findSheet(/GASTOS$/i) || ""];
  const wsPlano = workbook.Sheets[findSheet(/PLANO\s*MKT/i) || ""];
  const wsEventos = workbook.Sheets[findSheet(/RESUMO\s*EVENTOS/i) || ""];

  const premissas = parsePremissas(wsPremissas);
  const naturezas = parseModelo(wsModelo);
  const gastos = parseGastos(wsGastos, naturezas);
  const planoMensal = parsePlanoMensal(wsPlano, gastos);
  const mixFases = parseMixFases(wsPlano);
  const { eventos, naoEventos } = parseResumoEventos(wsEventos);

  const totalRealizado = gastos.reduce((s, g) => s + g.valor, 0);
  const resumoPorGrupo = buildResumoPorGrupo(gastos, premissas.budgetMarketing);

  return {
    premissas,
    naturezas,
    gastos,
    planoMensal,
    mixFases,
    eventos,
    naoEventos,
    resumoPorGrupo,
    totalRealizado,
    pctBudgetConsumido: premissas.budgetMarketing > 0 ? totalRealizado / premissas.budgetMarketing : 0,
    sheets: workbook.SheetNames,
    filePath: ONEDRIVE_FILE_PATH,
    fetchedAt: new Date().toISOString(),
  };
}

// ── OneDrive Graph API ─────────────────────────────────────────────────────
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
      scope: "Files.ReadWrite Files.ReadWrite.All offline_access",
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
      allowOverwrite: true,
    }).catch((err) => console.warn("Falha ao salvar novo refresh token:", err));
  }
  return newTokens.access_token;
}

async function resolveFileId(accessToken: string): Promise<string> {
  // Cache hit: arquivo continua no mesmo path
  if (fileIdCache && fileIdCache.path === ONEDRIVE_FILE_PATH) {
    return fileIdCache.id;
  }

  const segments = ONEDRIVE_FILE_PATH.split("/").filter(Boolean);
  if (segments.length === 0) throw new Error("ONEDRIVE_CUSTOS_FILE_PATH vazio.");

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

  fileIdCache = { id: currentId, path: ONEDRIVE_FILE_PATH };
  return currentId;
}

async function downloadFromOneDrive(): Promise<ArrayBuffer> {
  const accessToken = await getAccessToken();

  // Fast path: usa o endpoint Graph por path direto (1 chamada total)
  // Formato: /me/drive/root:/path/to/file:/content
  const encodedPath = ONEDRIVE_FILE_PATH
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");

  const directUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodedPath}:/content`;
  const directRes = await fetch(directUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    redirect: "follow",
    cache: "no-store",
  });

  if (directRes.ok) {
    return directRes.arrayBuffer();
  }

  // Fallback: se o path direto falhar (caracteres especiais raros), faz navegação manual
  let fileId: string;
  try {
    fileId = await resolveFileId(accessToken);
  } catch (err) {
    fileIdCache = null;
    throw new Error(`Erro ao baixar arquivo (${directRes.status}): ${err instanceof Error ? err.message : String(err)}`);
  }

  const contentRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`,
    { headers: { Authorization: `Bearer ${accessToken}` }, redirect: "follow", cache: "no-store" }
  );
  if (!contentRes.ok) {
    if (contentRes.status === 404) fileIdCache = null;
    throw new Error(`Erro ao baixar arquivo (${contentRes.status})`);
  }
  return contentRes.arrayBuffer();
}

// ── API pública ────────────────────────────────────────────────────────────
export async function getMarketingData(): Promise<MarketingData> {
  if (dataCache && Date.now() - dataCache.timestamp < CACHE_TTL) {
    return dataCache.data;
  }
  const buffer = await downloadFromOneDrive();
  const workbook = XLSX.read(buffer, { type: "array" });
  const parsed = parseWorkbook(workbook);
  dataCache = { data: parsed, timestamp: Date.now() };
  return parsed;
}

export function clearMarketingCache() {
  dataCache = null;
}

export async function listOnedriveFiles(folder: string = "/") {
  const accessToken = await getAccessToken();
  const encodedPath = folder === "/" ? "" : `:${folder.split("/").map(encodeURIComponent).join("/")}:`;
  const url = `https://graph.microsoft.com/v1.0/me/drive/root${encodedPath}/children?$filter=file ne null&$select=name,id,size,lastModifiedDateTime&$top=50`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Erro ao listar arquivos (${res.status})`);
  const data = await res.json();
  return (data.value || [])
    .filter((f: { name: string }) => f.name.endsWith(".xlsx") || f.name.endsWith(".xls") || f.name.endsWith(".xlsm"))
    .map((f: { name: string; id: string; size: number; lastModifiedDateTime: string }) => ({
      name: f.name, id: f.id, size: f.size, lastModified: f.lastModifiedDateTime,
    }));
}
