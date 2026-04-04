import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"
import { createServiceSupabase } from "@/lib/supabase-server"
import * as XLSX from "xlsx"

export async function GET() {
  const session = await verifySession()
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const supabase = await createServiceSupabase()
  const { data: corretores } = await supabase
    .from("corretores")
    .select("nome, creci, role, ativo, created_at")
    .order("nome")

  if (!corretores || corretores.length === 0) {
    return NextResponse.json({ error: "Nenhum corretor encontrado" }, { status: 404 })
  }

  const rows = corretores.map((c, i) => ({
    "#": i + 1,
    Nome: c.nome,
    CRECI: c.creci,
    Tipo: c.role === "admin" ? "Admin" : "Corretor",
    Ativo: c.ativo ? "Sim" : "Nao",
    "Data Cadastro": new Date(c.created_at).toLocaleDateString("pt-BR"),
  }))

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  ws["!cols"] = [{ wch: 5 }, { wch: 30 }, { wch: 15 }, { wch: 10 }, { wch: 8 }, { wch: 15 }]
  XLSX.utils.book_append_sheet(wb, ws, "Corretores")

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=corretores-${new Date().toISOString().split("T")[0]}.xlsx`,
    },
  })
}
