"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"

export function DashboardNav({
  userName,
  userRole,
}: {
  userName: string
  userRole: string
}) {
  const pathname = usePathname()
  const isAdmin = userRole === "admin"

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" })
    window.location.href = "/login"
  }

  const navLink = (href: string, label: string) => {
    const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href))
    return (
      <Link
        href={href}
        className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
        style={{
          background: active ? "rgba(200,150,60,0.15)" : "transparent",
          color: active ? "#c8963c" : "rgba(255,255,255,0.6)",
        }}
      >
        {label}
      </Link>
    )
  }

  return (
    <header className="sticky top-0 z-50 border-b"
      style={{
        background: "rgba(10,26,15,0.95)",
        borderColor: "rgba(200,150,60,0.15)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-5">
          <Link href="/dashboard">
            <div className="relative w-32 h-8">
              <Image
                src="/logo-cenario.png"
                alt="Cenario dos Lagos"
                fill
                className="object-contain object-left"
              />
            </div>
          </Link>

          <nav className="hidden sm:flex items-center gap-1">
            {navLink("/dashboard", "Check-in")}
            {isAdmin && navLink("/admin", "Painel")}
            {isAdmin && navLink("/admin/corretores", "Corretores")}
            {isAdmin && navLink("/admin/relatorios", "Relatorios")}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-white leading-tight">{userName}</p>
            <p className="text-[11px]" style={{ color: isAdmin ? "#c8963c" : "rgba(255,255,255,0.4)" }}>
              {isAdmin ? "Administrador" : "Corretor"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="h-8 w-8 p-0 rounded-lg hover:bg-red-500/10 hover:text-red-400"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </Button>
        </div>
      </div>

      {/* Nav mobile */}
      {isAdmin && (
        <div className="sm:hidden flex gap-1 px-4 pb-2 overflow-x-auto">
          {navLink("/dashboard", "Check-in")}
          {navLink("/admin", "Painel")}
          {navLink("/admin/corretores", "Corretores")}
          {navLink("/admin/relatorios", "Relatorios")}
        </div>
      )}
    </header>
  )
}
