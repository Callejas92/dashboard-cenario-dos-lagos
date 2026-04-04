"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { Empreendimento, Checkin } from "@/types"

export default function DashboardPage() {
  const [loading, setLoading] = useState(false)
  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [result, setResult] = useState<{
    success: boolean
    mensagem: string
    distancia?: number
  } | null>(null)
  const [empreendimento, setEmpreendimento] = useState<Empreendimento | null>(null)
  const [historico, setHistorico] = useState<Checkin[]>([])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const res = await fetch("/api/dashboard")
    if (res.ok) {
      const data = await res.json()
      if (data.empreendimento) setEmpreendimento(data.empreendimento)
      if (data.historico) setHistorico(data.historico)
    }
  }

  async function handleCheckin() {
    if (!empreendimento) return
    setLoading(true)
    setGeoStatus("loading")
    setResult(null)

    if (!navigator.geolocation) {
      setGeoStatus("error")
      setResult({ success: false, mensagem: "Geolocalizacao nao suportada neste navegador." })
      setLoading(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setGeoStatus("success")
        const response = await fetch("/api/checkin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            empreendimento_id: empreendimento.id,
            platform: navigator.userAgent,
          }),
        })
        const data = await response.json()
        setResult({
          success: response.ok && data.status === "valido",
          mensagem: data.mensagem || data.error,
          distancia: data.distancia,
        })
        loadData()
        setLoading(false)
      },
      (error) => {
        setGeoStatus("error")
        let msg = "Erro ao obter localizacao."
        if (error.code === 1) msg = "Permissao de localizacao negada. Ative o GPS e permita o acesso."
        if (error.code === 2) msg = "Localizacao indisponivel. Verifique seu GPS."
        if (error.code === 3) msg = "Tempo esgotado. Tente novamente."
        setResult({ success: false, mensagem: msg })
        setLoading(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }

  return (
    <div className="space-y-5 max-w-lg mx-auto">
      {/* Card principal de check-in */}
      <div className="rounded-2xl overflow-hidden shadow-xl"
        style={{ background: "linear-gradient(160deg, #0a1a0f 0%, #0f2016 60%, #0d1c10 100%)" }}
      >
        {/* Topo decorativo */}
        <div className="relative px-6 pt-6 pb-4">
          <div className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-10"
            style={{ background: "radial-gradient(circle, #c8963c, transparent)", transform: "translate(30%, -30%)" }}
          />
          <p className="text-xs tracking-widest uppercase font-medium mb-1"
            style={{ color: "rgba(200,150,60,0.7)" }}>
            Empreendimento
          </p>
          <h2 className="text-xl font-semibold text-white leading-tight">
            {empreendimento?.nome || "Carregando..."}
          </h2>
          {empreendimento && (
            <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
              {empreendimento.endereco} &bull; Raio: {empreendimento.raio_metros}m
            </p>
          )}
        </div>

        {/* Botao */}
        <div className="px-6 pb-6">
          <button
            onClick={handleCheckin}
            disabled={loading || !empreendimento}
            className="w-full h-14 rounded-xl font-semibold text-base transition-all active:scale-[0.97] disabled:opacity-50 flex items-center justify-center gap-2.5"
            style={{
              background: loading
                ? "rgba(200,150,60,0.4)"
                : "linear-gradient(135deg, #c8963c 0%, #a87830 100%)",
              color: "#fff",
              boxShadow: loading ? "none" : "0 4px 24px rgba(200,150,60,0.35)",
            }}
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {geoStatus === "loading" ? "Obtendo localizacao..." : "Validando..."}
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Registrar Visita
              </>
            )}
          </button>
        </div>
      </div>

      {/* Resultado */}
      {result && (
        <div className={`rounded-2xl p-4 flex items-start gap-3 border ${
          result.success
            ? "bg-emerald-50 border-emerald-200"
            : "bg-red-50 border-red-200"
        }`}>
          <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
            result.success ? "bg-emerald-100" : "bg-red-100"
          }`}>
            {result.success ? (
              <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>
          <div>
            <p className={`text-sm font-semibold ${result.success ? "text-emerald-800" : "text-red-700"}`}>
              {result.success ? "Check-in registrado!" : "Nao foi possivel registrar"}
            </p>
            <p className={`text-sm mt-0.5 ${result.success ? "text-emerald-700" : "text-red-600"}`}>
              {result.mensagem}
            </p>
            {result.distancia !== undefined && (
              <p className="text-xs mt-1 text-slate-500">Distancia: {result.distancia}m</p>
            )}
          </div>
        </div>
      )}

      {/* Historico */}
      <div className="rounded-2xl bg-white border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Historico de Visitas</h3>
          {historico.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
              {historico.length}
            </span>
          )}
        </div>
        {historico.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-sm text-slate-400">Nenhuma visita registrada ainda</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {historico.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {new Date(item.created_at).toLocaleDateString("pt-BR", {
                      day: "2-digit", month: "short", year: "numeric",
                    })}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {new Date(item.created_at).toLocaleTimeString("pt-BR", {
                      hour: "2-digit", minute: "2-digit",
                    })} &bull; {item.distancia_metros}m do empreendimento
                  </p>
                </div>
                <Badge className={`text-xs px-2.5 py-0.5 rounded-full font-medium border-0 ${
                  item.status === "valido"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-red-100 text-red-600"
                }`}>
                  {item.status === "valido" ? "Valido" : "Rejeitado"}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
