"use client";

/**
 * InsightCard — card de "curiosidade" automática (Linha 6 do Panorama).
 *
 * Atualiza diariamente via regras de negócio em lib/insights/.
 * Visual neutro (cinza com ícone), texto curto, sem CTA — só observação.
 */
import type { LucideIcon } from "lucide-react";
import { Lightbulb } from "lucide-react";
import { cor, type Severidade } from "@/lib/utils/cores";

export interface InsightCardProps {
  titulo: string;
  texto: string;
  severidade?: Severidade;
  icon?: LucideIcon;
}

export default function InsightCard({
  titulo,
  texto,
  severidade = "cinza",
  icon: Icon = Lightbulb,
}: InsightCardProps) {
  const c = cor(severidade);

  return (
    <div
      style={{
        padding: "0.875rem 1rem",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "0.5rem",
        display: "flex",
        gap: "0.625rem",
        alignItems: "flex-start",
      }}
    >
      <Icon size={14} style={{ color: c.value, flexShrink: 0, marginTop: "0.15rem" }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: "0.75rem", color: "var(--text)", marginBottom: "0.2rem" }}>
          {titulo}
        </div>
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.45 }}>
          {texto}
        </div>
      </div>
    </div>
  );
}
