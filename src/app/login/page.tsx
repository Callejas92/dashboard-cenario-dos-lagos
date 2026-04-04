"use client"

import { useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"

export default function LoginPage() {
  const [nome, setNome] = useState("")
  const [creci, setCreci] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [mode, setMode] = useState<"login" | "cadastro">("login")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    if (!nome.trim() || !creci.trim()) {
      setError("Preencha seu nome e CRECI.")
      setLoading(false)
      return
    }

    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register"
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: nome.trim(), creci: creci.trim() }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error)
      setLoading(false)
      return
    }

    window.location.href = "/dashboard"
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden px-4"
      style={{ background: "linear-gradient(160deg, #0a1a0f 0%, #0f1f14 40%, #111a0d 100%)" }}
    >
      {/* Textura sutil de fundo */}
      <div className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: "radial-gradient(circle at 20% 50%, #c8963c 0%, transparent 50%), radial-gradient(circle at 80% 20%, #2d6a3f 0%, transparent 50%)",
        }}
      />

      <div className="relative w-full max-w-sm space-y-8">
        {/* Logo Cenario dos Lagos */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-52 h-28">
            <Image
              src="/logo-cenario.png"
              alt="Cenario dos Lagos"
              fill
              className="object-contain"
              priority
            />
          </div>
          <div className="text-center">
            <p className="text-xs tracking-[0.3em] uppercase font-light"
              style={{ color: "#c8963c" }}>
              Sistema de Check-in
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border p-6 space-y-5 shadow-2xl"
          style={{
            background: "rgba(255,255,255,0.04)",
            borderColor: "rgba(200,150,60,0.2)",
            backdropFilter: "blur(20px)",
          }}
        >
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-white">
              {mode === "login" ? "Bem-vindo de volta" : "Primeiro acesso"}
            </h2>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
              {mode === "login"
                ? "Entre com seu nome e CRECI"
                : "Preencha seus dados para se cadastrar"}
            </p>
          </div>

          {error && (
            <Alert className="border-red-500/30 bg-red-500/10 rounded-xl">
              <AlertDescription className="text-red-300 text-sm">{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nome" className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>
                Nome completo
              </Label>
              <Input
                id="nome"
                type="text"
                placeholder="Seu nome e sobrenome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
                autoComplete="name"
                className="h-11 rounded-xl border text-white placeholder:text-white/25 focus-visible:ring-1 focus-visible:ring-offset-0"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  borderColor: "rgba(255,255,255,0.12)",
                }}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="creci" className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>
                CRECI
              </Label>
              <Input
                id="creci"
                type="text"
                inputMode="numeric"
                placeholder="Somente numeros"
                value={creci}
                onChange={(e) => setCreci(e.target.value.replace(/\D/g, ""))}
                required
                className="h-11 rounded-xl border text-white placeholder:text-white/25 focus-visible:ring-1 focus-visible:ring-offset-0"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  borderColor: "rgba(255,255,255,0.12)",
                }}
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl font-semibold text-sm border-0 transition-all hover:opacity-90 active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg, #c8963c 0%, #a87830 100%)",
                color: "#fff",
                boxShadow: "0 4px 20px rgba(200,150,60,0.3)",
              }}
            >
              {loading
                ? mode === "login" ? "Entrando..." : "Cadastrando..."
                : mode === "login" ? "Entrar" : "Criar cadastro"}
            </Button>
          </form>

          <div className="pt-1 text-center">
            <button
              type="button"
              onClick={() => { setMode(mode === "login" ? "cadastro" : "login"); setError("") }}
              className="text-sm transition-colors hover:opacity-100"
              style={{ color: "#c8963c", opacity: 0.8 }}
            >
              {mode === "login"
                ? "Primeiro acesso? Cadastre-se aqui"
                : "Ja tenho cadastro — Entrar"}
            </button>
          </div>
        </div>

        {/* Logo Mangaba */}
        <div className="flex justify-center pt-2 opacity-40">
          <div className="relative w-28 h-10">
            <Image
              src="/logo-mangaba.png"
              alt="Mangaba Urbanismo"
              fill
              className="object-contain"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
