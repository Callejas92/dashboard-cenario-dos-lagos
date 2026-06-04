/**
 * Cache persistente via Vercel Blob — sobrevive entre invocações serverless
 * (ao contrário do cache em memória, que não é compartilhado entre instâncias
 * e some no cold start). Padrão read-through com "serve stale on error":
 * se a busca falhar mas existir uma cópia antiga no Blob, devolve a antiga
 * em vez de quebrar a tela com zeros.
 */
import { list, put } from "@vercel/blob";

interface CacheEntry<T> {
  savedAt: number;
  data: T;
}

async function readCache<T>(blobName: string): Promise<CacheEntry<T> | null> {
  try {
    const { blobs } = await list({ prefix: blobName });
    const hit = blobs.find((b) => b.pathname === blobName) ?? blobs[0];
    if (!hit) return null;
    const res = await fetch(hit.url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as CacheEntry<T>;
  } catch {
    // ler o cache nunca deve ser fatal — segue para o producer
    return null;
  }
}

/**
 * Devolve o resultado de `producer()` com cache no Blob por `ttlMs`.
 *  - cache fresco (< ttl)  → devolve do Blob (rápido, ~200ms)
 *  - cache velho/ausente   → roda o producer e salva o resultado no Blob
 *  - producer falhou       → devolve o cache antigo se existir; senão relança
 */
export async function cachedJson<T>(
  key: string,
  ttlMs: number,
  producer: () => Promise<T>,
): Promise<T> {
  const blobName = `cache/${key}.json`;
  const cached = await readCache<T>(blobName);

  if (cached && Date.now() - cached.savedAt < ttlMs) {
    return cached.data;
  }

  try {
    const data = await producer();
    const entry: CacheEntry<T> = { savedAt: Date.now(), data };
    await put(blobName, JSON.stringify(entry), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
    }).catch((err) =>
      console.warn(`blob-cache: falha ao salvar ${blobName}:`, err),
    );
    return data;
  } catch (err) {
    if (cached) {
      console.warn(
        `blob-cache: producer falhou para "${key}"; servindo cache antigo.`,
        err,
      );
      return cached.data;
    }
    throw err;
  }
}
