import { verifySession } from "@/lib/auth"
import { createServiceSupabase } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"

export default async function AdminPage() {
  const session = await verifySession()
  if (!session) redirect("/login")
  if (session.role !== "admin") redirect("/dashboard")

  const supabase = await createServiceSupabase()
  const today = new Date().toISOString().split("T")[0]
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0]

  const [checkinsHoje, checkinsSemana, totalCorretores] = await Promise.all([
    supabase.from("checkins").select("id", { count: "exact", head: true }).eq("status", "valido").gte("created_at", today),
    supabase.from("checkins").select("id", { count: "exact", head: true }).eq("status", "valido").gte("created_at", weekAgo),
    supabase.from("corretores").select("id", { count: "exact", head: true }).eq("role", "corretor").eq("ativo", true),
  ])

  const { data: ultimosCheckins } = await supabase
    .from("checkins")
    .select("*, corretor:corretores(nome, creci)")
    .eq("status", "valido")
    .order("created_at", { ascending: false })
    .limit(10)

  const stats = [
    { label: "Hoje", value: checkinsHoje.count || 0, sub: "check-ins validos", color: "#c8963c" },
    { label: "Semana", value: checkinsSemana.count || 0, sub: "check-ins validos", color: "#2d6a3f" },
    { label: "Ativos", value: totalCorretores.count || 0, sub: "corretores", color: "#3d5a8a" },
  ]

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Painel</h1>
        <Link href="/admin/relatorios"
          className="text-sm font-medium transition-colors"
          style={{ color: "#c8963c" }}>
          Relatorios completos &rarr;
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl bg-white border border-slate-200/80 shadow-sm p-4">
            <p className="text-3xl font-bold text-slate-900">{s.value}</p>
            <p className="text-xs font-semibold mt-1" style={{ color: s.color }}>{s.label}</p>
            <p className="text-xs text-slate-400">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Ultimos check-ins */}
      <div className="rounded-2xl bg-white border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Ultimas Visitas</h2>
          <Link href="/admin/relatorios"
            className="text-xs font-medium"
            style={{ color: "#c8963c" }}>
            Ver todos
          </Link>
        </div>

        {!ultimosCheckins || ultimosCheckins.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-slate-400">Nenhum check-in registrado ainda.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {ultimosCheckins.map((checkin) => {
              const corretor = checkin.corretor as { nome: string; creci: string } | null
              return (
                <div key={checkin.id} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{corretor?.nome || "Corretor"}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      CRECI {corretor?.creci} &bull;{" "}
                      {new Date(checkin.created_at).toLocaleDateString("pt-BR", {
                        day: "2-digit", month: "short",
                      })}{" "}
                      {new Date(checkin.created_at).toLocaleTimeString("pt-BR", {
                        hour: "2-digit", minute: "2-digit",
                      })}
                      {" "}&bull; {checkin.distancia_metros}m
                    </p>
                  </div>
                  <Badge className="text-xs px-2.5 py-0.5 rounded-full font-medium border-0 bg-emerald-100 text-emerald-700">
                    Valido
                  </Badge>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Atalhos */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/admin/corretores"
          className="rounded-2xl bg-white border border-slate-200/80 shadow-sm p-4 flex items-center gap-3 hover:border-amber-200 transition-colors group">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(200,150,60,0.1)" }}>
            <svg className="w-4 h-4" style={{ color: "#c8963c" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Corretores</p>
            <p className="text-xs text-slate-400">Gerenciar lista</p>
          </div>
        </Link>

        <Link href="/admin/relatorios"
          className="rounded-2xl bg-white border border-slate-200/80 shadow-sm p-4 flex items-center gap-3 hover:border-amber-200 transition-colors group">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(45,106,63,0.1)" }}>
            <svg className="w-4 h-4" style={{ color: "#2d6a3f" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Relatorios</p>
            <p className="text-xs text-slate-400">Exportar dados</p>
          </div>
        </Link>
      </div>
    </div>
  )
}
