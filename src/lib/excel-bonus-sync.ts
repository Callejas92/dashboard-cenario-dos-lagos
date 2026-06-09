/**
 * Sincroniza o status de bônus no Excel "Cenário_Comercial.xlsx" (aba "🏘️ LOTES").
 *
 *  Coluna V = Status Corretor · Coluna X = Status Imob · casa por Quadra (A) + Lote (B).
 *  Escreve:
 *    - "aguardando pgt"  → cliente pagou < 1,5% do contrato
 *    - "autorizado"      → cliente pagou >= 1,5% do contrato (bônus liberado)
 *    - preserva "pago"   → o Felipe marca manualmente; nunca sobrescrevo
 *
 * Só age sobre dado COMPLETO (bonus.completo). Reescreve as colunas V/X inteiras
 * (preservando o que não muda) e só faz PATCH se algo realmente mudou.
 * Requer OneDrive com escopo Files.ReadWrite.
 */
import { list, put } from "@vercel/blob";
import { getAccessToken } from "@/lib/onedrive-marketing";
import { getBonusTracking } from "@/lib/bonus";

const GRAPH = "https://graph.microsoft.com/v1.0";
const SYNC_STATE_BLOB = "cache/excel-bonus-sync.json";
const COL_V = 21; // Status Corretor (coluna V)
const COL_X = 23; // Status Imob (coluna X)
const PRIMEIRA_LINHA_DADOS = 3; // 0-based → Excel linha 4 (linhas 1-3 = título/seções/cabeçalho)

export interface SyncReport {
  ok: boolean;
  motivo?: string;
  arquivo?: string;
  aba?: string;
  totalLinhas?: number;
  casadas?: number;
  naoEncontradas?: string[];
  celulasAlteradas?: number;
  preservadasPago?: number;
  dryRun?: boolean;
  mudou?: boolean;
  destaque?: string; // status da formatação condicional (âmbar/verde)
}

const isPago = (v: unknown) => String(v ?? "").trim().toLowerCase() === "pago";

