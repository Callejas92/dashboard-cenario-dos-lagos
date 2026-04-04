import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"
import { createServiceSupabase } from "@/lib/supabase-server"

export async function GET() {
  const session = await verifySession()
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
  }

  const supabase = await createServiceSupabase()

  const [empResult, checkinsResult] = await Promise.all([
    supabase
      .from("empreendimentos")
      .select("*")
      .eq("ativo", true)
      .limit(1)
      .single(),
    supabase
      .from("checkins")
      .select("*")
      .eq("corretor_id", session.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ])

  return NextResponse.json({
    empreendimento: empResult.data,
    historico: checkinsResult.data || [],
  })
}
