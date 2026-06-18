/**
 * Sincroniza o status de bônus no Excel "Cenário_Comercial.xlsx" (aba "🏘️ LOTES").
 *
 *  Coluna U = Status Corretor · Coluna V = Status Imob (desde a remoção das colunas de
 *  valor fixo em 10/06/2026) · casa por Quadra (A) + Lote (B). As colunas são achadas
 *  pelo CABEÇALHO (robusto a mover/inserir colunas); os índices abaixo são só fallback.
 *
 *  FLUXO (decidido pelo Felipe em 10/06/2026): o "pago" é ANOTADO NO EXCEL, e o
 *  dashboard só acompanha. 3 status por célula (corretor e imob independentes):
 *    - "aguardando pgt"  → cliente pagou < 1,5% do contrato      (dashboard escreve)
 *    - "autorizado pgt"  → cliente pagou >= 1,5% — pode pagar    (dashboard escreve)
 *    - "pago"            → FELIPE digita no Excel após pagar     (dashboard LÊ e importa)
 *  O sync importa automaticamente o "pago" da célula pro dashboard (data do dia,
 *  observação "pago via Excel") e desmarca se o "pago" for apagado da célula
 *  (somente os que vieram do Excel — marcação antiga do dashboard fica intacta).
 *
 * Só age sobre dado COMPLETO (bonus.completo). Reescreve as colunas V/X inteiras
 * (preservando o que não muda) e só faz PATCH se algo realmente mudou.
 * Requer OneDrive com escopo Files.ReadWrite.
 */
import { list, put } from "@vercel/blob";
import { getAccessToken } from "@/lib/onedrive-marketing";
import { getBonusTracking, setBonusPagamentosEmLote, getBaseImportacao } from "@/lib/bonus";
import { edgeRead, edgeWrite } from "@/lib/edge-store";
import { setDatasVenda } from "@/lib/datas-venda";

const GRAPH = "https://graph.microsoft.com/v1.0";
const SYNC_STATE_BLOB = "cache/excel-bonus-sync.json";
const SYNC_STATE_EDGE_KEY = "excel_sync_state"; // Edge Config (sobrevive a bloqueio do Blob)
const COL_V = 20; // Status Corretor (coluna U — fallback se o header não for achado)
const COL_X = 21; // Status Imob (coluna V — fallback se o header não for achado)
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
  orfaosLimpos?: number;       // células de status limpas por o lote ter saído do bônus (venda desfeita)
  orfaosLotes?: string[];      // loteIds cujo status foi limpo (pra conferência)
  colunasStatus?: string;      // colunas de status detectadas (corretor/imob) — pelo header
  amostraHeader?: Record<string, string>; // headers das colunas U/V/W/X (inspeção)
  resumoStatus?: { pago: number; autorizado: number; aguardando: number }; // estado FINAL das células
  datasVenda?: { comData: number; coluna: string }; // cobertura da coluna "Data Venda" (override de data)
  statusEscrito?: boolean; // status/cores escritos no Excel; import roda mesmo se false
  statusParcial?: boolean; // status escrito com dado parcial do UAU (só upgrades "autorizado")
  importarDoExcel?: string[];   // "pago" na célula ainda não marcado no dashboard (importa)
  desmarcarDoExcel?: string[];  // "pago" removido da célula → desmarca no dashboard
  pagoForaDaBase?: string[];    // "pago" no Excel mas lote fora da base elegível → import pula (diag)
  importadosAplicados?: number; // quantos foram efetivamente aplicados nesta rodada
  erroImport?: string;          // se a persistência do import falhou (ex.: Edge cheio) — surfacar, não mascarar
  dryRun?: boolean;
  mudou?: boolean;
  destaque?: string; // status da formatação condicional (âmbar/verde)
}

const isPago = (v: unknown) => String(v ?? "").trim().toLowerCase() === "pago";

