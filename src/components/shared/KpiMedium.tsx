"use client";

/**
 * KpiMedium — KPI tamanho intermediário (linha 4 do Panorama: saúde do MKT).
 *
 * 4 ou mais em grid, valor ~1.5rem, contexto e sparkline opcionais.
 */
import type { ReactNode } from "react";
import { cor, type Severidade } from "@/lib/utils/cores";
import TooltipDefinicao from "./TooltipDefinicao";
import Sparkline from "./Sparkline";

export interface KpiMediumProps {
  label: string;
  valor: string;
  severidade?: Severidade;
  formula: string;
  contexto?: string;
  secundario?: string;
  sparkline?: number[];
  icon?: ReactNode;
}

export default function KpiMedium({
  label,
  valor,
  severidade = "cinza",
  formula,
  contexto,
  secundario,
  sparkline,
  icon,
}: KpiMediumProps) {
  const c = cor(severidade);

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "0.5rem",
        padding: "0.875rem 1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.375rem",
      }}
    >
      <div
        style={{
          fontSize: "0.65rem",
          color: "var(--text-dim)",
          fontWeight: 600,
          letterSpacing: "0.03em",
          textTransform: "uppercase",
          display: "flex",
          alignItems: "center",
          gap: "0.25rem",
        }}
      >
        {icon}
        <TooltipDefinicao texto={formula}>
          <span>{label}</span>
        </TooltipDefinicao>
      </div>

      <div className="kpi-medium-value" style={{ fontSize: "1.5rem", fontWeight: 700, color: c.value, lineHeight: 1.1 }}>
        {valor}
      </div>

      {contexto && (
        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
          {contexto}
        </div>
      )}

      {secundario && (
        <div style={{ fontSize: "0.68rem", color: "var(--text-dim)", fontWeight: 600 }}>
          {secundario}
        </div>
      )}

      {sparkline && sparkline.length > 1 && (
        <div style={{ color: c.value, opacity: 0.6 }}>
          <Sparkline data={sparkline} width={90} height={20} />
        </div>
      )}
    </div>
  );
}
