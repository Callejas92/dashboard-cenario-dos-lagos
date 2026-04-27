"use client";

import { useState, useEffect } from "react";
import { RefreshCw, Activity, X } from "lucide-react";

interface Lote {
  loteId: string;
  bloco: string;
  unidade: string;
  valor: number;
  metragem: number;
  rua: string;
  status: string;
  statusId: number;
  isInvestidor: boolean;
}

interface UnidadesData {
  configured: boolean;
  error?: string;
  empreendimento?: { nome?: string };
  total: number;
  statusCounts: Record<string, number>;
  investidor?: { total: number; statusCounts: Record<string, number> };
  statusCountsTotal?: Record<string, number>;
  lotes?: Lote[];
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

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function CrmStatusPanel() {
  const [data, setData] = useState<UnidadesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInvestidor, setShowInvestidor] = useState(false);
  const [openStatus, setOpenStatus] = useState<string | null>(null);

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

      {/* Cards de status (clicáveis) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
        {STATUS_ORDER.map((status) => {
          const cfg = STATUS_CONFIG[status];
          const count = counts[status] || 0;
          const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0";
          const clickable = count > 0;
          return (
            <button
              key={status}
              onClick={() => clickable && setOpenStatus(status)}
              disabled={!clickable}
              style={{
                padding: "0.75rem", borderRadius: "0.5rem",
                background: cfg.bg, border: `1px solid ${cfg.color}30`,
                textAlign: "center",
                cursor: clickable ? "pointer" : "default",
                transition: "all 0.15s ease",
                opacity: clickable ? 1 : 0.6,
              }}
              onMouseEnter={(e) => {
                if (clickable) {
                  e.currentTarget.style.background = cfg.color + "25";
                  e.currentTarget.style.transform = "translateY(-2px)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = cfg.bg;
                e.currentTarget.style.transform = "translateY(0)";
              }}
              title={clickable ? `Ver os ${count} lotes ${status}` : ""}
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
            </button>
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

      {/* Modal com lotes do status selecionado */}
      {openStatus && data.lotes && (
        <div
          onClick={() => setOpenStatus(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--card-bg)", border: "1px solid var(--border)",
              borderRadius: "1rem", padding: "1.5rem",
              maxWidth: "900px", width: "100%",
              maxHeight: "80vh", display: "flex", flexDirection: "column",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span style={{
                  display: "inline-block", width: 12, height: 12, borderRadius: "50%",
                  background: STATUS_CONFIG[openStatus]?.color || "#6b7280",
                }} />
                <h3 className="text-base font-bold" style={{ color: "var(--text)" }}>
                  Lotes {openStatus} ({(counts[openStatus] || 0)})
                </h3>
              </div>
              <button
                onClick={() => setOpenStatus(null)}
                style={{
                  padding: "0.375rem", borderRadius: "0.375rem",
                  background: "var(--surface)", border: "1px solid var(--border)",
                  cursor: "pointer", color: "var(--text-dim)",
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ overflowY: "auto", flex: 1 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border)", position: "sticky", top: 0, background: "var(--card-bg)" }}>
                    <th style={{ textAlign: "left", padding: "0.5rem", color: "var(--text-dim)", fontWeight: 600 }}>Lote</th>
                    <th style={{ textAlign: "left", padding: "0.5rem", color: "var(--text-dim)", fontWeight: 600 }}>Rua</th>
                    <th style={{ textAlign: "right", padding: "0.5rem", color: "var(--text-dim)", fontWeight: 600 }}>Área (m²)</th>
                    <th style={{ textAlign: "right", padding: "0.5rem", color: "var(--text-dim)", fontWeight: 600 }}>Valor</th>
                    <th style={{ textAlign: "center", padding: "0.5rem", color: "var(--text-dim)", fontWeight: 600 }}>Origem</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lotes
                    .filter((l) => l.status === openStatus && (showInvestidor || !l.isInvestidor))
                    .sort((a, b) => a.loteId.localeCompare(b.loteId))
                    .map((l) => (
                      <tr key={l.loteId} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "0.5rem", color: "var(--text)", fontWeight: 600 }}>
                          {l.loteId}
                        </td>
                        <td style={{ padding: "0.5rem", color: "var(--text-muted)" }}>
                          {l.rua || "—"}
                        </td>
                        <td style={{ padding: "0.5rem", textAlign: "right", color: "var(--text)" }}>
                          {l.metragem.toFixed(0)}
                        </td>
                        <td style={{ padding: "0.5rem", textAlign: "right", color: "var(--text)", fontWeight: 500 }}>
                          {formatBRL(l.valor)}
                        </td>
                        <td style={{ padding: "0.5rem", textAlign: "center" }}>
                          {l.isInvestidor ? (
                            <span style={{
                              fontSize: "0.65rem", padding: "0.125rem 0.5rem",
                              background: "#8b5cf615", color: "#8b5cf6",
                              borderRadius: "0.375rem", fontWeight: 600,
                            }}>
                              Investidor
                            </span>
                          ) : (
                            <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>Cliente</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid var(--border)" }}>
                    <td colSpan={3} style={{ padding: "0.625rem 0.5rem", fontWeight: 700, color: "var(--text-muted)" }}>
                      TOTAL
                    </td>
                    <td style={{ padding: "0.625rem 0.5rem", textAlign: "right", fontWeight: 700, color: STATUS_CONFIG[openStatus]?.color || "var(--text)" }}>
                      {formatBRL(
                        data.lotes
                          .filter((l) => l.status === openStatus && (showInvestidor || !l.isInvestidor))
                          .reduce((s, l) => s + l.valor, 0)
                      )}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

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
