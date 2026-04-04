"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"

interface CheckinRelatorio {
  id: string
  distancia_metros: number
  status: string
  created_at: string
  corretor: { nome: string; creci: string } | null
  empreendimento: { nome: string } | null
}

export default function RelatoriosPage() {
  const [dataInicio, setDataInicio] = useState("")
  const [dataFim, setDataFim] = useState("")
  const [checkins, setCheckins] = useState<CheckinRelatorio[]>([])
  const [loading, setLoading] = useState(false)

  async function buscar() {
    setLoading(true)
    const params = new URLSearchParams()
    if (dataInicio) params.set("inicio", dataInicio)
    if (dataFim) params.set("fim", dataFim)

    const res = await fetch(`/api/admin/relatorios?${params}`)
    if (res.ok) {
      const data = await res.json()
      setCheckins(data.checkins || [])
    }
    setLoading(false)
  }

  function exportarCSV() {
    if (checkins.length === 0) return

    const header = "Corretor,CRECI,Empreendimento,Data,Hora,Distancia(m),Status\n"
    const rows = checkins.map((c) => {
      const date = new Date(c.created_at)
      return [
        c.corretor?.nome || "-",
        c.corretor?.creci || "-",
        c.empreendimento?.nome || "-",
        date.toLocaleDateString("pt-BR"),
        date.toLocaleTimeString("pt-BR"),
        c.distancia_metros,
        c.status,
      ].join(",")
    })

    const csv = header + rows.join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `relatorio-checkins-${new Date().toISOString().split("T")[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Relatorios</h1>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-2">
              <Label>Data Inicio</Label>
              <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Data Fim</Label>
              <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
            </div>
            <Button onClick={buscar} disabled={loading} className="bg-emerald-600 hover:bg-emerald-500">
              {loading ? "Buscando..." : "Buscar"}
            </Button>
            {checkins.length > 0 && (
              <Button variant="outline" onClick={exportarCSV}>Exportar CSV</Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">
            Resultados{" "}
            {checkins.length > 0 && <Badge variant="secondary" className="ml-2">{checkins.length} registros</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {checkins.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">Use os filtros acima para buscar check-ins.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-2 font-medium text-slate-600">Corretor</th>
                    <th className="text-left py-3 px-2 font-medium text-slate-600">CRECI</th>
                    <th className="text-left py-3 px-2 font-medium text-slate-600">Data</th>
                    <th className="text-left py-3 px-2 font-medium text-slate-600">Hora</th>
                    <th className="text-left py-3 px-2 font-medium text-slate-600">Distancia</th>
                    <th className="text-left py-3 px-2 font-medium text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {checkins.map((c) => {
                    const date = new Date(c.created_at)
                    return (
                      <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-2 font-medium text-slate-900">{c.corretor?.nome || "-"}</td>
                        <td className="py-3 px-2 text-slate-700">{c.corretor?.creci || "-"}</td>
                        <td className="py-3 px-2 text-slate-700">{date.toLocaleDateString("pt-BR")}</td>
                        <td className="py-3 px-2 text-slate-700">{date.toLocaleTimeString("pt-BR")}</td>
                        <td className="py-3 px-2 text-slate-700">{c.distancia_metros}m</td>
                        <td className="py-3 px-2">
                          <Badge className={c.status === "valido" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}>
                            {c.status === "valido" ? "Valido" : "Rejeitado"}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
