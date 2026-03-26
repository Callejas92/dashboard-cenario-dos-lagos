import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { password } = await request.json();
  const correct = process.env.DASHBOARD_PASSWORD;
  if (!correct) {
    return NextResponse.json({ error: "Senha não configurada no servidor" }, { status: 500 });
  }

  if (password === correct) {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Senha incorreta" }, { status: 401 });
}
