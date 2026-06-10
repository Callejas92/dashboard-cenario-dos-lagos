/**
 * Lotes do investidor — leitura e edição SEM deploy.
 *  - GET  → { lots, origem ("blob"|"seed"), qtd }
 *  - POST { lots: string[] } → substitui a lista (protegido; formato Q<n>-L<n>)
 */
import { NextResponse } from "next/server";
import { getInvestorLotsInfo, setInvestorLots } from "@/lib/investor-lots";
import { checkWriteAuth } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getInvestorLotsInfo());
}

export async function POST(request: Request) {
  const negado = checkWriteAuth(request);
  if (negado) return negado;
  const body = (await request.json().catch(() => null)) as { lots?: unknown } | null;
  if (!Array.isArray(body?.lots) || body.lots.length === 0) {
    return NextResponse.json({ error: "Envie { lots: string[] } (não vazio)" }, { status: 400 });
  }
  const lots = body.lots.map(String);
  const invalidos = lots.filter((l) => !/^Q\d+-L\d+$/i.test(l.trim()));
  if (invalidos.length) {
    return NextResponse.json({ error: `Formato inválido (esperado Q<n>-L<n>): ${invalidos.slice(0, 5).join(", ")}` }, { status: 400 });
  }
  const r = await setInvestorLots(lots);
  return NextResponse.json({ ok: true, ...r });
}
