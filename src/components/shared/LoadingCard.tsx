"use client";

/**
 * Loading card explícito: mostra "Carregando..." em vez de skeleton silencioso.
 *
 * Quando endpoints UAU demoram (cold start 10-40s), usuário não consegue
 * distinguir "está carregando" de "veio zero". Esse componente deixa explícito.
 */
import { Loader2 } from "lucide-react";

export default function LoadingCard({
  label = "Carregando dados…",
  hint,
  height = 100,
}: {
  label?: string;
  hint?: string;
  height?: number | string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
        height,
        padding: "1rem",
        background: "var(--surface)",
        border: "1px dashed var(--border)",
        borderRadius: "0.75rem",
      }}
    >
      <Loader2
        size={20}
        style={{
          color: "var(--text-dim)",
          animation: "spin 1.2s linear infinite",
        }}
      />
      <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-muted)" }}>{label}</div>
      {hint && (
        <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", textAlign: "center", maxWidth: "260px" }}>
          {hint}
        </div>
      )}

      <style jsx global>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
