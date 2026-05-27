/**
 * Root page — respeita o feature flag NEXT_PUBLIC_DASHBOARD_V2.
 *
 * - V2 = "true"  → redireciona para /panorama (nova arquitetura, em construção)
 * - V2 = "false" → renderiza a versão antiga (legacy/page.tsx) inline
 *
 * Durante o redesign v2:
 *  - `master` continua deployando a v1 (flag false em produção)
 *  - Branch `redesign-v2` constrói /panorama, /pipeline, /marketing, /admin
 *  - Quando ficar pronto: setar flag true em produção
 *  - Versão antiga sempre acessível em /legacy
 */
import { redirect } from "next/navigation";
import LegacyPage from "./legacy/page";

const V2_ENABLED = process.env.NEXT_PUBLIC_DASHBOARD_V2 === "true";

export default function RootPage() {
  if (V2_ENABLED) {
    redirect("/panorama");
  }
  return <LegacyPage />;
}
