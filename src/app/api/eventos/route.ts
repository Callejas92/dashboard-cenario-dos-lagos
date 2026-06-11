/**
 * API de Eventos de marketing/comercial (marcadores dos gráficos do Panorama).
 *
 * Persistência: Vercel Blob (config/eventos.json) — mesmo mecanismo dos caches.
 * GET    -> lista os eventos (default: só "Lançamento" se ainda não há nada salvo)
 * POST   -> adiciona { data, nome, tipo }
 * DELETE -> remove por { id }
 *
 * Escrita protegida (Bearer = senha do dashboard) — ver src/lib/server-auth.ts.
 */
import { NextResponse } from "next/server";
import { list, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { PROJETO } from "@/lib/constants/projeto";
import { checkWriteAuth } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BLOB_PATH = "config/eventos.json";
const TIPOS = ["marco", "midia", "evento", "imobiliaria", "outro"] as const;
type Tipo = (typeof TIPOS)[number];

interface Evento {
  id: string;
  data: string; // yyyy-mm-dd
  nome: string;
  tipo: Tipo;
}

const DEFAULT_EVENTOS: Evento[] = [
  { id: "lancamento", data: PROJETO.DATA_LANCAMENTO, nome: "Lançamento", tipo: "marco" },
];

async function lerEventos(): Promise<Evento[]> {
  try {
    const { blobs } = await list({ prefix: BLOB_PATH });
    const hit = blobs.find((b) => b.pathname === BLOB_PATH) ?? blobs[0];
    if (!hit) return DEFAULT_EVENTOS;
    const res = await fetch(hit.url, { cache: "no-store" }); // fura cache CDN do Blob
    if (!res.ok) return DEFAULT_EVENTOS;
    const j = await res.json();
    const arr = Array.isArray(j?.eventos) ? (j.eventos as Evento[]) : [];
    // "Lançamento" é marco fixo: garante que sempre exista, mesmo que removido.
    return arr.some((e) => e.id === "lancamento") ? arr : [DEFAULT_EVENTOS[0], ...arr];
  } catch {
    return DEFAULT_EVENTOS;
  }
}

async function salvarEventos(eventos: Evento[]): Promise<void> {
  await put(BLOB_PATH, JSON.stringify({ eventos, savedAt: new Date().toISOString() }), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

function ordenar(eventos: Evento[]): Evento[] {
  return [...eventos].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
}

export async function GET() {
  const eventos = ordenar(await lerEventos());
  return NextResponse.json({ eventos });
}

export async function POST(req: Request) {
  const negado = checkWriteAuth(req);
  if (negado) return negado;
  try {
    const body = await req.json().catch(() => ({}));
    const data = String(body?.data || "").slice(0, 10);
    const nome = String(body?.nome || "").trim().slice(0, 40);
    const tipo: Tipo = TIPOS.includes(body?.tipo) ? body.tipo : "outro";

    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return NextResponse.json({ error: "Data inválida (use uma data válida)." }, { status: 400 });
    }
    if (!nome) {
      return NextResponse.json({ error: "Dê um nome ao evento." }, { status: 400 });
    }

    const atual = await lerEventos();
    const novo: Evento = { id: randomUUID(), data, nome, tipo };
    const atualizado = ordenar([...atual, novo]);
    await salvarEventos(atualizado);
    return NextResponse.json({ eventos: atualizado });
  } catch {
    return NextResponse.json({ error: "Falha ao salvar o evento." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const negado = checkWriteAuth(req);
  if (negado) return negado;
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "");
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

    const atual = await lerEventos();
    const atualizado = atual.filter((e) => e.id !== id);
    await salvarEventos(atualizado);
    return NextResponse.json({ eventos: atualizado });
  } catch {
    return NextResponse.json({ error: "Falha ao remover o evento." }, { status: 500 });
  }
}
