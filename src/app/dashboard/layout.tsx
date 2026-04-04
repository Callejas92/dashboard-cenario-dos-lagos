import { verifySession } from "@/lib/auth"
import { redirect } from "next/navigation"
import { DashboardNav } from "@/components/dashboard-nav"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await verifySession()
  if (!session) redirect("/login")

  return (
    <div className="min-h-screen" style={{ background: "#f5f3ef" }}>
      <DashboardNav userName={session.nome} userRole={session.role} />
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  )
}
