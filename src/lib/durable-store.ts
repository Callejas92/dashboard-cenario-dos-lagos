/**
 * Storage durável com AUTO-MIGRAÇÃO Edge → Blob.
 *
 * Contexto: o Edge Config tem teto TOTAL de ~8KB. Dados que CRESCEM (bonus_payments,
 * datas_venda) só cabem lá temporariamente, enquanto o Blob está bloqueado. Este helper
 * grava **Blob-primeiro**; quando o Blob volta a aceitar escrita, o dado migra sozinho e
 * a chave do Edge é APAGADA (libera espaço). Enquanto o Blob está bloqueado, cai no Edge.
 *
 *  saveDurable: tenta Blob (timeout curto p/ não travar). Sucesso → limpa Edge ("blob").
 *               Falha (bloqueado) → grava Edge ("edge"). Sem nenhum → "none".
 *  loadDurable: Edge primeiro (rápido, pré-migração); se vazio, Blob (pós-migração).
 */
import { list, put } from "@vercel/blob";
import { edgeRead, edgeWrite, edgeDelete } from "@/lib/edge-store";

const BLOB_TIMEOUT_MS = 10000; // não deixa o put travar o sync se o Blob estiver lento/bloqueado

export async function saveDurable(blobPath: string, edgeKey: string, value: unknown): Promise<"blob" | "edge" | "none"> {
  try {
    await Promise.race([
      put(blobPath, JSON.stringify(value), {
        access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json",
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("blob timeout")), BLOB_TIMEOUT_MS)),
    ]);
    // Migrou pro Blob → libera a chave do Edge (recupera os ~8KB).
    await edgeDelete(edgeKey).catch(() => {});
    return "blob";
  } catch {
    // Blob bloqueado/indisponível → fallback Edge (enquanto durar o bloqueio).
    return (await edgeWrite(edgeKey, value)) ? "edge" : "none";
  }
}

/** Lê Edge primeiro (pré-migração); se vazio, lê Blob (pós-migração). null = nenhum legível. */
export async function loadDurable<T = unknown>(blobPath: string, edgeKey: string): Promise<T | null> {
  try {
    const e = await edgeRead<T>(edgeKey);
    if (e !== null && e !== undefined) return e;
  } catch { /* segue pro Blob */ }
  try {
    const { blobs } = await list({ prefix: blobPath });
    const hit = blobs.find((b) => b.pathname === blobPath) ?? blobs[0];
    if (!hit) return null;
    const res = await fetch(hit.url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
