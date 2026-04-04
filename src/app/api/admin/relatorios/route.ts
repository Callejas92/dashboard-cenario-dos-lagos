import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"
import { createServiceSupabase } from "@/lib/supabase-server"

export async function GET(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const inicio = searchParams.get("inicio")
  const fim = searchParams.get("fim")

  const supabase = await createServiceSupabase()

  let query = supabase
    .from("checkins")
    .select("*, corretor:corretores(nome, creci), empreendimento:empreendimentos(nome)")
    .eq("status", "valido")
    .order("created_at", { ascending: false })

  if (inicio) query = query.gte("created_at", inicio)
  if (fim) query = query.lte("created_at", `${fim}T23:59:59`)

  const { data } = await query

  return NextResponse.json({ checkins: data || [] })
}
