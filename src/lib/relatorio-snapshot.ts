/**
 * Congelamento do RELATÓRIO MENSAL — 1 snapshot por mês comercial no Edge Config.
 *
 * Por quê: ao virar o dia 15, o relatório do mês que fechou vira OFICIAL e imutável —
 * mesmo que alguém edite uma data_contrato no Eggs depois, o número publicado não muda.
 *
 * Onde: Edge Config (`relatorio_<YYYY-MM>`) — pequeno (~3KB), durável e à prova de
 * bloqueio do Blob. Só congela mês JÁ FECHADO (o mês em curso é sempre ao vivo).
 */
import { edgeRead, edgeWrite } from "@/lib/edge-store";
import type { RelatorioMensal } from "@/lib/relatorio-mensal";

const PREFIXO = "relatorio_"; // chave Edge: relatorio_2026-05

export async function lerSnapshot(mesISO: string): Promise<RelatorioMensal | null> {
  const r = await edgeRead<RelatorioMensal>(`${PREFIXO}${mesISO}`);
  if (r && typeof r === "object" && r.mesISO) {
    return { ...r, congelado: true };
  }
  return null;
}

/**
 * Congela um relatório (só se o mês estiver FECHADO). Retorna true se gravou.
 * Idempotente: se já existe snapshot, NÃO sobrescreve (o oficial é imutável).
 */
export async function congelarRelatorio(rel: RelatorioMensal, mesFechado: boolean): Promise<boolean> {
  if (!mesFechado) return false;
  const existente = await edgeRead<RelatorioMensal>(`${PREFIXO}${rel.mesISO}`);
  if (existente && typeof existente === "object" && existente.mesISO) return false; // já congelado
  return edgeWrite(`${PREFIXO}${rel.mesISO}`, { ...rel, congelado: true });
}
