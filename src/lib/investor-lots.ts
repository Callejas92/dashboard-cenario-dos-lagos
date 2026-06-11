/**
 * Lotes do INVESTIDOR (Tio Ico) — excluídos de VGV, velocidade, estoque vendável e bônus.
 *
 * Antes era só o JSON estático (src/data/investor-lots.json): qualquer mudança na
 * lista (ex.: 2026-05-18, Q5-L57 entrou / Q5-L59 saiu) exigia deploy. Agora a lista
 * pode ser sobrescrita pelo Blob (config/investor-lots.json) via /api/investor-lots,
 * com o JSON estático como SEED/fallback. Cache em memória de 5 min.
 */
import { list, put } from "@vercel/blob";
import investorData from "@/data/investor-lots.json";

const BLOB = "config/investor-lots.json";
const TTL = 5 * 60 * 1000;

let cacheIL: { lots: Set<string>; origem: "blob" | "seed"; ts: number } | null = null;

export async function getInvestorLots(): Promise<Set<string>> {
  if (cacheIL && Date.now() - cacheIL.ts < TTL) return cacheIL.lots;
  try {
    const { blobs } = await list({ prefix: BLOB });
    const hit = blobs.find((b) => b.pathname === BLOB) ?? blobs[0];
    if (hit) {
      const j = await (await fetch(hit.url, { cache: "no-store" })).json();
      if (Array.isArray(j?.lots) && j.lots.length > 0) {
        cacheIL = { lots: new Set<string>(j.lots.map(String)), origem: "blob", ts: Date.now() };
        return cacheIL.lots;
      }
    }
  } catch { /* cai no seed */ }
  cacheIL = { lots: new Set<string>(investorData.lots), origem: "seed", ts: Date.now() };
  return cacheIL.lots;
}

export async function getInvestorLotsInfo(): Promise<{ lots: string[]; origem: "blob" | "seed"; qtd: number }> {
  const lots = await getInvestorLots();
  return { lots: Array.from(lots).sort(), origem: cacheIL?.origem ?? "seed", qtd: lots.size };
}

export async function setInvestorLots(lots: string[]): Promise<{ qtd: number }> {
  const limpos = Array.from(new Set(lots.map((l) => String(l).trim().toUpperCase()).filter(Boolean)));
  await put(BLOB, JSON.stringify({ lots: limpos, atualizadoEm: new Date().toISOString() }), {
    access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json",
  });
  cacheIL = { lots: new Set(limpos), origem: "blob", ts: Date.now() };
  return { qtd: limpos.length };
}
