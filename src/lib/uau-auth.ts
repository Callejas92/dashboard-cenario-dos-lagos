export const UAU_API = process.env.UAU_API_URL || "https://gamma-api.seniorcloud.com.br:51928/uauAPI";

export function getUauCredentials() {
  const login = process.env.UAU_LOGIN;
  const senha = process.env.UAU_PASSWORD;
  const integrationToken = process.env.UAU_INTEGRATION_TOKEN;
  return { login, senha, integrationToken };
}

export function isUauConfigured(): boolean {
  const { login, senha, integrationToken } = getUauCredentials();
  return !!(login && senha && integrationToken);
}

// Cache do token JWT (válido por ~2h, renovamos a cada 90min)
let cachedToken: { token: string; expiresAt: number } | null = null;

async function authenticateOnce(): Promise<string> {
  const { login, senha, integrationToken } = getUauCredentials();

  if (!login || !senha || !integrationToken) {
    throw new Error("Credenciais UAU não configuradas");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(
      `${UAU_API}/api/v1/Autenticador/AutenticarUsuario`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-INTEGRATION-Authorization": integrationToken,
        },
        body: JSON.stringify({ login, senha }),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Autenticação falhou: ${res.status} — ${err}`);
    }

    const text = await res.text();
    const token = text.replace(/^"|"$/g, "");
    if (!token) {
      throw new Error("Token vazio na resposta de autenticação");
    }

    return token;
  } finally {
    clearTimeout(timeout);
  }
}

export async function authenticate(): Promise<string> {
  // Retorna token cacheado se ainda válido (90min)
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  // Retry com backoff: até 3 tentativas
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const token = await authenticateOnce();
      cachedToken = { token, expiresAt: Date.now() + 90 * 60 * 1000 };
      return token;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError!;
}

export function uauHeaders(token: string): Record<string, string> {
  const { integrationToken } = getUauCredentials();
  return {
    "Content-Type": "application/json",
    Authorization: token,
    "X-INTEGRATION-Authorization": integrationToken || "",
  };
}

export async function uauFetch(token: string, endpoint: string, body: unknown, timeoutMs = 15000): Promise<unknown> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${UAU_API}/api/v1/${endpoint}`, {
        method: "POST",
        headers: uauHeaders(token),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`${endpoint} falhou: ${res.status} — ${err}`);
      }

      return await res.json();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError!;
}
