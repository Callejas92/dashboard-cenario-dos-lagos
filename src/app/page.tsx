/**
 * Root page — V2 é o padrão (redesign concluído e aprovado em Mai/2026).
 *
 * - Padrão (sem env var): redireciona para /panorama (V2)
 * - NEXT_PUBLIC_DASHBOARD_V2 = "false": força a versão antiga (escape hatch)
 * - Versão antiga sempre acessível em /legacy, independente da flag
 */
import { redirect } from "next/navigation";
import LegacyPage from "./legacy/page";

// V2 ligado por padrão. Só cai no legacy se a flag for explicitamente "false".
const V2_ENABLED = process.env.NEXT_PUBLIC_DASHBOARD_V2 !== "false";

export default function RootPage() {
  if (V2_ENABLED) {
    redirect("/panorama");
  }
  return <LegacyPage />;
}
