"use client";

/**
 * KpiSmall — KPI compacto pra tabelas, listas, contextos densos.
 *
 * Valor ~1rem, sem sparkline, sem progresso. Densidade > decoração.
 */
import type { ReactNode } from "react";
import { cor, type Severidade } from "@/lib/utils/cores";
import TooltipDefinicao from "./TooltipDefinicao";

export interface KpiSmallProps {
  label: string;
  valor: string;
  severidade?: Severidade;
  formula?: string;
  contexto?: string;
  icon?: ReactNode;
}

export default function KpiSmall({
  label,
  valor,
  severidade = "cinza",
  formula,
  contexto,
  icon,
}: KpiSmallProps) {
  const c = cor(severidade);
  const labelEl = (
    <span style={{ fontSize: "0.65rem", color: "var(--text-dim)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em" }}>
      {label}
    </span>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
        {icon}
        {formula ? <TooltipDefinicao texto={formula}>{labelEl}</TooltipDefinicao> : labelEl}
      </div>
      <div className="kpi-small-value" style={{ fontSize: "1rem", fontWeight: 700, color: c.value, lineHeight: 1.1 }}>
        {valor}
      </div>
      {contexto && (
        <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
          {contexto}
        </div>
      )}
    </div>
  );
}
