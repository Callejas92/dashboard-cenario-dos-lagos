import { NextResponse } from "next/server";
import { put, list } from "@vercel/blob";

const BLOB_NAME = "metrics.json";

const DEFAULT_DATA = {
  config: {
    empreendimento: "Cenário dos Lagos",
    inicio: "2026-03-01",
    fim: "2027-08-31",
    totalSemanas: 78,
    canais: [
      "Google Ads", "Meta Ads", "Outdoor", "Rádio", "Site",
      "Jornal", "Outros", "Indicação", "Contato Corretor",
    ],
    metas: { cpl: 50, cac: 11250, roi: 3.5, vso: 5, tlq: 30, tcs: 35, slaResposta: 5 },
    vgv: { totalUnidades: 0, ticketMedio: 0, vgvTotal: 0 },
  },
  semanas: [],
};

async function readData() {
  try {
    const { blobs } = await list({ prefix: BLOB_NAME });
    if (blobs.length === 0) {
      await put(BLOB_NAME, JSON.stringify(DEFAULT_DATA), {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false,
    allowOverwrite: true,
      });
      return DEFAULT_DATA;
    }
    const res = await fetch(blobs[0].url, { cache: "no-store" });
    return await res.json();
  } catch {
    return DEFAULT_DATA;
  }
}

async function writeData(data: unknown) {
  await put(BLOB_NAME, JSON.stringify(data), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function GET() {
  try {
    const data = await readData();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Erro ao ler dados" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = await readData();

    const existingIndex = data.semanas.findIndex(
      (s: { semana: number }) => s.semana === body.semana
    );

    if (existingIndex >= 0) {
      data.semanas[existingIndex] = body;
    } else {
      data.semanas.push(body);
      data.semanas.sort((a: { semana: number }, b: { semana: number }) => a.semana - b.semana);
    }

    await writeData(data);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Erro ao salvar: " + String(error) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const data = await readData();

    if (body.config) {
      data.config = { ...data.config, ...body.config };
    }

    if (body.semanas) {
      data.semanas = body.semanas;
    }

    await writeData(data);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Erro ao atualizar: " + String(error) }, { status: 500 });
  }
}