// Estado do sync no Blob: { syncedAt, celulasAlteradas, ultimaFalhaAt?, ultimaFalhaMsg? }.
// O admin (/api/admin/status) lê isso pra mostrar "Excel Bônus: último sync há X / ERRO".
async function lerSyncState(): Promise<Record<string, unknown>> {
  // 1) Edge Config (sobrevive a bloqueio do Blob)
  try {
    const e = await edgeRead<Record<string, unknown>>(SYNC_STATE_EDGE_KEY);
    if (e && typeof e === "object" && !Array.isArray(e)) return e;
  } catch { /* segue pro Blob */ }
  // 2) Fallback Blob
  try {
    const { blobs } = await list({ prefix: SYNC_STATE_BLOB });
    const hit = blobs.find((b) => b.pathname === SYNC_STATE_BLOB) ?? blobs[0];
    if (!hit) return {};
    const res = await fetch(hit.url, { cache: "no-store" });
    if (!res.ok) return {};
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function gravarSyncState(state: Record<string, unknown>): Promise<void> {
  // 1) Edge Config. 2) fallback Blob.
  if (await edgeWrite(SYNC_STATE_EDGE_KEY, state)) return;
  await put(SYNC_STATE_BLOB, JSON.stringify(state), {
    access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json",
  }).catch(() => {});
}

/**
 * Registra uma falha do sync (OneDrive fora, token expirado, Graph erro…).
 * Sem isso a falha era engolida (.catch(() => {})) e o Excel ficava
 * desatualizado sem ninguém saber. O admin exibe a última falha.
 */
export async function logSyncFalha(e: unknown): Promise<void> {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("excel-bonus-sync FALHOU:", msg);
  const atual = await lerSyncState();
  await gravarSyncState({ ...atual, ultimaFalhaAt: new Date().toISOString(), ultimaFalhaMsg: msg.slice(0, 300) });
}
// Status de bônus escrito por nós (limpável quando o lote sai da lista). "pago" é do Felipe → nunca limpa.
const isStatusBonus = (v: unknown) => {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "autorizado" || s === "autorizado pgt" || s === "aguardando pgt";
};
const AGUARDANDO_TXT = "aguardando pgt";
const AUTORIZADO_TXT = "autorizado pgt";

function colLetter(idx: number): string {
  let s = "", n = idx;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

const COL_DATA_HEADER = "Data Pgto Bônus";

/** Lê a célula de data de pagamento do Excel (serial number, dd/mm/aaaa ou ISO) → ISO yyyy-mm-dd ("" se vazia). */
function parseDataPgto(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "number" && v > 0) {
    // serial do Excel (base 1899-12-30; 25569 dias até 1970-01-01)
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().split("T")[0];
  }
  const s = String(v).trim();
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); // dd/mm/aaaa
  if (br) { const y = br[3].length === 2 ? "20" + br[3] : br[3]; return `${y}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`; }
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : "";
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
// Âmbar "aguardando" · verde claro "autorizado" · verde forte "pago". Agrupa linhas
// consecutivas de mesma cor em faixas (menos chamadas). Erro aqui NÃO quebra a escrita.
async function aplicarCores(token: string, wsPath: string, values: unknown[][], porLote: Map<string, { v: string; x: string }>, cols: { letter: string; idx: number; key: "v" | "x" }[], orfaos: string[] = []): Promise<string> {
  const AMBAR = "#FBBF24", VERDE = "#86EFAC", VERDE_PAGO = "#4ADE80";
  const corDe = (status: string) => (status === "pago" ? VERDE_PAGO : status === AUTORIZADO_TXT ? VERDE : AMBAR);
  // 1) Monta as faixas (linhas consecutivas de mesma cor) — sem chamadas ainda.
  const ops: { addr: string; color: string }[] = [];
  for (const { letter, idx, key } of cols) {
    let start = -1, end = -1, cor = "";
    const push = () => {
      if (start >= 0) ops.push({ addr: `${letter}${start}:${letter}${end}`, color: cor });
      start = -1; end = -1; cor = "";
    };
    for (let i = PRIMEIRA_LINHA_DADOS; i < values.length; i++) {
      const row = values[i] || [];
      const q = parseInt(String(row[0] ?? "").trim(), 10);
      const l = parseInt(String(row[1] ?? "").trim(), 10);
      const excelRow = i + 1;
      let desejada = "";
      const alvo = Number.isFinite(q) && Number.isFinite(l) ? porLote.get(`Q${q}-L${l}`) : undefined;
      if (alvo) {
        const cur = String(row[idx] ?? "").trim().toLowerCase();
        // valor FINAL da célula: "pago" manual preservado, senão o status do dashboard
        const statusFinal = cur === "pago" ? "pago" : alvo[key];
        desejada = corDe(statusFinal);
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
  // 3) Limpa o FILL das células órfãs (status removido) — pra não ficar célula vazia colorida.
  let okClear = 0;
  const clearFill = (addr: string) =>
    graph(token, `${wsPath}/range(address='${addr}')/format/fill/clear`, { method: "POST" });
  for (let i = 0; i < orfaos.length; i += conc) {
    const batch = orfaos.slice(i, i + conc);
    const res = await Promise.allSettled(batch.map(clearFill));
    res.forEach((r) => { if (r.status === "fulfilled") okClear++; });
  }
  return `cores: ${okc}/${ops.length} faixas` + (orfaos.length ? ` · órfãos limpos: ${okClear}/${orfaos.length}` : "");
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

/**
 * Configura o DROPDOWN (validação de dados) das colunas de status com as 3 opções
 * combinadas: "aguardando pgt" / "autorizado pgt" / "pago". Substitui a lista antiga
 * do Felipe ("A pagar"/"Pago"/"—"). Rodar de novo é inofensivo.
 */
export async function configurarDropdownStatus(): Promise<{ ok: boolean; detalhe: string }> {
  const token = await getAccessToken();
  const fileId = await resolveComercialFileId(token);
  const wsName = await resolveLotesSheetName(token, fileId);
  const wsPath = `${GRAPH}/me/drive/items/${fileId}/workbook/worksheets('${encodeURIComponent(wsName)}')`;
  const ur = await graph(token, `${wsPath}/usedRange(valuesOnly=true)?$select=values`);
  const values = (ur.values as unknown[][]) || [];
  const headerRow = values[PRIMEIRA_LINHA_DADOS - 1] || [];
  const header = headerRow.map((c) => String(c ?? "").trim().toLowerCase());
  const achaCol = (re: RegExp, fb: number) => { const i = header.findIndex((h) => re.test(h)); return i >= 0 ? i : fb; };
  const cols = [achaCol(/status.*corretor/i, COL_V), achaCol(/status.*imob/i, COL_X)];
  const primeira = PRIMEIRA_LINHA_DADOS + 1;
  const ultima = values.length;
  const resultados: string[] = [];
  for (const col of cols) {
    const addr = `${colLetter(col)}${primeira}:${colLetter(col)}${ultima}`;
    try {
      await graph(token, `${wsPath}/range(address='${addr}')/dataValidation`, {
        method: "PATCH",
        body: JSON.stringify({
          rule: { list: { inCellDropDown: true, source: "aguardando pgt, autorizado pgt, pago" } },
          ignoreBlanks: true,
        }),
      });
      resultados.push(`${colLetter(col)}: ok`);
    } catch (e) {
      resultados.push(`${colLetter(col)}: erro ${(e instanceof Error ? e.message : String(e)).slice(0, 100)}`);
    }
  }
  return { ok: resultados.every((r) => r.endsWith("ok")), detalhe: resultados.join(" · ") };
}

/**
 * Diagnóstico: mostra QUAL arquivo/aba o sync está usando (nome, caminho completo,
 * link, última modificação) + TODOS os candidatos que a busca encontrou no OneDrive.
 * Usado pra conferir se o dashboard mexe no MESMO arquivo que o Felipe abre.
 */
export async function diagnosticoExcel(): Promise<{
  candidatos: { name: string; caminho: string; webUrl: string; modificado: string }[];
  escolhido: { name: string; caminho: string; webUrl: string; modificado: string } | null;
  abas: string[];
  abaEscolhida: string;
}> {
  const token = await getAccessToken();
  const j = await graph(token, `${GRAPH}/me/drive/root/search(q='comercial')?$select=name,id,webUrl,lastModifiedDateTime,parentReference&$top=25`);
  type Cand = { name: string; id: string; webUrl?: string; lastModifiedDateTime?: string; parentReference?: { path?: string } };
  const brutos = ((j.value as Cand[]) || []).filter((f) => /\.xls/i.test(f.name));
  const candidatos = brutos.map((f) => ({
    name: f.name,
    caminho: (f.parentReference?.path || "").replace("/drive/root:", "") || "/",
    webUrl: f.webUrl || "",
    modificado: f.lastModifiedDateTime || "",
    id: f.id,
  }));
  const escolhidoBruto = candidatos.find((f) => /comercial/i.test(f.name) && !/marketing/i.test(f.name)) || candidatos[0] || null;
  let abas: string[] = [];
  let abaEscolhida = "";
  if (escolhidoBruto) {
    const ws = await graph(token, `${GRAPH}/me/drive/items/${escolhidoBruto.id}/workbook/worksheets?$select=name`);
    abas = (((ws.value as { name: string }[]) || []).map((w) => w.name));
    abaEscolhida = abas.find((n) => /lotes/i.test(n)) || "";
  }
  const semId = (c: typeof candidatos[number] | null) => c ? { name: c.name, caminho: c.caminho, webUrl: c.webUrl, modificado: c.modificado } : null;
  return { candidatos: candidatos.map((c) => semId(c)!), escolhido: semId(escolhidoBruto), abas, abaEscolhida };
}

/**
 * Manutenção one-off pedida pelo Felipe: deleta as colunas de VALOR FIXO de bônus
 * ("Bônus Corretor" = R$3k e "Bônus Imob" = R$1k — sempre o mesmo valor, sem motivo).
 * Acha pelo NOME exato do cabeçalho (não por posição) e deleta da direita pra esquerda.
 * As colunas de STATUS não são afetadas (o sync já as encontra pelo cabeçalho).
 */
export async function deletarColunasBonusFixas(): Promise<{ ok: boolean; deletadas: string[]; detalhe: string }> {
  const token = await getAccessToken();
  const fileId = await resolveComercialFileId(token);
  const wsName = await resolveLotesSheetName(token, fileId);
  const wsPath = `${GRAPH}/me/drive/items/${fileId}/workbook/worksheets('${encodeURIComponent(wsName)}')`;

  const ur = await graph(token, `${wsPath}/usedRange(valuesOnly=true)?$select=values`);
  const values = (ur.values as unknown[][]) || [];
  const header = (values[PRIMEIRA_LINHA_DADOS - 1] || []).map((c) => String(c ?? "").trim().toLowerCase());

  // Só deleta coluna cujo cabeçalho é EXATAMENTE o de valor fixo (segurança).
  const alvos: { idx: number; nome: string }[] = [];
  header.forEach((h, i) => {
    if (h === "bônus corretor" || h === "bonus corretor") alvos.push({ idx: i, nome: "Bônus Corretor" });
    if (h === "bônus imob" || h === "bonus imob") alvos.push({ idx: i, nome: "Bônus Imob" });
  });
  if (!alvos.length) return { ok: true, deletadas: [], detalhe: "nenhuma coluna de valor fixo encontrada (já deletadas?)" };

  // Direita → esquerda pra não deslocar os índices das próximas.
  alvos.sort((a, b) => b.idx - a.idx);
  const deletadas: string[] = [];
  for (const a of alvos) {
    const letra = colLetter(a.idx);
    await graph(token, `${wsPath}/range(address='${letra}:${letra}')/delete`, {
      method: "POST",
      body: JSON.stringify({ shift: "Left" }),
    });
    deletadas.push(`${letra} (${a.nome})`);
  }
  return { ok: true, deletadas, detalhe: `deletadas ${deletadas.length} coluna(s); status de bônus segue pelo cabeçalho` };
}

export async function syncBonusToExcel(opts: { dryRun?: boolean; force?: boolean } = {}): Promise<SyncReport> {
  const { dryRun = false, force = false } = opts;

  // Throttle no caminho automático: não relê o Excel se sincronizou há < 5 min.
  if (!dryRun && !force) {
    const st = await lerSyncState();
    const syncedAt = typeof st.syncedAt === "string" ? st.syncedAt : "";
    if (syncedAt && Date.now() - new Date(syncedAt).getTime() < 5 * 60 * 1000) {
      return { ok: true, motivo: "sincronizado há pouco (throttle)", mudou: false };
    }
  }

  // BASE DA IMPORTAÇÃO (RÁPIDA, só Eggs+pagamentos — SEM UAU): permite importar o "pago"
  // do Excel pro dashboard mesmo com o ERP fora/lento. É o que MAIS importa.
  const bonusPorLote = await getBaseImportacao();

  // STATUS (autorizado/aguardando) precisa do UAU (regra 1,5%) — é BEST-EFFORT. Se o ERP
  // estiver fora/lento, NÃO escreve status de volta no Excel, mas a importação roda igual.
  // O STATUS (autorizado/aguardando) precisa do UAU e é buscado SÓ DEPOIS da importação
  // (lá embaixo), pra que a importação NUNCA espere o ERP. Aqui ficam vazios.
  const porLote = new Map<string, { v: string; x: string }>();
  let statusOk = false;

  const token = await getAccessToken();
  const fileId = await resolveComercialFileId(token);
  const wsName = await resolveLotesSheetName(token, fileId);
  const wsPath = `${GRAPH}/me/drive/items/${fileId}/workbook/worksheets('${encodeURIComponent(wsName)}')`;

  const ur = await graph(token, `${wsPath}/usedRange(valuesOnly=true)?$select=values`);
  const values = (ur.values as unknown[][]) || [];
  const totalLinhas = values.length;

  // Colunas de status pelo CABEÇALHO (robusto a deletar/inserir colunas, ex.: remover U e W).
  // Cai no V(21)/X(23) fixo se não achar o header.
  const headerRow = values[PRIMEIRA_LINHA_DADOS - 1] || [];
  const header = headerRow.map((c) => String(c ?? "").trim().toLowerCase());
  const achaCol = (re: RegExp, fb: number) => { const i = header.findIndex((h) => re.test(h)); return i >= 0 ? i : fb; };
  const colV = achaCol(/status.*corretor/i, COL_V);
  const colX = achaCol(/status.*imob/i, COL_X);

  // Coluna de DATA do pagamento do bônus (Felipe preenche). Se não existir, cria
  // DEPOIS de todas as colunas (header na linha de cabeçalho). Sem ela, cai em "hoje".
  // Coluna "Data Venda" (Felipe preenche) — vira a data AUTORIDADE da venda (override do Eggs).
  const colDataVenda = header.findIndex((h) => /data.*venda|venda.*data|dt.*venda/i.test(h));
  const datasVendaMap: Record<string, string> = {};

  let colData = header.findIndex((h) => /(data|dt).*(pag|pgto)|b[oô]nus.*data|data.*b[oô]nus/i.test(h));
  if (colData < 0) {
    colData = header.length; // próxima coluna após todas
    try {
      await graph(token, `${wsPath}/range(address='${colLetter(colData)}${PRIMEIRA_LINHA_DADOS}')`, {
        method: "PATCH", body: JSON.stringify({ values: [[COL_DATA_HEADER]] }),
      });
    } catch { /* se falhar, segue; usa "hoje" como fallback até a coluna existir */ }
  }

  // Mão de volta Excel→dashboard: "pago" digitado pelo Felipe importa; apagado, desmarca.
  type ParteImport = { chaveVenda: string; loteId: string; parte: "corretor" | "imobiliaria"; data: string };
  const paraImportar: ParteImport[] = [];
  const paraDesmarcar: ParteImport[] = [];
  const casadasLotes = new Set<string>();
  const pagoForaDaBase: string[] = []; // "pago" no Excel mas lote não-elegível → import pula (suspeito)
  let resumoPago = 0, resumoAut = 0, resumoAg = 0;

  // ── PASSO 1: IMPORTAÇÃO (pago do Excel → dashboard) + Data Venda + resumo das células ──
  // NÃO depende do UAU (usa só a base rápida Eggs+pagamentos). É o que mais importa.
  for (let i = PRIMEIRA_LINHA_DADOS; i < totalLinhas; i++) {
    const row = values[i] || [];
    const q = parseInt(String(row[0] ?? "").trim(), 10);
    const l = parseInt(String(row[1] ?? "").trim(), 10);
    if (!Number.isFinite(q) || !Number.isFinite(l)) continue;
    const loteId = `Q${q}-L${l}`;
    const curV = row[colV] ?? "", curX = row[colX] ?? "";

    const dVenda = colDataVenda >= 0 ? parseDataPgto(row[colDataVenda]) : "";
    if (dVenda) datasVendaMap[loteId] = dVenda;

    const b = bonusPorLote.get(loteId);
    if (b) {
      casadasLotes.add(loteId);
      const dPgto = parseDataPgto(row[colData]); // data digitada na coluna W (ISO ou "")
      // Importa quando: ainda não pago OU a data da coluna W mudou (correção da data real).
      if (isPago(curV)) {
        if (!b.pagamento.pagoCorretora || (dPgto && dPgto !== b.pagamento.dataPagoCorretora))
          paraImportar.push({ chaveVenda: b.chaveVenda, loteId, parte: "corretor", data: dPgto });
      } else if (b.pagamento.pagoCorretora && (b.pagamento.observacao || "").includes("pago via Excel")) {
        paraDesmarcar.push({ chaveVenda: b.chaveVenda, loteId, parte: "corretor", data: "" });
      }
      if (isPago(curX)) {
        if (!b.pagamento.pagoImobiliaria || (dPgto && dPgto !== b.pagamento.dataPagoImobiliaria))
          paraImportar.push({ chaveVenda: b.chaveVenda, loteId, parte: "imobiliaria", data: dPgto });
      } else if (b.pagamento.pagoImobiliaria && (b.pagamento.observacao || "").includes("pago via Excel")) {
        paraDesmarcar.push({ chaveVenda: b.chaveVenda, loteId, parte: "imobiliaria", data: "" });
      }
    } else {
      // Lote marcado "pago" no Excel MAS fora da base elegível (contrato não-ASSINADO/FATURADO/
      // ENTREGUE, ou cancelado) → o import PULA silenciosamente. É o suspeito de "não atualizou".
      if (isPago(curV)) pagoForaDaBase.push(`${loteId} (corretor)`);
      if (isPago(curX)) pagoForaDaBase.push(`${loteId} (imob)`);
    }
    for (const cell of [curV, curX]) { // resumo do estado ATUAL das células (reflete o Excel)
      const t = String(cell).trim().toLowerCase();
      if (isPago(cell)) resumoPago++;
      else if (t === AUTORIZADO_TXT) resumoAut++;
      else if (t === AGUARDANDO_TXT) resumoAg++;
    }
  }

  const naoEncontradas: string[] = [];
  for (const id of bonusPorLote.keys()) if (!casadasLotes.has(id)) naoEncontradas.push(id);

  const report: SyncReport = {
    ok: true,
    arquivo: "Cenário_Comercial.xlsx",
    aba: wsName,
    totalLinhas,
    casadas: casadasLotes.size,
    naoEncontradas,
    celulasAlteradas: 0,
    orfaosLimpos: 0,
    colunasStatus: `corretor=${colLetter(colV)}(${colV}) imob=${colLetter(colX)}(${colX})`,
    resumoStatus: { pago: resumoPago, autorizado: resumoAut, aguardando: resumoAg },
    importarDoExcel: paraImportar.map((p) => `${p.loteId} (${p.parte})`),
    desmarcarDoExcel: paraDesmarcar.map((p) => `${p.loteId} (${p.parte})`),
    pagoForaDaBase,

    amostraHeader: { U: String(headerRow[20] ?? ""), V: String(headerRow[21] ?? ""), W: String(headerRow[22] ?? ""), X: String(headerRow[23] ?? "") },
    datasVenda: { comData: Object.keys(datasVendaMap).length, coluna: colDataVenda >= 0 ? `${colLetter(colDataVenda)}(${colDataVenda})` : "(não encontrada)" },
    statusEscrito: false,
    dryRun,
    mudou: false,
  };

  if (dryRun) return report;

  // ── ORDEM IMPORTA ── Primeiro o CRÍTICO e RÁPIDO: importar os "pago" do Excel pro
  // dashboard (+ desmarcar). As escritas DE VOLTA no Excel (status/cores) são lentas via
  // Graph e cosméticas — vêm DEPOIS. Se elas estourarem os 60s, a importação já está salva.
  try {
    const patches = new Map<string, Record<string, unknown>>();
    const hoje = new Date().toISOString().split("T")[0];
    for (const p of paraImportar) {
      const cur = patches.get(p.chaveVenda) || {};
      const d = p.data || hoje; // data digitada na coluna do Excel; senão, hoje (fallback)
      if (p.parte === "corretor") { cur.pagoCorretora = true; cur.dataPagoCorretora = d; }
      else { cur.pagoImobiliaria = true; cur.dataPagoImobiliaria = d; }
      cur.observacao = "pago via Excel";
      patches.set(p.chaveVenda, cur);
    }
    for (const p of paraDesmarcar) {
      const cur = patches.get(p.chaveVenda) || {};
      if (p.parte === "corretor") { cur.pagoCorretora = false; cur.dataPagoCorretora = ""; }
      else { cur.pagoImobiliaria = false; cur.dataPagoImobiliaria = ""; }
      patches.set(p.chaveVenda, cur);
    }
    if (patches.size > 0) await setBonusPagamentosEmLote(Array.from(patches, ([chaveVenda, patch]) => ({ chaveVenda, patch })));
    report.importadosAplicados = paraImportar.length + paraDesmarcar.length;
  } catch (e) {
    console.warn("importação Excel→dashboard falhou:", e);
    report.importadosAplicados = 0;
    report.erroImport = e instanceof Error ? e.message : String(e);
  }

  // Data Venda (override) + carimbo do sync — rápidos, antes das escritas lentas no Excel.
  await setDatasVenda(datasVendaMap).catch(() => {});
  await gravarSyncState({ syncedAt: new Date().toISOString(), celulasAlteradas: report.importadosAplicados || 0 });

  // ── PASSO 3: STATUS (autorizado/aguardando + cores) — BEST-EFFORT, precisa do UAU (regra
  // 1,5%). Roda DEPOIS do import (que já está salvo acima). Timeout curto: se o ERP pendurar,
  // pula sem derrubar nada — o "pago" não depende disto. Reescreve as colunas V/X num 2º passo. ──
  try {
    const tracking = await Promise.race([
      getBonusTracking(),
      new Promise<null>((_, rej) => setTimeout(() => rej(new Error("tracking timeout 20s")), 20000)),
    ]);
    if (tracking) {
      const trackingCompleto = !!tracking.completo;
      // Dado parcial do UAU é comum (ERP lento) e o snapshot completo (Blob) está bloqueado.
      // Regra anti-info-errada pra ainda assim DESTRAVAR o status do Excel:
      //  • autorizado=true é EVIDÊNCIA por lote (cliente pagou ≥1,5% OU liberado manual) →
      //    seguro marcar "autorizado pgt" mesmo vindo de um batch incompleto.
      //  • autorizado=false só é confiável quando o batch veio COMPLETO (senão pode ser uma
      //    consulta de entrada que falhou no ERP) → só então escreve "aguardando pgt".
      // Nunca regride "autorizado"/"pago" por falha do ERP. (Antes exigia completo p/ TUDO →
      // o status congelou desde que o Blob bloqueou em 11/jun.)
      for (const b of tracking.bonus) {
        if (b.autorizado === true) porLote.set(b.loteId, { v: AUTORIZADO_TXT, x: AUTORIZADO_TXT });
        else if (trackingCompleto && b.autorizado === false) porLote.set(b.loteId, { v: AGUARDANDO_TXT, x: AGUARDANDO_TXT });
      }
      statusOk = porLote.size > 0;
      report.statusEscrito = statusOk;
      report.statusParcial = statusOk && !trackingCompleto;
      const novoV: unknown[][] = [];
      const novoX: unknown[][] = [];
      const orfaos: string[] = []; // células de lote que saiu do bônus (venda desfeita) — limpar
      let alt = 0;
      for (let i = PRIMEIRA_LINHA_DADOS; i < totalLinhas; i++) {
        const row = values[i] || [];
        const cv = row[colV] ?? "", cx = row[colX] ?? "";
        let nv: unknown = cv, nx: unknown = cx;
        const q = parseInt(String(row[0] ?? "").trim(), 10);
        const l = parseInt(String(row[1] ?? "").trim(), 10);
        if (Number.isFinite(q) && Number.isFinite(l)) {
          const loteId = `Q${q}-L${l}`;
          const alvo = porLote.get(loteId);
          if (alvo) {
            // "pago" do Felipe é preservado (normaliza); senão escreve o status do UAU.
            nv = isPago(cv) ? "pago" : alvo.v;
            nx = isPago(cx) ? "pago" : alvo.x;
          } else if (!bonusPorLote.has(loteId)) {
            // Órfão: tinha status mas não é mais venda válida (Eggs). Limpa (nunca mexe em "pago").
            if (isStatusBonus(cv)) { nv = ""; orfaos.push(`${colLetter(colV)}${i + 1}`); }
            if (isStatusBonus(cx)) { nx = ""; orfaos.push(`${colLetter(colX)}${i + 1}`); }
          }
        }
        novoV.push([nv]); novoX.push([nx]);
        if (String(nv) !== String(cv)) alt++;
        if (String(nx) !== String(cx)) alt++;
      }
      report.celulasAlteradas = alt;
      report.orfaosLimpos = orfaos.length;
      report.mudou = alt > 0;
      if (alt > 0) {
        const primeira = PRIMEIRA_LINHA_DADOS + 1; // Excel 1-based
        const addrV = `${colLetter(colV)}${primeira}:${colLetter(colV)}${totalLinhas}`;
        const addrX = `${colLetter(colX)}${primeira}:${colLetter(colX)}${totalLinhas}`;
        try {
          await graph(token, `${wsPath}/range(address='${addrV}')`, { method: "PATCH", body: JSON.stringify({ values: novoV }) });
          await graph(token, `${wsPath}/range(address='${addrX}')`, { method: "PATCH", body: JSON.stringify({ values: novoX }) });
        } catch (e) {
          console.warn("escrita de status no Excel falhou (cosmético):", e);
        }
      }
      if (alt > 0 || force) {
        try {
          report.destaque = await aplicarCores(token, wsPath, values, porLote, [{ letter: colLetter(colV), idx: colV, key: "v" }, { letter: colLetter(colX), idx: colX, key: "x" }], orfaos);
        } catch (e) {
          report.destaque = "erro: " + (e instanceof Error ? e.message : String(e));
        }
      }
    }
  } catch { /* ERP fora/lento → sem status; o "pago" já foi importado e salvo acima */ }

  return report;
}
