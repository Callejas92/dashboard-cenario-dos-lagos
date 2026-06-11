/**
 * Edge Config como storage durável PEQUENO — fora do Vercel Blob.
 *
 * Por quê: o Blob é BLOQUEÁVEL ao estourar o limite de uso do plano grátis (aconteceu
 * em 11/06/2026 — a Vercel passou a responder 403 "Your store is blocked" em TODA
 * leitura). Quando isso acontece, tudo que dependia do Blob some de uma vez (token do
 * OneDrive ilegível, pagos zerados, eventos sumidos…). O Edge Config tem leitura
 * grátis e ilimitada na borda, NÃO compartilha o teto do Blob, e é o lugar certo pro
 * que não pode sumir e é pequeno: token do OneDrive, eventos, lotes do investidor, PIX.
 *
 * Mover essas leituras pra cá também ALIVIA o Blob (o token era lido a cada chamada
 * ao Graph) — ajuda a não estourar de novo.
 *
 * Teto medido (11/06/2026): ~8 KB por item. Dados que CRESCEM (bonus-payments) ficam
 * no Blob — são reconstruíveis do Excel.
 *
 * Leitura: GET no endpoint de borda — precisa só de EDGE_CONFIG (connection string).
 * Escrita: PATCH na REST API da Vercel — precisa de VERCEL_API_TOKEN + EDGE_CONFIG_ID.
 *          Sem o token de escrita, edgeWrite devolve false e o chamador cai no Blob
 *          (degradação segura, sem regressão).
 */

const CONN = (process.env.EDGE_CONFIG || "").trim();      // https://edge-config.vercel.com/<id>?token=<read>
const CFG_ID = (process.env.EDGE_CONFIG_ID || "").trim(); // ecfg_...
const API_TOKEN = (process.env.VERCEL_API_TOKEN || "").trim();
const TEAM_ID = (process.env.VERCEL_TEAM_ID || "").trim();

function conn(): { base: string; token: string } | null {
  if (!CONN) return null;
  try {
    const u = new URL(CONN);
    const token = u.searchParams.get("token") || "";
    const base = `${u.origin}${u.pathname}`.replace(/\/$/, ""); // https://edge-config.vercel.com/<id>
    return token && base ? { base, token } : null;
  } catch {
    return null;
  }
}

/** true se dá pra ESCREVER no Edge (tem token de escrita). Senão, chamador usa o Blob. */
export function edgeWriteDisponivel(): boolean {
  return !!(CFG_ID && API_TOKEN);
}

/** Lê um item do Edge Config. null = ausente OU Edge indisponível (chamador cai no Blob). */
export async function edgeRead<T = unknown>(key: string): Promise<T | null> {
  const c = conn();
  if (!c) return null;
  try {
    const res = await fetch(`${c.base}/item/${encodeURIComponent(key)}?token=${c.token}`, {
      cache: "no-store",
    });
    if (!res.ok) return null; // 404 = não existe; outros = trata como ausente
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Upsert de um item. true se gravou no Edge; false se não há token de escrita. */
export async function edgeWrite(key: string, value: unknown): Promise<boolean> {
  if (!CFG_ID || !API_TOKEN) return false;
  return patch([{ operation: "upsert", key, value }]);
}

/** Remove um item (ex.: PIX apagado). true se removeu (ou já não existia). */
export async function edgeDelete(key: string): Promise<boolean> {
  if (!CFG_ID || !API_TOKEN) return false;
  return patch([{ operation: "delete", key }]);
}

async function patch(items: Array<{ operation: string; key: string; value?: unknown }>): Promise<boolean> {
  try {
    const qs = TEAM_ID ? `?teamId=${TEAM_ID}` : "";
    const res = await fetch(`https://api.vercel.com/v1/edge-config/${CFG_ID}/items${qs}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
