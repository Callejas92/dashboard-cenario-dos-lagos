"use client";

import { useState, useEffect } from "react";
import { RefreshCw, Activity } from "lucide-react";

interface UnidadesData {
  configured: boolean;
  error?: string;
  empreendimento?: { nome?: string };
  total: number;
  statusCounts: Record<string, number>;
  investidor?: { total: number; statusCounts: Record<string, number> };
  statusCountsTotal?: Record<string, number>;
  fetchedAt?: string;
}

const STATUS_ORDER = ["LIBERADA", "RESERVADA", "PRÉ-VENDA", "VENDIDA", "CONTRATO", "BLOQUEADA"];

const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: string }> = {
  LIBERADA:    { color: "#10b981", bg: "#10b98115", icon: "🟢" },
  RESERVADA:   { color: "#f59e0b", bg: "#f59e0b15", icon: "🔺" },
  "PRÉ-VENDA": { color: "#ec4899", bg: "#ec489915", icon: "💗" },
  VENDIDA:     { color: "#e94560", bg: "#e9456015", icon: "🔴" },
  CONTRATO:    { color: "#f97316", bg: "#f9731615", icon: "🟠" },
  BLOQUEADA:   { color: "#6b7280", bg: "#6b728015", icon: "⬛" },
};

export default function CrmStatusPanel() {
  const [data, setData] = useState<UnidadesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInvestidor, setShowInvestidor] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/crm/unidades");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading && !data) {
    return (
      <div style={{
        background: "var(--card-bg)", border: "1px solid var(--border)",
        borderRadius: "1rem", padding: "1.25rem",
        display: "flex", alignItems: "center", gap: "0.5rem",
      }}>
        <RefreshCw size={16} className="animate-spin" />
        <span style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Carregando status do CRM...</span>
      </div>
    );
  }

  if (!data || !data.configured || data.error) {
    return null;
  }

  const counts = showInvestidor ? (data.statusCountsTotal || data.statusCounts) : data.statusCounts;
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const investidorTotal = data.investidor?.total || 0;

  return (
    <div style={{
      background: "var(--card-bg)", border: "1px solid var(--border)",
      borderRadius: "1rem", padding: "1.25rem",
    }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Activity size={16} style={{ color: "#10b981" }} />
          <h3 className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>
            STATUS REALTIME — CRM EGGS
          </h3>
          <span style={{
            fontSize: "0.65rem", padding: "0.125rem 0.5rem",
            background: "#10b98115", color: "#10b981",
            borderRadius: "0.375rem", fontWeight: 600,
          }}>
            ao vivo
          </span>
        </div>
        <div className="flex items-center gap-2">
          {investidorTotal > 0 && (
            <button
              onClick={() => setShowInvestidor((v) => !v)}
              style={{
                padding: "0.25rem 0.75rem", fontSize: "0.7rem", fontWeight: 600,
                borderRadius: "0.375rem",
                background: showInvestidor ? "#8b5cf6" : "var(--surface)",
                color: showInvestidor ? "#fff" : "var(--text-muted)",
                border: "1px solid var(--border)", cursor: "pointer",
              }}
              title={showInvestidor ? "Ocultar lotes do investidor" : "Incluir lotes do investidor"}
            >
              {showInvestidor ? `+ ${investidorTotal} investidor` : `Excluindo investidor`}
            </button>
          )}
          <button
            onClick={fetchData}
            disabled={loading}
            style={{
              padding: "0.25rem", borderRadius: "0.375rem",
              background: "var(--surface)", border: "1px solid var(--border)",
              cursor: loading ? "not-allowed" : "pointer", color: "var(--text-dim)",
            }}
            title="Recarregar"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Cards de status */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
        {STATUS_ORDER.map((status) => {
          const cfg = STATUS_CONFIG[status];
          const count = counts[status] || 0;
          const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0";
          return (
            <div
              key={status}
              style={{
                padding: "0.75rem", borderRadius: "0.5rem",
                background: cfg.bg, border: `1px solid ${cfg.color}30`,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "0.65rem", fontWeight: 700, color: cfg.color, marginBottom: "0.25rem" }}>
                {status}
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text)" }}>
                {count}
              </div>
              <div style={{ fontSize: "0.65rem", color: "var(--text-dim)" }}>
                {pct}%
              </div>
            </div>
          );
        })}
        {/* Card de TOTAL */}
        <div
          style={{
            padding: "0.75rem", borderRadius: "0.5rem",
            background: "var(--surface)", border: "1px solid var(--border)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "0.25rem" }}>
            TOTAL
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text)" }}>
            {total}
          </div>
          <div style={{ fontSize: "0.65rem", color: "var(--text-dim)" }}>
            {showInvestidor ? "geral" : "real"}
          </div>
        </div>
      </div>

      {/* Footer info */}
      {investidorTotal > 0 && (
        <div style={{
          marginTop: "0.75rem", padding: "0.5rem 0.75rem",
          background: "var(--surface)", borderRadius: "0.375rem",
          fontSize: "0.7rem", color: "var(--text-dim)",
        }}>
          ℹ️ <strong>{investidorTotal} lotes do investidor</strong> (Tio Ico) {showInvestidor ? "incluídos no total" : "excluídos das métricas reais"}.
          Para gerenciar a lista, edite <code style={{ background: "var(--card-bg)", padding: "0.125rem 0.25rem", borderRadius: "0.25rem" }}>src/data/investor-lots.json</code>.
        </div>
      )}
    </div>
  );
}
