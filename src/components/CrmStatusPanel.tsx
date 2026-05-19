"use client";

import { useState, useEffect } from "react";
import { RefreshCw, Activity, X, User, Phone } from "lucide-react";

interface Lote {
  loteId: string;
  bloco: string;
  unidade: string;
  valor: number;
  metragem: number;
  rua: string;
  status: string;
  statusId: number;
}

interface Contrato {
  id: number;
  loteId: string;
  valor: number;
  status: string;
  digital: boolean;
  cliente: string;
  clienteCpfCnpj?: string;
  clienteTipo?: "PF" | "PJ" | "";
  cancelado: boolean;
  corretor: { nome: string; telefone: string; creci: string; email: string };
  imobiliaria: { nomeFantasia: string };
}

interface UnidadesData {
  configured: boolean;
  error?: string;
  empreendimento?: { nome?: string };
  total: number;
  statusCounts: Record<string, number>;
  _investidorExcluido?: number;
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
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [loading, setLoading] = useState(true);
  const [openStatus, setOpenStatus] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resU, resC] = await Promise.all([
        fetch("/api/crm/unidades"),
        fetch("/api/crm/contratos"),
      ]);
      const json = await resU.json();
      const contratosJson = await resC.json();
      setData(json);
      setContratos(contratosJson.contratos || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  // Constrói mapa loteId -> contrato (mais recente, não cancelado primeiro)
  const contratoPorLote = new Map<string, Contrato>();
  for (const c of contratos) {
    const existente = contratoPorLote.get(c.loteId);
    if (!existente || (existente.cancelado && !c.cancelado)) {
      contratoPorLote.set(c.loteId, c);
    }
  }

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

  const counts = data.statusCounts;
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const investidorExcluido = data._investidorExcluido || 0;

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
            lotes
          </div>
        </div>
      </div>

      {/* Painel inline com lotes do status selecionado (estilo Visão Geral) */}
      {openStatus && data.lotes && (
        <div
          style={{
            marginTop: "1rem",
            background: "var(--surface)", border: `1px solid ${STATUS_CONFIG[openStatus]?.color || "var(--border)"}40`,
            borderRadius: "0.75rem", padding: "1rem",
            animation: "fadeIn 0.2s ease",
          }}
        >
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span style={{
                display: "inline-block", width: 10, height: 10, borderRadius: "50%",
                background: STATUS_CONFIG[openStatus]?.color || "#6b7280",
              }} />
              <h4 className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>
                LOTES {openStatus} ({data.lotes.filter((l) => l.status === openStatus).length})
              </h4>
            </div>
            <button
              onClick={() => setOpenStatus(null)}
              style={{
                padding: "0.25rem", borderRadius: "0.375rem",
                background: "var(--card-bg)", border: "1px solid var(--border)",
                cursor: "pointer", color: "var(--text-dim)",
              }}
              title="Fechar"
            >
              <X size={14} />
            </button>
          </div>

          <div style={{ overflowX: "auto", maxHeight: "500px", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)", position: "sticky", top: 0, background: "var(--surface)" }}>
                  <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", color: "var(--text-dim)", fontWeight: 600 }}>Lote</th>
                  <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", color: "var(--text-dim)", fontWeight: 600 }}>Rua</th>
                  <th style={{ textAlign: "right", padding: "0.5rem 0.75rem", color: "var(--text-dim)", fontWeight: 600 }}>m²</th>
                  <th style={{ textAlign: "right", padding: "0.5rem 0.75rem", color: "var(--text-dim)", fontWeight: 600 }}>Valor</th>
                  <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", color: "var(--text-dim)", fontWeight: 600 }}>Cliente</th>
                  <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", color: "var(--text-dim)", fontWeight: 600 }}>Corretor</th>
                  <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", color: "var(--text-dim)", fontWeight: 600 }}>Contrato</th>
                </tr>
              </thead>
              <tbody>
                {data.lotes
                  .filter((l) => l.status === openStatus)
                  .sort((a, b) => a.loteId.localeCompare(b.loteId))
                  .map((l) => {
                    const contrato = contratoPorLote.get(l.loteId);
                    return (
                      <tr key={l.loteId} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "0.5rem 0.75rem", color: "var(--text)", fontWeight: 600 }}>
                          {l.loteId}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem", color: "var(--text-muted)" }}>
                          {l.rua || "—"}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", color: "var(--text)" }}>
                          {l.metragem.toFixed(0)}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", color: "var(--text)", fontWeight: 500 }}>
                          {formatBRL(contrato?.valor || l.valor)}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem", color: "var(--text)" }}>
                          {contrato?.cliente ? (
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                                <User size={11} style={{ color: contrato.clienteTipo === "PJ" ? "#8b5cf6" : "#10b981" }} />
                                <span style={{ fontSize: "0.75rem" }}>{contrato.cliente}</span>
                                {contrato.clienteTipo && (
                                  <span style={{
                                    fontSize: "0.55rem", padding: "0.05rem 0.3rem",
                                    background: contrato.clienteTipo === "PJ" ? "#8b5cf615" : "#10b98115",
                                    color: contrato.clienteTipo === "PJ" ? "#8b5cf6" : "#10b981",
                                    borderRadius: "0.25rem", fontWeight: 700,
                                  }}>{contrato.clienteTipo}</span>
                                )}
                              </div>
                              {contrato.clienteCpfCnpj && (
                                <div style={{ fontSize: "0.6rem", color: "var(--text-dim)" }}>
                                  {contrato.clienteCpfCnpj}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: "var(--text-dim)", fontSize: "0.7rem" }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem", color: "var(--text-muted)" }}>
                          {contrato?.corretor.nome ? (
                            <div>
                              <div style={{ fontSize: "0.75rem" }}>{contrato.corretor.nome}</div>
                              {contrato.corretor.telefone && (
                                <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", display: "flex", alignItems: "center", gap: "0.2rem" }}>
                                  <Phone size={9} />{contrato.corretor.telefone}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: "var(--text-dim)", fontSize: "0.7rem" }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem" }}>
                          {contrato ? (
                            <span style={{
                              fontSize: "0.65rem", padding: "0.125rem 0.5rem",
                              background: contrato.cancelado ? "#e9456015" : "#10b98115",
                              color: contrato.cancelado ? "#e94560" : "#10b981",
                              borderRadius: "0.375rem", fontWeight: 600,
                              whiteSpace: "nowrap",
                            }}>
                              {contrato.status} {contrato.digital ? "• Digital" : "• Físico"}
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-dim)", fontSize: "0.7rem" }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
              <tfoot>
                <tr style={{ background: (STATUS_CONFIG[openStatus]?.color || "#6b7280") + "10", fontWeight: 700, borderTop: `2px solid ${STATUS_CONFIG[openStatus]?.color || "#6b7280"}` }}>
                  <td colSpan={3} style={{ padding: "0.625rem 0.75rem", color: STATUS_CONFIG[openStatus]?.color || "var(--text)" }}>
                    TOTAL
                  </td>
                  <td style={{ padding: "0.625rem 0.75rem", textAlign: "right", color: STATUS_CONFIG[openStatus]?.color || "var(--text)" }}>
                    {formatBRL(
                      data.lotes
                        .filter((l) => l.status === openStatus)
                        .reduce((s, l) => {
                          const c = contratoPorLote.get(l.loteId);
                          return s + (c?.valor || l.valor);
                        }, 0)
                    )}
                  </td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Footer info */}
      {investidorExcluido > 0 && (
        <div style={{
          marginTop: "0.75rem", padding: "0.5rem 0.75rem",
          background: "var(--surface)", borderRadius: "0.375rem",
          fontSize: "0.7rem", color: "var(--text-dim)",
        }}>
          ℹ️ <strong>{investidorExcluido} lotes do investidor</strong> (Tio Ico) são excluídos de TODAS as métricas.
          Total real do empreendimento: <strong>{total} lotes</strong>. Para gerenciar a lista, edite{" "}
          <code style={{ background: "var(--card-bg)", padding: "0.125rem 0.25rem", borderRadius: "0.25rem" }}>src/data/investor-lots.json</code>.
        </div>
      )}
    </div>
  );
}
