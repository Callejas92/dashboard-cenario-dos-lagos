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

export async function authenticate(): Promise<string> {
  const { login, senha, integrationToken } = getUauCredentials();

  if (!login || !senha || !integrationToken) {
    throw new Error("Credenciais UAU não configuradas");
  }

  const res = await fetch(
    `${UAU_API}/api/v1/Autenticador/AutenticarUsuario`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-INTEGRATION-Authorization": integrationToken,
      },
      body: JSON.stringify({ login, senha }),
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
  } finally {
    clearTimeout(timeout);
  }
}
