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
import { getBonusTracking, setBonusPagamentosEmLote } from "@/lib/bonus";

const GRAPH = "https://graph.microsoft.com/v1.0";
const SYNC_STATE_BLOB = "cache/excel-bonus-sync.json";
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
  importarDoExcel?: string[];   // "pago" na célula ainda não marcado no dashboard (importa)
  desmarcarDoExcel?: string[];  // "pago" removido da célula → desmarca no dashboard
  importadosAplicados?: number; // quantos foram efetivamente aplicados nesta rodada
  dryRun?: boolean;
  mudou?: boolean;
  destaque?: string; // status da formatação condicional (âmbar/verde)
}

const isPago = (v: unknown) => String(v ?? "").trim().toLowerCase() === "pago";

// Estado do sync no Blob: { syncedAt, celulasAlteradas, ultimaFalhaAt?, ultimaFalhaMsg? }.
// O admin (/api/admin/status) lê isso pra mostrar "Excel Bônus: último sync há X / ERRO".
async function lerSyncState(): Promise<Record<string, unknown>> {
  try {
    const { blobs } = await list({ prefix: SYNC_STATE_BLOB });
    const hit = blobs.find((b) => b.pathname === SYNC_STATE_BLOB) ?? blobs[0];
    if (!hit) return {};
    const res = await fetch(hit.url, { cache: "no-store" }); // fura cache CDN do Blob
    if (!res.ok) return {};
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function gravarSyncState(state: Record<string, unknown>): Promise<void> {
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

  const tracking = await getBonusTracking();
  if (!tracking.completo) return { ok: false, motivo: "dado de bônus incompleto (UAU) — sync adiado" };

  // loteId → status desejado POR COLUNA (corretor/imob). O dashboard escreve SÓ
  // aguardando/autorizado — "pago" é do Felipe (lido da célula, nunca escrito).
  // Defensivo: um cache de tracking antigo pode não ter "autorizado". Sem o campo, não
  // escreve aquele lote (evita marcar tudo "aguardando" por engano até revalidar).
  const porLote = new Map<string, { v: string; x: string }>();
  const bonusPorLote = new Map(tracking.bonus.map((b) => [b.loteId, b]));
  for (const b of tracking.bonus) {
    if (typeof b.autorizado !== "boolean") continue;
    const base = b.autorizado ? AUTORIZADO_TXT : AGUARDANDO_TXT;
    porLote.set(b.loteId, { v: base, x: base });
  }

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

  const novoV: unknown[][] = [];
  const novoX: unknown[][] = [];
  let casadas = 0, alteradas = 0, preservadas = 0;
  const casadasLotes = new Set<string>();
  const orfaos: string[] = []; // células V/X de lote que saiu do bônus (venda desfeita) — limpar
  const orfaosLotes = new Set<string>();
  // Mão de volta Excel→dashboard: "pago" digitado pelo Felipe importa; apagado, desmarca.
  type ParteImport = { chaveVenda: string; loteId: string; parte: "corretor" | "imobiliaria" };
  const paraImportar: ParteImport[] = [];
  const paraDesmarcar: ParteImport[] = [];
  let resumoPago = 0, resumoAut = 0, resumoAg = 0;

  for (let i = PRIMEIRA_LINHA_DADOS; i < totalLinhas; i++) {
    const row = values[i] || [];
    const quadra = String(row[0] ?? "").trim();
    const lote = String(row[1] ?? "").trim();
    const curV = row[colV] ?? "";
    const curX = row[colX] ?? "";
    let nv: unknown = curV;
    let nx: unknown = curX;

    const q = parseInt(quadra, 10);
    const l = parseInt(lote, 10);
    if (quadra !== "" && lote !== "" && Number.isFinite(q) && Number.isFinite(l)) {
      const loteId = `Q${q}-L${l}`;
      const alvo = porLote.get(loteId);
      if (alvo) {
        casadas++;
        casadasLotes.add(loteId);
        const b = bonusPorLote.get(loteId);
        // "pago" na célula é do Felipe: preserva SEMPRE e importa pro dashboard se faltar.
        // (normaliza a caixa: "Pago"/"PAGO" do dropdown antigo vira "pago")
        if (isPago(curV)) {
          preservadas++;
          if (String(curV) !== "pago") nv = "pago";
          if (b && !b.pagamento.pagoCorretora) paraImportar.push({ chaveVenda: b.chaveVenda, loteId, parte: "corretor" });
        } else {
          nv = alvo.v;
          // célula deixou de ser "pago": desmarca no dashboard SE a marcação veio do Excel
          if (b?.pagamento.pagoCorretora && (b.pagamento.observacao || "").includes("pago via Excel")) {
            paraDesmarcar.push({ chaveVenda: b.chaveVenda, loteId, parte: "corretor" });
          }
        }
        if (isPago(curX)) {
          preservadas++;
          if (String(curX) !== "pago") nx = "pago";
          if (b && !b.pagamento.pagoImobiliaria) paraImportar.push({ chaveVenda: b.chaveVenda, loteId, parte: "imobiliaria" });
        } else {
          nx = alvo.x;
          if (b?.pagamento.pagoImobiliaria && (b.pagamento.observacao || "").includes("pago via Excel")) {
            paraDesmarcar.push({ chaveVenda: b.chaveVenda, loteId, parte: "imobiliaria" });
          }
        }
        if (nv !== curV) alteradas++;
        if (nx !== curX) alteradas++;
        for (const fin of [String(nv), String(nx)]) {
          if (isPago(fin)) resumoPago++;
          else if (fin === AUTORIZADO_TXT) resumoAut++;
          else resumoAg++;
        }
      } else if (isStatusBonus(curV) || isStatusBonus(curX)) {
        // Órfão: lote saiu da lista de bônus (venda desfeita/liberada) mas ficou com status
        // antigo no Excel. Limpa "autorizado"/"aguardando pgt" (nunca mexe em "pago").
        if (isStatusBonus(curV)) { nv = ""; alteradas++; orfaos.push(`${colLetter(colV)}${i + 1}`); }
        if (isStatusBonus(curX)) { nx = ""; alteradas++; orfaos.push(`${colLetter(colX)}${i + 1}`); }
        orfaosLotes.add(loteId);
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
    orfaosLimpos: orfaos.length,
    orfaosLotes: Array.from(orfaosLotes),
    colunasStatus: `corretor=${colLetter(colV)}(${colV}) imob=${colLetter(colX)}(${colX})`,
    resumoStatus: { pago: resumoPago, autorizado: resumoAut, aguardando: resumoAg },
    importarDoExcel: paraImportar.map((p) => `${p.loteId} (${p.parte})`),
    desmarcarDoExcel: paraDesmarcar.map((p) => `${p.loteId} (${p.parte})`),
    amostraHeader: { U: String(headerRow[20] ?? ""), V: String(headerRow[21] ?? ""), W: String(headerRow[22] ?? ""), X: String(headerRow[23] ?? "") },
    dryRun,
    mudou,
  };

  if (dryRun) return report;

  if (mudou) {
    const primeira = PRIMEIRA_LINHA_DADOS + 1; // Excel 1-based
    const ultima = totalLinhas;                // Excel 1-based (usedRange começa em A1)
    const addrV = `${colLetter(colV)}${primeira}:${colLetter(colV)}${ultima}`;
    const addrX = `${colLetter(colX)}${primeira}:${colLetter(colX)}${ultima}`;
    await graph(token, `${wsPath}/range(address='${addrV}')`, { method: "PATCH", body: JSON.stringify({ values: novoV }) });
    await graph(token, `${wsPath}/range(address='${addrX}')`, { method: "PATCH", body: JSON.stringify({ values: novoX }) });
  }

  // Destaque por cor (âmbar "aguardando" / verde "autorizado"). Só quando muda ou forçado.
  if (mudou || force) {
    try {
      report.destaque = await aplicarCores(token, wsPath, values, porLote, [{ letter: colLetter(colV), idx: colV, key: "v" }, { letter: colLetter(colX), idx: colX, key: "x" }], orfaos);
    } catch (e) {
      report.destaque = "erro: " + (e instanceof Error ? e.message : String(e));
    }
  }

  // Mão de volta Excel→dashboard: aplica os "pago" lidos da célula (e desmarca os
  // removidos) em LOTE — 1 escrita no blob independente do volume.
  try {
    const patches = new Map<string, Record<string, unknown>>();
    const hoje = new Date().toISOString().split("T")[0];
    for (const p of paraImportar) {
      const cur = patches.get(p.chaveVenda) || {};
      if (p.parte === "corretor") { cur.pagoCorretora = true; cur.dataPagoCorretora = hoje; }
      else { cur.pagoImobiliaria = true; cur.dataPagoImobiliaria = hoje; }
      cur.observacao = "pago via Excel";
      patches.set(p.chaveVenda, cur);
    }
    for (const p of paraDesmarcar) {
      const cur = patches.get(p.chaveVenda) || {};
      if (p.parte === "corretor") { cur.pagoCorretora = false; cur.dataPagoCorretora = ""; }
      else { cur.pagoImobiliaria = false; cur.dataPagoImobiliaria = ""; }
      patches.set(p.chaveVenda, cur);
    }
    await setBonusPagamentosEmLote(Array.from(patches, ([chaveVenda, patch]) => ({ chaveVenda, patch })));
    report.importadosAplicados = paraImportar.length + paraDesmarcar.length;
  } catch (e) {
    console.warn("importação Excel→dashboard falhou:", e);
    report.importadosAplicados = 0;
  }

  // Marca o horário do sync (mesmo sem mudança) p/ o throttle do caminho automático.
  // Sucesso LIMPA a última falha registrada (admin volta a mostrar verde).
  await gravarSyncState({ syncedAt: new Date().toISOString(), celulasAlteradas: alteradas });

  return report;
}
