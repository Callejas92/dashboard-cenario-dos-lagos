"use client";

/**
 * KpiHero — KPI gigante da linha 1 do Panorama.
 *
 * Decisão crítica em 5 segundos: bati a meta? Stephen Few.
 * Cores semânticas apenas. Sem chartjunk. Mobile-first.
 *
 * Pode receber:
 *  - Sparkline embutido (tendência)
 *  - Barra de progresso (% de meta)
 *  - Comparação contextual ("vs semana anterior")
 */
import type { ReactNode } from "react";
import { cor, type Severidade } from "@/lib/utils/cores";
import TooltipDefinicao from "./TooltipDefinicao";
import Sparkline from "./Sparkline";

export interface KpiHeroProps {
  /** Rótulo curto, ex: "VSO ACUMULADO" */
  label: string;
  /** Valor principal exibido (já formatado). */
  valor: string;
  /** Severidade pra cor do valor (default: cinza). */
  severidade?: Severidade;
  /** Tooltip com fórmula. Obrigatório por princípio. */
  formula: string;
  /** Texto contextual abaixo do valor, ex: "vs meta 5%". */
  contexto?: string;
  /** Sparkline opcional (últimos N pontos). */
  sparkline?: number[];
  /** Barra de progresso opcional (0-1). */
  progresso?: number;
  /** Conteúdo extra customizado (ex: comparação vs semana anterior). */
  extra?: ReactNode;
}

export default function KpiHero({
  label,
  valor,
  severidade = "cinza",
  formula,
  contexto,
  sparkline,
  progresso,
  extra,
}: KpiHeroProps) {
  const c = cor(severidade);

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "0.75rem",
        padding: "1.25rem 1.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.625rem",
      }}
    >
      <div
        style={{
          fontSize: "0.7rem",
          color: "var(--text-dim)",
          fontWeight: 700,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        <TooltipDefinicao texto={formula}>
          <span>{label}</span>
        </TooltipDefinicao>
      </div>

      <div
        className="kpi-hero-value"
        style={{
          fontSize: "2.25rem",
          fontWeight: 700,
          color: c.value,
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
        }}
      >
        {valor}
      </div>

      {contexto && (
        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
          {contexto}
        </div>
      )}

      {progresso !== undefined && (
        <div
          style={{
            height: "6px",
            background: "var(--border)",
            borderRadius: "9999px",
            overflow: "hidden",
            marginTop: "0.125rem",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.min(100, Math.max(0, progresso * 100))}%`,
              background: c.value,
              transition: "width 0.4s ease",
            }}
          />
        </div>
      )}

      {sparkline && sparkline.length > 1 && (
        <div style={{ color: c.value, opacity: 0.7 }}>
          <Sparkline data={sparkline} width={120} height={28} />
        </div>
      )}

      {extra && <div>{extra}</div>}
    </div>
  );
}
