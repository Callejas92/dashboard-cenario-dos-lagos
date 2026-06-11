/**
 * PIX dos recebedores de bônus (corretor por CPF, imobiliária por CNPJ).
 *  - GET  → { pix: { [doc]: chavePix } }
 *  - POST { doc, pix } → salva (pix vazio remove)
 * Persistido em Vercel Blob (pix-recebedores.json).
 */
import { list, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { checkWriteAuth } from "@/lib/server-auth";
import { edgeRead, edgeWrite } from "@/lib/edge-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BLOB = "pix-recebedores.json";
const EDGE_KEY = "pix";

async function load(): Promise<Record<string, string>> {
  // 1) Edge Config (sobrevive a bloqueio do Blob)
  const e = await edgeRead<Record<string, string>>(EDGE_KEY);
  if (e && typeof e === "object" && !Array.isArray(e)) return e;
  // 2) Fallback Blob
  try {
    const { blobs } = await list({ prefix: BLOB });
    const hit = blobs.find((b) => b.pathname === BLOB) ?? blobs[0];
    if (!hit) return {};
    const res = await fetch(hit.url, { cache: "no-store" });
    if (!res.ok) return {};
    return (await res.json()) as Record<string, string>;
  } catch {
    return {};
  }
}

export async function GET() {
  return NextResponse.json({ pix: await load() });
}

export async function POST(req: Request) {
  // PIX é alvo de fraude direta (trocar a chave = receber o pagamento) — escrita protegida.
  const negado = checkWriteAuth(req);
  if (negado) return negado;
  const body = (await req.json().catch(() => null)) as { doc?: string; pix?: string } | null;
  const doc = String(body?.doc ?? "").trim();
  const pix = String(body?.pix ?? "").trim();
  if (!doc) return NextResponse.json({ error: "doc obrigatório" }, { status: 400 });

  const map = await load();
  if (pix) map[doc] = pix;
  else delete map[doc];

  // 1) Edge Config. 2) fallback Blob (sem token de escrita no Edge).
  if (!(await edgeWrite(EDGE_KEY, map))) {
    await put(BLOB, JSON.stringify(map), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
  }

  // Devolve o mapa atualizado: a UI aplica direto (read-your-writes) sem reler o blob
  // (que pode servir versão velha por ~60s após a sobrescrita).
  return NextResponse.json({ ok: true, doc, pix, pixMap: map });
}
