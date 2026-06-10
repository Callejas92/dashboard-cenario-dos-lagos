/**
 * Root page — redireciona para o Panorama (V2).
 * A V1 (/legacy + componentes _deprecated) foi removida em 10/06/2026 (Fase 4),
 * após ~1 mês de V2 estável em produção.
 */
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/panorama");
}
