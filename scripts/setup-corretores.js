/**
 * Script para importar corretores do Excel para o Supabase
 *
 * Uso: node scripts/setup-corretores.js
 *
 * Lê corretores.xlsx na raiz do projeto e insere na tabela corretores.
 * Corretores com CRECI já existente são ignorados.
 */

const { createClient } = require("@supabase/supabase-js")
const XLSX = require("xlsx")
const path = require("path")

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://qmrftpmkqavsdqhsxvsn.supabase.co"
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtcmZ0cG1rcWF2c2RxaHN4dnNuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDkxNzk1MCwiZXhwIjoyMDkwNDkzOTUwfQ.wIlaoPD5VDU49hDcW_tSamZvfEFKMpMaY5zj0P0b6IQ"

// Admin padrão
const ADMIN = {
  nome: "Admin",
  creci: "0000",
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  console.log("=== SETUP CORRETORES - Cenario dos Lagos ===\n")

  // 1. Criar admin
  console.log("1. Criando admin...")
  const { data: existeAdmin } = await supabase
    .from("corretores")
    .select("id")
    .eq("creci", ADMIN.creci)
    .single()

  if (existeAdmin) {
    console.log("   Admin ja existe, pulando...")
  } else {
    const { error } = await supabase
      .from("corretores")
      .insert({ nome: ADMIN.nome, creci: ADMIN.creci, role: "admin" })

    if (error) {
      console.log("   Erro ao criar admin:", error.message)
    } else {
      console.log("   Admin criado! Login: Nome='Admin', CRECI='0000'")
    }
  }

  // 2. Ler Excel
  console.log("\n2. Lendo corretores.xlsx...")
  const filePath = path.join(__dirname, "..", "corretores.xlsx")

  let workbook
  try {
    workbook = XLSX.readFile(filePath)
  } catch {
    console.log("   Arquivo corretores.xlsx nao encontrado em:", filePath)
    console.log("   Pulando importacao de corretores do Excel.")
    console.log("\n=== SETUP COMPLETO ===")
    return
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })

  // Encontrar header
  let headerIdx = -1, nomeCol = -1, creciCol = -1
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
    console.log("   Planilha sem colunas 'Nome' e 'Creci'")
    return
  }

  // 3. Importar corretores
  console.log("\n3. Importando corretores...\n")

  let adicionados = 0, existentes = 0

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue
    const nome = String(row[nomeCol] || "").trim()
    const creci = String(row[creciCol] || "").trim().replace(/\.0$/, "")
    if (!nome || !creci || creci === "NaN") continue

    const { data: existe } = await supabase
      .from("corretores")
      .select("id")
      .eq("creci", creci)
      .single()

    if (existe) {
      console.log(`   ${nome} (CRECI ${creci}) - ja cadastrado`)
      existentes++
    } else {
      const { error } = await supabase
        .from("corretores")
        .insert({ nome, creci })

      if (error) {
        console.log(`   ${nome} (CRECI ${creci}) - ERRO: ${error.message}`)
      } else {
        console.log(`   ${nome} (CRECI ${creci}) - adicionado`)
        adicionados++
      }
    }
  }

  console.log(`\n=== SETUP COMPLETO ===`)
  console.log(`Adicionados: ${adicionados} | Ja existentes: ${existentes}`)
  console.log(`\nLogin admin: Nome='Admin', CRECI='0000'`)
}

main().catch(console.error)