function colLetter(idx: number): string {
  let s = "", n = idx;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

async function graph(token: string, url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Graph ${res.status} em ${url.split("?")[0].split("/").slice(-1)[0]}: ${t.slice(0, 180)}`);
  }
  return res.json();
}

// Destaque por COR de fundo (formatação condicional do Graph não existe em OneDrive pessoal).
// Âmbar p/ "aguardando", verde p/ "autorizado". Agrupa linhas consecutivas de mesma cor em
// faixas (menos chamadas). Preserva "pago" (não recolore). Erro aqui NÃO quebra a escrita.
async function aplicarCores(token: string, wsPath: string, values: unknown[][], porLote: Map<string, boolean>): Promise<string> {
  const AMBAR = "#FBBF24", VERDE = "#86EFAC";
  // 1) Monta as faixas (linhas consecutivas de mesma cor) — sem chamadas ainda.
  const ops: { addr: string; color: string }[] = [];
  for (const col of ["V", "X"] as const) {
    const colIdx = col === "V" ? COL_V : COL_X;
    let start = -1, end = -1, cor = "";
    const push = () => {
      if (start >= 0) ops.push({ addr: `${col}${start}:${col}${end}`, color: cor });
      start = -1; end = -1; cor = "";
    };
    for (let i = PRIMEIRA_LINHA_DADOS; i < values.length; i++) {
      const row = values[i] || [];
      const q = parseInt(String(row[0] ?? "").trim(), 10);
      const l = parseInt(String(row[1] ?? "").trim(), 10);
      const excelRow = i + 1;
      let desejada = "";
      if (Number.isFinite(q) && Number.isFinite(l) && porLote.has(`Q${q}-L${l}`)) {
        const cur = String(row[colIdx] ?? "").trim().toLowerCase();
        if (cur !== "pago") desejada = porLote.get(`Q${q}-L${l}`) ? VERDE : AMBAR;
      }
      if (desejada && desejada === cor) { end = excelRow; }
      else { push(); if (desejada) { start = excelRow; end = excelRow; cor = desejada; } }
    }
    push();
  }
  // 2) Aplica em PARALELO (sequencial estourava 60s) + retry sequencial das que falham
  //    (escritas concorrentes no mesmo workbook às vezes dão conflito).
  let okc = 0;
  const conc = 5;
  const falhas: { addr: string; color: string }[] = [];
  const fill = (o: { addr: string; color: string }) =>
    graph(token, `${wsPath}/range(address='${o.addr}')/format/fill`, { method: "PATCH", body: JSON.stringify({ color: o.color }) });
  for (let i = 0; i < ops.length; i += conc) {
    const batch = ops.slice(i, i + conc);
    const res = await Promise.allSettled(batch.map(fill));
    res.forEach((r, idx) => { if (r.status === "fulfilled") okc++; else falhas.push(batch[idx]); });
  }
  for (const o of falhas) {
    try { await fill(o); okc++; } catch { /* desiste dessa faixa */ }
  }
  return `cores: ${okc}/${ops.length} faixas`;
}

async function resolveComercialFileId(token: string): Promise<string> {
  const j = await graph(token, `${GRAPH}/me/drive/root/search(q='comercial')?$select=name,id&$top=25`);
  const cands = ((j.value as { name: string; id: string }[]) || []).filter((f) => /\.xls/i.test(f.name));
  const file = cands.find((f) => /comercial/i.test(f.name) && !/marketing/i.test(f.name)) || cands[0];
  if (!file) throw new Error("Cenário_Comercial.xlsx não encontrado no OneDrive");
  return file.id;
}

async function resolveLotesSheetName(token: string, fileId: string): Promise<string> {
  const j = await graph(token, `${GRAPH}/me/drive/items/${fileId}/workbook/worksheets?$select=id,name`);
  const ws = ((j.value as { name: string }[]) || []).find((w) => /lotes/i.test(w.name));
  if (!ws) throw new Error("aba 'LOTES' não encontrada no Cenário_Comercial.xlsx");
  return ws.name;
}

export async function syncBonusToExcel(opts: { dryRun?: boolean; force?: boolean } = {}): Promise<SyncReport> {
  const { dryRun = false, force = false } = opts;

  // Throttle no caminho automático: não relê o Excel se sincronizou há < 5 min.
  if (!dryRun && !force) {
    try {
      const { blobs } = await list({ prefix: SYNC_STATE_BLOB });
      const hit = blobs.find((b) => b.pathname === SYNC_STATE_BLOB) ?? blobs[0];
      if (hit) {
        const st = await (await fetch(hit.url, { cache: "no-store" })).json();
        if (st?.syncedAt && Date.now() - new Date(st.syncedAt).getTime() < 5 * 60 * 1000) {
          return { ok: true, motivo: "sincronizado há pouco (throttle)", mudou: false };
        }
      }
    } catch { /* sem estado: segue normal */ }
  }

  const tracking = await getBonusTracking();
  if (!tracking.completo) return { ok: false, motivo: "dado de bônus incompleto (UAU) — sync adiado" };

  const porLote = new Map<string, boolean>(); // loteId → autorizado (pagou >= 1,5% do contrato)
  // Defensivo: um cache de tracking antigo pode não ter "autorizado". Sem o campo, não
  // escreve aquele lote (evita marcar tudo "aguardando" por engano até revalidar).
  for (const b of tracking.bonus) {
    if (typeof b.autorizado === "boolean") porLote.set(b.loteId, b.autorizado);
  }

  const token = await getAccessToken();
  const fileId = await resolveComercialFileId(token);
  const wsName = await resolveLotesSheetName(token, fileId);
  const wsPath = `${GRAPH}/me/drive/items/${fileId}/workbook/worksheets('${encodeURIComponent(wsName)}')`;

  const ur = await graph(token, `${wsPath}/usedRange(valuesOnly=true)?$select=values`);
  const values = (ur.values as unknown[][]) || [];
  const totalLinhas = values.length;

  const novoV: unknown[][] = [];
  const novoX: unknown[][] = [];
  let casadas = 0, alteradas = 0, preservadas = 0;
  const casadasLotes = new Set<string>();

  for (let i = PRIMEIRA_LINHA_DADOS; i < totalLinhas; i++) {
    const row = values[i] || [];
    const quadra = String(row[0] ?? "").trim();
    const lote = String(row[1] ?? "").trim();
    const curV = row[COL_V] ?? "";
    const curX = row[COL_X] ?? "";
    let nv: unknown = curV;
    let nx: unknown = curX;

    const q = parseInt(quadra, 10);
    const l = parseInt(lote, 10);
    if (quadra !== "" && lote !== "" && Number.isFinite(q) && Number.isFinite(l)) {
      const loteId = `Q${q}-L${l}`;
      if (porLote.has(loteId)) {
        casadas++;
        casadasLotes.add(loteId);
        const desejado = porLote.get(loteId) ? "autorizado" : "aguardando pgt";
        if (isPago(curV)) { preservadas++; } else { nv = desejado; }
        if (isPago(curX)) { preservadas++; } else { nx = desejado; }
        if (nv !== curV) alteradas++;
        if (nx !== curX) alteradas++;
      }
    }
    novoV.push([nv]);
    novoX.push([nx]);
  }

  const naoEncontradas: string[] = [];
  for (const id of porLote.keys()) if (!casadasLotes.has(id)) naoEncontradas.push(id);

  const mudou = alteradas > 0;
  const report: SyncReport = {
    ok: true,
    arquivo: "Cenário_Comercial.xlsx",
    aba: wsName,
    totalLinhas,
    casadas,
    naoEncontradas,
    celulasAlteradas: alteradas,
    preservadasPago: preservadas,
    dryRun,
    mudou,
  };

  if (dryRun) return report;

  if (mudou) {
    const primeira = PRIMEIRA_LINHA_DADOS + 1; // Excel 1-based
    const ultima = totalLinhas;                // Excel 1-based (usedRange começa em A1)
    const addrV = `${colLetter(COL_V)}${primeira}:${colLetter(COL_V)}${ultima}`;
    const addrX = `${colLetter(COL_X)}${primeira}:${colLetter(COL_X)}${ultima}`;
    await graph(token, `${wsPath}/range(address='${addrV}')`, { method: "PATCH", body: JSON.stringify({ values: novoV }) });
    await graph(token, `${wsPath}/range(address='${addrX}')`, { method: "PATCH", body: JSON.stringify({ values: novoX }) });
  }

  // Destaque por cor (âmbar "aguardando" / verde "autorizado"). Só quando muda ou forçado.
  if (mudou || force) {
    try {
      report.destaque = await aplicarCores(token, wsPath, values, porLote);
    } catch (e) {
      report.destaque = "erro: " + (e instanceof Error ? e.message : String(e));
    }
  }

  // Marca o horário do sync (mesmo sem mudança) p/ o throttle do caminho automático.
  await put(SYNC_STATE_BLOB, JSON.stringify({ syncedAt: new Date().toISOString(), celulasAlteradas: alteradas }), {
    access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json",
  }).catch(() => {});

  return report;
}
