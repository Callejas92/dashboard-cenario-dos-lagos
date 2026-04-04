import { NextRequest, NextResponse } from "next/server"
import { createServiceSupabase } from "@/lib/supabase-server"
import { createSession, setSessionCookie } from "@/lib/auth"

export async function POST(request: NextRequest) {
  const { nome, creci } = await request.json()

  if (!nome?.trim() || !creci?.trim()) {
    return NextResponse.json(
      { error: "Nome e CRECI são obrigatórios." },
      { status: 400 }
    )
  }

  const supabase = await createServiceSupabase()

  const { data: corretor, error } = await supabase
    .from("corretores")
    .select("*")
    .ilike("nome", nome.trim())
    .eq("creci", creci.trim())
    .eq("ativo", true)
    .single()

  if (error || !corretor) {
    return NextResponse.json(
      { error: "Nome ou CRECI incorretos." },
      { status: 401 }
    )
  }

  const token = await createSession({
    id: corretor.id,
    nome: corretor.nome,
    creci: corretor.creci,
    role: corretor.role,
  })

  await setSessionCookie(token)

  return NextResponse.json({
    success: true,
    corretor: {
      id: corretor.id,
      nome: corretor.nome,
      role: corretor.role,
    },
  })
}
