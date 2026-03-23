import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { password } = await request.json();
  const correct = process.env.DASHBOARD_PASSWORD || "REDACTED";

  if (password === correct) {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Senha incorreta" }, { status: 401 });
}
