/**
 * Credencial do dashboard no cliente (par do src/lib/server-auth.ts).
 *
 * No login, a senha validada é guardada no localStorage e enviada como
 * Authorization: Bearer nas chamadas de ESCRITA (marcar bônus, PIX, eventos).
 * Sessões antigas (só com a flag, sem a chave) são forçadas a relogar uma vez.
 */

const KEY = "dashboard-key";

export function setDashKey(senha: string) {
  try { localStorage.setItem(KEY, senha); } catch { /* storage indisponível */ }
}

export function getDashKey(): string {
  try { return localStorage.getItem(KEY) || ""; } catch { return ""; }
}

export function clearDashKey() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** fetch com Authorization: Bearer — usar em TODA escrita (POST/DELETE). */
export function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${getDashKey()}` },
  });
}
