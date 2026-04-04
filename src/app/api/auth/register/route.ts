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

  const nomeClean = nome.trim()
  const creciClean = creci.trim()

  if (!/^\d+$/.test(creciClean)) {
    return NextResponse.json(
      { error: "CRECI deve conter apenas números." },
      { status: 400 }
    )
  }

  const supabase = await createServiceSupabase()

  // Verificar se CRECI já existe
  const { data: existente } = await supabase
    .from("corretores")
    .select("id")
    .eq("creci", creciClean)
    .single()

  if (existente) {
    return NextResponse.json(
      { error: "Este CRECI já está cadastrado." },
      { status: 409 }
    )
  }

  // Inserir novo corretor
  const { data: corretor, error } = await supabase
    .from("corretores")
    .insert({ nome: nomeClean, creci: creciClean })
    .select()
    .single()

  if (error) {
    return NextResponse.json(
      { error: "Erro ao cadastrar. Tente novamente." },
      { status: 500 }
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
