/**
 * Histórico DIÁRIO de inadimplência — snapshots gravados pelo /api/uau/financeiro
 * (que roda várias vezes ao dia via acessos + cron warm). Um registro por dia;
 * execuções seguintes do mesmo dia atualizam o valor (fecha o dia com o mais recente).
 *
 * Começou a acumular em 10/06/2026 — não há como reconstruir o passado.
 */
import { list, put } from "@vercel/blob";

const BLOB = "config/inadimplencia-historico.json";

export interface SnapshotInadimplencia {
  data: string; // yyyy-mm-dd
  pct: number;
  totalVencido: number;
  qtdClientes: number;
  qtdParcelas: number;
}

export async function lerHistoricoInadimplencia(): Promise<SnapshotInadimplencia[]> {
  try {
    const { blobs } = await list({ prefix: BLOB });
    const hit = blobs.find((b) => b.pathname === BLOB) ?? blobs[0];
    if (!hit) return [];
    const j = await (await fetch(`${hit.url}?_=${Date.now()}`, { cache: "no-store" })).json();
    return Array.isArray(j?.dias) ? j.dias : [];
  } catch {
    return [];
  }
}

export async function salvarSnapshotInadimplencia(s: Omit<SnapshotInadimplencia, "data">): Promise<void> {
  try {
    const hoje = new Date().toISOString().split("T")[0];
    const dias = await lerHistoricoInadimplencia();
    const idx = dias.findIndex((d) => d.data === hoje);
    const item: SnapshotInadimplencia = { data: hoje, ...s };
    if (idx >= 0) {
      // Sem mudança → não regrava (poupa writes no blob)
      if (Math.abs(dias[idx].pct - s.pct) < 0.001 && dias[idx].totalVencido === s.totalVencido) return;
      dias[idx] = item;
    } else {
      dias.push(item);
    }
    dias.sort((a, b) => a.data.localeCompare(b.data));
    await put(BLOB, JSON.stringify({ dias: dias.slice(-400) }), {
      access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json",
    });
  } catch (e) {
    console.warn("snapshot inadimplência falhou:", e);
  }
}
