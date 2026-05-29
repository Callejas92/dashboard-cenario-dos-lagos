"use client";

import { Info } from "lucide-react";
import { useState, type ReactNode } from "react";

/**
 * Tooltip com fórmula matemática. Padrão Knaflic — todo KPI tem definição.
 *
 * Uso:
 *   <TooltipDefinicao texto="VSO = vendidos / (vendidos + disponivel)">
 *     <span>VSO</span>
 *   </TooltipDefinicao>
 */
export default function TooltipDefinicao({
  texto,
  children,
}: {
  texto: string;
  children: ReactNode;
}) {
  const [show, setShow] = useState(false);

  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
      {children}
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        aria-label="Definição"
        style={{
          display: "inline-flex",
          alignItems: "center",
          color: "var(--text-dim)",
          padding: 0,
          background: "transparent",
          border: 0,
          cursor: "help",
        }}
      >
        <Info size={11} />
      </button>
      {show && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: 0,
            zIndex: 50,
            padding: "0.5rem 0.75rem",
            background: "var(--tooltip-bg, #1f2937)",
            color: "var(--tooltip-text, #f9fafb)",
            border: "1px solid var(--border)",
            borderRadius: "0.375rem",
            fontSize: "0.7rem",
            fontWeight: 400,
            lineHeight: 1.4,
            whiteSpace: "normal",
            minWidth: "200px",
            maxWidth: "300px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          {texto}
        </span>
      )}
    </span>
  );
}
