"use client";

import { Info } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Tooltip de definição. Abre no CLIQUE/TOQUE (funciona no celular, ao contrário de hover) e
 * fecha ao tocar fora. No desktop o hover também abre, como atalho.
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
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!show) return;
    const fechar = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShow(false);
    };
    document.addEventListener("mousedown", fechar);
    document.addEventListener("touchstart", fechar);
    return () => {
      document.removeEventListener("mousedown", fechar);
      document.removeEventListener("touchstart", fechar);
    };
  }, [show]);

  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
      {children}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setShow((s) => !s); }}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        aria-label="O que é isto?"
        aria-expanded={show}
        style={{
          display: "inline-flex",
          alignItems: "center",
          color: "var(--text-dim)",
          padding: "2px",
          margin: "-2px",
          background: "transparent",
          border: 0,
          cursor: "pointer",
        }}
      >
        <Info size={13} />
      </button>
      {show && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: 0,
            zIndex: 50,
            padding: "0.6rem 0.8rem",
            background: "var(--tooltip-bg, #1f2937)",
            color: "var(--tooltip-text, #f9fafb)",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
            fontSize: "0.74rem",
            fontWeight: 400,
            lineHeight: 1.5,
            whiteSpace: "pre-line",
            minWidth: "220px",
            maxWidth: "300px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
          }}
        >
          {texto}
        </span>
      )}
    </span>
  );
}
