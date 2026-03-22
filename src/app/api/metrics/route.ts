import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_PATH = path.join(process.cwd(), "data", "metrics.json");

export async function GET() {
  try {
    const raw = fs.readFileSync(DATA_PATH, "utf-8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: "Erro ao ler dados" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const raw = fs.readFileSync(DATA_PATH, "utf-8");
    const data = JSON.parse(raw);

    const existingIndex = data.semanas.findIndex(
      (s: { semana: number }) => s.semana === body.semana
    );

    if (existingIndex >= 0) {
      data.semanas[existingIndex] = body;
    } else {
      data.semanas.push(body);
      data.semanas.sort((a: { semana: number }, b: { semana: number }) => a.semana - b.semana);
    }

    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf-8");
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Erro ao salvar dados" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const raw = fs.readFileSync(DATA_PATH, "utf-8");
    const data = JSON.parse(raw);

    if (body.config) {
      data.config = { ...data.config, ...body.config };
    }

    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf-8");
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Erro ao atualizar config" }, { status: 500 });
  }
}
