/**
 * Congelamento do RELATÓRIO MENSAL — 1 snapshot por mês comercial.
 *
 * Onde: Vercel Blob (`relatorio/<YYYY-MM>.json`). Snapshots crescem (12/ano) e por isso
 * NÃO cabem no Edge Config (teto TOTAL ~8KB, reservado pro crítico: token + pagos + sync).
 *
 * Enquanto o Blob estiver bloqueado (limite de uso): o congelamento falha de propósito
 * (catch → false) e o relatório do mês fechado é recalculado AO VIVO. Como os dados do
 * Eggs de meses passados são estáveis, o número é o mesmo; ao voltar o Blob, congela.
 *
 * Imutável: se já existe snapshot, NÃO sobrescreve (o oficial não muda).
 */
import { list, put } from "@vercel/blob";
import type { RelatorioMensal } from "@/lib/relatorio-mensal";

// "relatorio-cal/" = mês civil. O prefixo antigo "relatorio/" guardava snapshots do
// mês comercial 15→14 — ao migrar pro mês de calendário (jun/2026) trocamos o prefixo
// pra NÃO servir período errado; os snapshots antigos ficam órfãos (ignorados) e os
// meses fechados recalculam ao vivo até o Blob voltar e o cron recongelar no novo prefixo.
const PREFIXO = "relatorio-cal/"; // relatorio-cal/2026-05.json

export async function lerSnapshot(mesISO: string): Promise<RelatorioMensal | null> {
  try {
    const path = `${PREFIXO}${mesISO}.json`;
    const { blobs } = await list({ prefix: path });
    const hit = blobs.find((b) => b.pathname === path) ?? blobs[0];
    if (!hit) return null;
    const res = await fetch(hit.url, { cache: "no-store" });
    if (!res.ok) return null;
    const r = (await res.json()) as RelatorioMensal;
    return r && r.mesISO ? { ...r, congelado: true } : null;
  } catch {
    return null; // Blob bloqueado/indisponível → sem snapshot (recompute ao vivo)
  }
}

/**
 * Congela um relatório (só mês FECHADO). Retorna true se gravou. Idempotente: não
 * sobrescreve snapshot existente. Falha silenciosa se o Blob estiver bloqueado.
 */
export async function congelarRelatorio(rel: RelatorioMensal, mesFechado: boolean): Promise<boolean> {
  if (!mesFechado) return false;
  try {
    const existente = await lerSnapshot(rel.mesISO);
    if (existente) return false; // já congelado — imutável
    await put(`${PREFIXO}${rel.mesISO}.json`, JSON.stringify({ ...rel, congelado: true }), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/json",
    });
    return true;
  } catch {
    return false; // Blob bloqueado → não congela agora; recompute ao vivo cobre
  }
}
