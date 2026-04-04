"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { Corretor } from "@/types"

export default function CorretoresPage() {
  const [corretores, setCorretores] = useState<Corretor[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadCorretores()
  }, [])

  async function loadCorretores() {
    setLoading(true)
    const res = await fetch("/api/admin/corretores")
    if (res.ok) {
      const data = await res.json()
      setCorretores(data.corretores)
    }
    setLoading(false)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setMessage(null)

    const formData = new FormData()
    formData.append("file", file)

    const res = await fetch("/api/admin/corretores", {
      method: "POST",
      body: formData,
    })

    const data = await res.json()

    if (res.ok) {
      setMessage({
        type: "success",
        text: `Importacao concluida: ${data.adicionados} novos, ${data.existentes} ja existentes.`,
      })
      loadCorretores()
    } else {
      setMessage({ type: "error", text: data.error })
    }

    setUploading(false)
    if (fileRef.current) fileRef.current.value = ""
  }

  async function handleDownload() {
    const res = await fetch("/api/admin/corretores/download")
    if (!res.ok) return

    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `corretores-${new Date().toISOString().split("T")[0]}.xlsx`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Gerenciar Corretores</h1>
        <Badge variant="secondary" className="text-sm">
          {corretores.filter((c) => c.role === "corretor").length} corretores
        </Badge>
      </div>

      {/* Upload/Download */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Importar / Exportar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {message && (
            <Alert className={message.type === "success" ? "border-emerald-500 bg-emerald-50" : ""} variant={message.type === "error" ? "destructive" : "default"}>
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-3">
            <div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleUpload}
                className="hidden"
                id="excel-upload"
              />
              <Button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="bg-emerald-600 hover:bg-emerald-500"
              >
                {uploading ? "Importando..." : "Importar Excel"}
              </Button>
            </div>
            <Button variant="outline" onClick={handleDownload}>
              Baixar Excel
            </Button>
          </div>

          <p className="text-xs text-slate-500">
            A planilha deve conter colunas &quot;Nome&quot; e &quot;Creci&quot;. Corretores com CRECI ja cadastrado serao ignorados.
          </p>
        </CardContent>
      </Card>

      {/* Lista */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Corretores Cadastrados</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500 text-center py-8">Carregando...</p>
          ) : corretores.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">Nenhum corretor cadastrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-2 font-medium text-slate-600">#</th>
                    <th className="text-left py-3 px-2 font-medium text-slate-600">Nome</th>
                    <th className="text-left py-3 px-2 font-medium text-slate-600">CRECI</th>
                    <th className="text-left py-3 px-2 font-medium text-slate-600">Tipo</th>
                    <th className="text-left py-3 px-2 font-medium text-slate-600">Status</th>
                    <th className="text-left py-3 px-2 font-medium text-slate-600">Cadastro</th>
                  </tr>
                </thead>
                <tbody>
                  {corretores.map((c, i) => (
                    <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-2 text-slate-500">{i + 1}</td>
                      <td className="py-3 px-2 font-medium text-slate-900">{c.nome}</td>
                      <td className="py-3 px-2 text-slate-700">{c.creci}</td>
                      <td className="py-3 px-2">
                        <Badge className={c.role === "admin" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}>
                          {c.role === "admin" ? "Admin" : "Corretor"}
                        </Badge>
                      </td>
                      <td className="py-3 px-2">
                        <Badge className={c.ativo ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}>
                          {c.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-slate-500">
                        {new Date(c.created_at).toLocaleDateString("pt-BR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
