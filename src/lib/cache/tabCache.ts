/**
 * Configuração global de cache entre abas — SWR (stale-while-revalidate).
 *
 * Decisão Felipe:
 *  - revalidateOnFocus: false (não recarrega ao voltar pra aba do navegador)
 *  - dedupingInterval: 5min (mesma key buscada em <5min = cache hit)
 *  - errorRetryCount: 2 (falha 3x = desiste, evita loop)
 *
 * Uso típico em componentes:
 *   const { data, error, isLoading, mutate } = useSWR("/api/bonus", fetcher);
 *   // ...após escrita:
 *   mutate(); // invalida + revalida
 */
import { SWRConfiguration } from "swr";

/** Fetcher padrão pra usar com SWR. */
export const fetcher = async (url: string): Promise<unknown> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Fetch ${url} retornou ${res.status}`);
  }
  return res.json();
};

/** Configuração global aplicada a todos os useSWR. */
export const SWR_CONFIG: SWRConfiguration = {
  fetcher,
  revalidateOnFocus: false,        // não recarrega ao voltar pra aba
  revalidateIfStale: true,         // se >5min sem refresh, busca de novo
  dedupingInterval: 5 * 60 * 1000, // 5min de cache
  errorRetryCount: 2,
  errorRetryInterval: 3000,
  shouldRetryOnError: true,
};

/**
 * Helper pra construir chave SWR com parâmetros.
 * Garante consistência (mesma query → mesma chave).
 */
export function buildKey(path: string, params?: Record<string, string | number | undefined>): string {
  if (!params || Object.keys(params).length === 0) return path;
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  return qs ? `${path}?${qs}` : path;
}
