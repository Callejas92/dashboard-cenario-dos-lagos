/**
 * Cache persistente via Vercel Blob — sobrevive entre invocações serverless
 * (ao contrário do cache em memória, que não é compartilhado entre instâncias
 * e some no cold start).
 *
 * Estratégia stale-while-revalidate:
 *  - Se existe cache (mesmo "velho"), devolve NA HORA e dispara a atualização
 *    em segundo plano (via after(), que roda depois da resposta — funciona
 *    inclusive no plano Hobby da Vercel, sem precisar de cron). Ninguém espera.
 *  - Só bloqueia esperando a fonte quando NÃO há cache nenhum (1º acesso).
 *  - Se a fonte falhar, continua servindo o último dado bom em vez de zerar.
 */
import { list, put } from "@vercel/blob";
import { after } from "next/server";

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

async function writeCache<T>(blobName: string, data: T): Promise<void> {
  const entry: CacheEntry<T> = { savedAt: Date.now(), data };
  await put(blobName, JSON.stringify(entry), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
  }).catch((err) =>
    console.warn(`blob-cache: falha ao salvar ${blobName}:`, err),
  );
}

/**
 * Devolve o resultado de `producer()` com cache no Blob por `ttlMs`,
 * no modo stale-while-revalidate.
 */
export async function cachedJson<T>(
  key: string,
  ttlMs: number,
  producer: () => Promise<T>,
): Promise<T> {
  const blobName = `cache/${key}.json`;
  const cached = await readCache<T>(blobName);

  if (cached) {
    const stale = Date.now() - cached.savedAt >= ttlMs;
    if (stale) {
      // Serve o dado atual já e revalida em segundo plano (após a resposta).
      const refresh = async () => {
        try {
          await writeCache(blobName, await producer());
        } catch (err) {
          console.warn(`blob-cache: refresh em background falhou (${key}):`, err);
        }
      };
      try {
        after(refresh);
      } catch {
        // fora de um contexto de request: ignora (a próxima visita revalida)
      }
    }
    return cached.data;
  }

  // Sem cache nenhum: precisa buscar agora (único caminho que bloqueia).
  const data = await producer();
  await writeCache(blobName, data);
  return data;
}
