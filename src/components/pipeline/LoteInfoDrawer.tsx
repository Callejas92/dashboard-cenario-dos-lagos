"use client";

/**
 * Drawer leve pra um lote do Estoque (disponível / em venda / fora de venda).
 * Pra lotes VENDIDOS, o SubTabEstoque abre o ContratoDrawer completo em vez deste.
 * Click no fundo OU ESC fecha.
 */
import { useEffect } from "react";
import { X, MapPin, Ruler, Tag, DollarSign } from "lucide-react";
import { formatBRL } from "@/lib/utils/formatters";

export interface LoteInfo {
  identificador: string;
  quadra: string;
  lote: string;
  status: string;
  area: number;
  valorTotal: number;
  valorM2?: number;
  classificacao: string;
  rua?: string;
}

const COR_STATUS: Record<string, string> = {
  vendido: "#10b981",
  emVenda: "#f59e0b",
  disponivel: "#4285f4",
  foraDeVenda: "#6b7280",
};

function classify(status: string): "vendido" | "emVenda" | "disponivel" | "foraDeVenda" {
  const s = (status || "").toLowerCase();
  if (s.includes("vendid") || s.includes("contrato")) return "vendido";
  if (s.includes("reservad") || s.includes("pré-venda") || s.includes("pre-venda") || s.includes("em venda")) return "emVenda";
  if (s.includes("bloquead") || s.includes("fora")) return "foraDeVenda";
  return "disponivel";
}

export default function LoteInfoDrawer({
  lote,
  onClose,
}: {
  lote: LoteInfo | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!lote) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lote, onClose]);

  if (!lote) return null;

  const cor = COR_STATUS[classify(lote.status)];
  const valorM2 = lote.valorM2 && lote.valorM2 > 0
    ? lote.valorM2
    : (lote.area > 0 && lote.valorTotal > 0 ? lote.valorTotal / lote.area : 0);

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9998, animation: "fadein 0.15s ease" }}
      />
      <aside
        role="dialog"
        aria-label="Detalhe do lote"
        className="drawer-mobile"
        style={{
          position: "fixed", right: 0, top: 0, bottom: 0,
          width: "100%", maxWidth: "400px",
          background: "var(--bg-secondary, #ffffff)",
          borderLeft: "1px solid var(--border)",
          zIndex: 9999, overflowY: "auto",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.35)",
          animation: "slidein 0.2s ease",
          paddingBottom: "env(safe-area-inset-bottom, 0)",
        }}
      >
        {/* Header */}
        <div style={{
          position: "sticky", top: 0, background: "var(--bg-secondary, #ffffff)",
          borderBottom: "1px solid var(--border)", padding: "0.75rem 1rem",
          display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 1,
        }}>
          <div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Lote
            </div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text)" }}>
              {lote.identificador}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            style={{ padding: "0.4rem", background: "transparent", border: 0, color: "var(--text-muted)", cursor: "pointer", borderRadius: "0.375rem" }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Valor */}
          <div style={{ padding: "0.875rem 1rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.5rem" }}>
            <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <DollarSign size={11} /> Valor (preço atual CRM)
            </div>
            <div className="tnum" style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text)" }}>{formatBRL(lote.valorTotal)}</div>
            {valorM2 > 0 && (
              <div className="tnum" style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                {formatBRL(valorM2)}/m²
              </div>
            )}
            <div style={{ marginTop: "0.5rem" }}>
              <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.6rem", background: cor + "15", color: cor, borderRadius: "9999px" }}>
                {lote.status}
              </span>
            </div>
          </div>

          {/* Características */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <Linha icon={<Ruler size={13} />} label="Área" valor={`${lote.area.toFixed(0)} m²`} />
            <Linha icon={<Tag size={13} />} label="Classificação" valor={lote.classificacao || "—"} />
            <Linha icon={<MapPin size={13} />} label="Quadra" valor={lote.quadra} />
            {lote.rua && <Linha icon={<MapPin size={13} />} label="Rua" valor={lote.rua} />}
          </div>
        </div>
      </aside>

      <style jsx global>{`
        @keyframes fadein { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slidein { from { transform: translateX(100%) } to { transform: translateX(0) } }
      `}</style>
    </>
  );
}

function Linha({ icon, label, valor }: { icon: React.ReactNode; label: string; valor: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem" }}>
      <span style={{ color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
        {icon} {label}
      </span>
      <span style={{ color: "var(--text)", fontWeight: 600 }}>{valor}</span>
    </div>
  );
}
