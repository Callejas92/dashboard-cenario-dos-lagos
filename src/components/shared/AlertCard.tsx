"use client";

/**
 * AlertCard — card de alerta condicional. Linha 5 do Panorama.
 *
 * Só aparece se a condição for verdadeira (ex: inadimplência alta,
 * corretor >40% concentração). Cores semânticas.
 */
import { AlertTriangle, AlertCircle, CheckCircle2 } from "lucide-react";
import { cor, type Severidade } from "@/lib/utils/cores";
import type { ReactNode } from "react";

export interface AlertCardProps {
  severidade: Severidade;
  titulo: string;
  descricao: ReactNode;
  acao?: { texto: string; onClick?: () => void; href?: string };
}

const ICONES: Record<Severidade, typeof AlertTriangle> = {
  vermelho: AlertCircle,
  amarelo: AlertTriangle,
  verde: CheckCircle2,
  cinza: AlertTriangle,
};

export default function AlertCard({ severidade, titulo, descricao, acao }: AlertCardProps) {
  const c = cor(severidade);
  const Icon = ICONES[severidade];

  return (
    <div
      role="status"
      style={{
        display: "flex",
        gap: "0.75rem",
        padding: "0.875rem 1rem",
        background: c.bg,
        borderLeft: `4px solid ${c.value}`,
        borderRadius: "0.5rem",
        alignItems: "flex-start",
      }}
    >
      <Icon size={16} style={{ color: c.value, flexShrink: 0, marginTop: "0.125rem" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: "0.85rem", color: c.value, marginBottom: "0.2rem" }}>
          {titulo}
        </div>
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
          {descricao}
        </div>
        {acao && (
          <div style={{ marginTop: "0.5rem" }}>
            {acao.href ? (
              <a
                href={acao.href}
                style={{ fontSize: "0.7rem", color: c.value, fontWeight: 600, textDecoration: "underline" }}
              >
                {acao.texto} →
              </a>
            ) : (
              <button
                onClick={acao.onClick}
                style={{
                  fontSize: "0.7rem", color: c.value, fontWeight: 600,
                  background: "transparent", border: 0, padding: 0, cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                {acao.texto} →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
