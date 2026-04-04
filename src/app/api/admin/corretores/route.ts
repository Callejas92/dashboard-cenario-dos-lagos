import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"
import { createServiceSupabase } from "@/lib/supabase-server"
import * as XLSX from "xlsx"

// GET: lista todos os corretores
export async function GET() {
  const session = await verifySession()
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const supabase = await createServiceSupabase()
  const { data } = await supabase
    .from("corretores")
    .select("*")
    .order("nome")

  return NextResponse.json({ corretores: data || [] })
}

// POST: upload Excel para sincronizar corretores
export async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get("file") as File

  if (!file) {
    return NextResponse.json({ error: "Arquivo nao enviado" }, { status: 400 })
  }

  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: "array" })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown as unknown[][]

  // Encontrar a linha de header (contém "Nome" e "Creci")
  let headerIdx = -1
  let nomeCol = -1
  let creciCol = -1

  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const row = rows[i]
    if (!row) continue
    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] || "").toLowerCase().trim()
      if (cell === "nome") nomeCol = j
      if (cell === "creci") creciCol = j
    }
    if (nomeCol >= 0 && creciCol >= 0) {
      headerIdx = i
      break
    }
  }

  if (headerIdx < 0) {
    return NextResponse.json(
      { error: "Planilha deve ter colunas 'Nome' e 'Creci'" },
      { status: 400 }
    )
  }

  // Extrair corretores validos
  const corretores: { nome: string; creci: string }[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue
    const nome = String(row[nomeCol] || "").trim()
    const creci = String(row[creciCol] || "").trim()
    if (nome && creci && creci !== "NaN" && creci !== "undefined") {
      corretores.push({ nome, creci: creci.replace(/\.0$/, "") })
    }
  }

  if (corretores.length === 0) {
    return NextResponse.json(
      { error: "Nenhum corretor valido encontrado na planilha" },
      { status: 400 }
    )
  }

  const supabase = await createServiceSupabase()

  let adicionados = 0
  let existentes = 0

  for (const c of corretores) {
    const { data: existente } = await supabase
      .from("corretores")
      .select("id")
      .eq("creci", c.creci)
      .single()

    if (existente) {
      existentes++
    } else {
      const { error } = await supabase
        .from("corretores")
        .insert({ nome: c.nome, creci: c.creci })

      if (!error) adicionados++
    }
  }

  return NextResponse.json({
    success: true,
    total: corretores.length,
    adicionados,
    existentes,
  })
}
