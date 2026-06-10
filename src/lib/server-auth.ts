/**
 * Proteção das rotas de ESCRITA da API.
 *
 * O login do dashboard é client-side (localStorage) — sem isso, qualquer pessoa
 * com a URL poderia escrever (marcar bônus pago, trocar PIX, mexer em eventos).
 * Mesmo padrão do /api/metrics: Authorization: Bearer <DASHBOARD_PASSWORD>.
 *
 * Uso nas rotas:
 *   const negado = checkWriteAuth(request);
 *   if (negado) return negado;
 */
import { NextResponse } from "next/server";

export function checkWriteAuth(request: Request): NextResponse | null {
  const senha = process.env.DASHBOARD_PASSWORD?.trim();
  // Sem senha configurada no ambiente: não trava (dev local), mas loga.
  if (!senha) {
    console.warn("server-auth: DASHBOARD_PASSWORD ausente — rota de escrita sem proteção");
    return null;
  }
  const header = request.headers.get("authorization") || "";
  if (header === `Bearer ${senha}`) return null;
  return NextResponse.json(
    { error: "Não autorizado. Faça login no dashboard novamente." },
    { status: 401 },
  );
}
