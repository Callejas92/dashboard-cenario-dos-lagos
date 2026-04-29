"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, FileText, CheckCircle, XCircle, User, Phone, TrendingUp, Award } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts";
import KPICard from "@/components/KPICard";
import { formatNumber } from "@/lib/types";

interface Contrato {
  id: number;
  loteId: string;
  bloco: string;
  unidade: string;
  valor: number;
  metragem: number;
  digital: boolean;
  cliente: string;
  clienteCpfCnpj?: string;
  clienteTipo?: "PF" | "PJ" | "";
  clienteTelefone?: string;
  status: string;
  cancelado: boolean;
  corretor: { nome: string; cpf: string; creci: string; telefone: string; email: string };
  imobiliaria: { razaoSocial: string; nomeFantasia: string; cnpj: string };
  dataContrato?: string;
}

interface CorretorStats {
  nome: string;
  contratos: number;
  valorTotal: number;
  cancelados: number;
  assinados: number;
}

interface ContratosData {
  configured: boolean;
  error?: string;
  total: number;
  ativos: number;
  cancelados: number;
  valorTotalAtivo: number;
  valorTotalCancelado: number;
  porStatus: Record<string, number>;
  porStatusValor: Record<string, number>;
  porCorretor: CorretorStats[];
  pipelineFisico: { status: string; qtd: number }[];
  pipelineDigital: { status: string; qtd: number }[];
  contratos: Contrato[];
  fetchedAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  GERADO: "#9ca3af",
  CONFERIDO: "#06b6d4",
  "ENVIADO PARA ASSINATURA": "#f59e0b",
  ASSINADO: "#10b981",
  FATURADO: "#3b82f6",
  "ENTREGUE AO INCORPORADOR": "#8b5cf6",
  CANCELADO: "#e94560",
};

function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function TabContratos() {
  const [data, setData] = useState<ContratosData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tipoFiltro, setTipoFiltro] = useState<"todos" | "fisico" | "digital">("todos");
  const [statusFiltro, setStatusFiltro] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/crm/contratos");
      const json = await res.json();
      if (!json.configured) setError(json.message || "Não configurado");
      else if (json.error) setError(json.error);
      else setData(json);
    } catch (err) {
      setError(String(err));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="text-center py-12">
        <RefreshCw size={24} className="animate-spin mx-auto mb-3" style={{ color: "#3b82f6" }} />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Carregando contratos...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="kpi-card text-center py-12">
        <p className="text-sm" style={{ color: "#e94560" }}>{error || "Sem dados"}</p>
        <button onClick={fetchData} className="mt-3 px-4 py-2 rounded-lg text-sm" style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" }}>
          Tentar novamente
        </button>
      </div>
    );
  }

  // Filtra contratos
  let contratosFiltrados = data.contratos;
  if (tipoFiltro === "fisico") contratosFiltrados = contratosFiltrados.filter((c) => !c.digital);
  if (tipoFiltro === "digital") contratosFiltrados = contratosFiltrados.filter((c) => c.digital);
  if (statusFiltro) contratosFiltrados = contratosFiltrados.filter((c) => c.status === statusFiltro);
  if (search.trim()) {
    const q = search.toLowerCase();
    contratosFiltrados = contratosFiltrados.filter((c) =>
      c.cliente.toLowerCase().includes(q) ||
      (c.clienteCpfCnpj || "").toLowerCase().includes(q) ||
      c.corretor.nome.toLowerCase().includes(q) ||
      c.loteId.toLowerCase().includes(q)
    );
  }

  const ticketMedio = data.ativos > 0 ? data.valorTotalAtivo / data.ativos : 0;
  const taxaCancel = data.total > 0 ? (data.cancelados / data.total) * 100 : 0;

  const pipeline = tipoFiltro === "digital" ? data.pipelineDigital
    : tipoFiltro === "fisico" ? data.pipelineFisico
    : data.pipelineFisico.map((f) => ({
        status: f.status,
        qtd: f.qtd + (data.pipelineDigital.find((d) => d.status === f.status)?.qtd || 0),
      }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "#3b82f620" }}>
            <FileText size={20} style={{ color: "#3b82f6" }} />
          </div>
          <div>
            <h2 className="text-lg font-bold" style={{ color: "var(--text)" }}>Contratos</h2>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>
              {data.total} contratos · R$ {(data.valorTotalAtivo / 1_000_000).toFixed(2)}M em pipeline
            </p>
          </div>
        </div>
        <button onClick={fetchData} className="p-2 rounded-lg hover:bg-white/5 transition-colors">
          <RefreshCw size={14} style={{ color: "var(--text-dim)" }} />
        </button>
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Contratos Ativos"
          value={String(data.ativos)}
          icon={<CheckCircle size={14} style={{ color: "#10b981" }} />}
        />
        <KPICard
          label="Pipeline R$"
          value={formatBRL(data.valorTotalAtivo)}
          icon={<TrendingUp size={14} style={{ color: "#3b82f6" }} />}
        />
        <KPICard
          label="Ticket Médio"
          value={formatBRL(ticketMedio)}
          icon={<Award size={14} style={{ color: "#f59e0b" }} />}
        />
        <KPICard
          label="Taxa Cancelamento"
          value={`${taxaCancel.toFixed(1)}%`}
          icon={<XCircle size={14} style={{ color: taxaCancel < 5 ? "#10b981" : "#e94560" }} />}
          status={taxaCancel < 5 ? "good" : taxaCancel > 10 ? "bad" : "neutral"}
        />
      </div>

      {/* Filtros */}
      <div className="kpi-card">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            {(["todos", "fisico", "digital"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTipoFiltro(t)}
                style={{
                  padding: "0.375rem 0.875rem", fontSize: "0.75rem", fontWeight: 600,
                  borderRadius: "0.5rem",
                  background: tipoFiltro === t ? "#3b82f6" : "var(--surface)",
                  color: tipoFiltro === t ? "#fff" : "var(--text-muted)",
                  border: "1px solid var(--border)", cursor: "pointer",
                }}
              >
                {t === "todos" ? "Todos" : t === "fisico" ? "Físico" : "Digital"}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Buscar cliente, corretor ou lote..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1, minWidth: "200px",
              padding: "0.4rem 0.75rem", fontSize: "0.75rem",
              background: "var(--surface)", color: "var(--text)",
              border: "1px solid var(--border)", borderRadius: "0.5rem",
              outline: "none",
            }}
          />
          {statusFiltro && (
            <button
              onClick={() => setStatusFiltro(null)}
              style={{
                padding: "0.375rem 0.625rem", fontSize: "0.7rem",
                background: "#e9456015", color: "#e94560",
                border: "1px solid #e9456040", borderRadius: "0.375rem",
                cursor: "pointer", fontWeight: 600,
              }}
            >
              ✕ {statusFiltro}
            </button>
          )}
        </div>
      </div>

      {/* Pipeline visual */}
      <div className="kpi-card">
        <h3 className="text-sm font-bold mb-1" style={{ color: "var(--text-muted)" }}>PIPELINE DE CONTRATOS</h3>
        <p className="text-xs mb-4" style={{ color: "var(--text-dim)" }}>
          Clique em um status para filtrar a tabela
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {pipeline.filter((p) => p.qtd > 0 || p.status !== "CANCELADO").map((p) => {
            const cor = STATUS_COLORS[p.status] || "#6b7280";
            const valor = data.porStatusValor[p.status] || 0;
            const isActive = statusFiltro === p.status;
            return (
              <button
                key={p.status}
                onClick={() => setStatusFiltro(isActive ? null : p.status)}
                style={{
                  padding: "0.75rem", borderRadius: "0.5rem",
                  background: isActive ? cor + "30" : cor + "12",
                  border: `1px solid ${cor}${isActive ? "80" : "40"}`,
                  textAlign: "center", cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ fontSize: "0.6rem", fontWeight: 700, color: cor, marginBottom: "0.25rem" }}>
                  {p.status}
                </div>
                <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text)" }}>
                  {p.qtd}
                </div>
                <div style={{ fontSize: "0.6rem", color: "var(--text-dim)" }}>
                  {valor > 0 ? `R$ ${(valor / 1000).toFixed(0)}k` : "—"}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tabela de contratos */}
      <div className="kpi-card overflow-x-auto">
        <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>
          CONTRATOS ({contratosFiltrados.length})
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "2px solid var(--border)" }}>
              <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>Lote</th>
              <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>Cliente</th>
              <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>Corretor</th>
              <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>Status</th>
              <th className="text-center py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>Tipo</th>
              <th className="text-right py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>Valor</th>
            </tr>
          </thead>
          <tbody>
            {contratosFiltrados.slice(0, 50).map((c) => {
              const cor = STATUS_COLORS[c.status] || "#6b7280";
              return (
                <tr key={c.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="py-2 px-2" style={{ color: "var(--text)", fontWeight: 600 }}>{c.loteId}</td>
                  <td className="py-2 px-2" style={{ color: "var(--text)" }}>
                    <div className="flex items-center gap-1">
                      <User size={11} style={{ color: c.clienteTipo === "PJ" ? "#8b5cf6" : "#10b981" }} />
                      <span style={{ fontSize: "0.8rem" }}>{c.cliente || "—"}</span>
                      {c.clienteTipo && (
                        <span style={{
                          fontSize: "0.6rem", padding: "0.05rem 0.3rem",
                          background: c.clienteTipo === "PJ" ? "#8b5cf615" : "#10b98115",
                          color: c.clienteTipo === "PJ" ? "#8b5cf6" : "#10b981",
                          borderRadius: "0.25rem", fontWeight: 700,
                        }}>{c.clienteTipo}</span>
                      )}
                    </div>
                    {c.clienteCpfCnpj && (
                      <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", marginTop: "0.1rem" }}>
                        {c.clienteTipo === "PJ" ? "CNPJ" : "CPF"}: {c.clienteCpfCnpj}
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-2" style={{ color: "var(--text-muted)" }}>
                    <div>
                      <div style={{ fontSize: "0.8rem" }}>{c.corretor.nome || "—"}</div>
                      {c.corretor.telefone && (
                        <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", display: "flex", alignItems: "center", gap: "0.2rem" }}>
                          <Phone size={9} />{c.corretor.telefone}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-2">
                    <span style={{
                      fontSize: "0.65rem", padding: "0.125rem 0.5rem",
                      background: cor + "15", color: cor,
                      borderRadius: "0.375rem", fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}>
                      {c.status}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-center" style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>
                    {c.digital ? "💻 Digital" : "📄 Físico"}
                  </td>
                  <td className="py-2 px-2 text-right" style={{ color: "var(--text)", fontWeight: 600 }}>
                    {formatBRL(c.valor)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {contratosFiltrados.length > 0 && (
            <tfoot>
              <tr style={{ background: "#3b82f610", borderTop: "2px solid #3b82f6" }}>
                <td colSpan={5} className="py-3 px-2" style={{ color: "#3b82f6", fontWeight: 700 }}>
                  TOTAL ({contratosFiltrados.length}{contratosFiltrados.length > 50 ? " — mostrando 50" : ""})
                </td>
                <td className="text-right py-3 px-2" style={{ color: "#3b82f6", fontWeight: 700 }}>
                  {formatBRL(contratosFiltrados.reduce((s, c) => s + c.valor, 0))}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Performance por corretor (depois da tabela) */}
      {data.porCorretor.length > 0 && (
        <div className="kpi-card">
          <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>PERFORMANCE POR CORRETOR</h3>
          <ResponsiveContainer width="100%" height={Math.max(data.porCorretor.length * 38 + 40, 200)}>
            <BarChart data={data.porCorretor.slice(0, 10).map((c) => ({
              nome: c.nome.length > 25 ? c.nome.slice(0, 23) + "…" : c.nome,
              valorTotal: c.valorTotal,
              contratos: c.contratos,
              assinados: c.assinados,
            }))} layout="vertical" margin={{ left: 8, right: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={{ fill: "var(--text-dim)", fontSize: 11 }} tickFormatter={(v) => `R$ ${(Number(v) / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="nome" tick={{ fill: "var(--text-dim)", fontSize: 10 }} width={150} />
              <Tooltip
                contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--border)", borderRadius: "0.5rem", fontSize: "0.75rem" }}
                formatter={(v, _, p) => {
                  const payload = p.payload as { contratos: number; assinados: number };
                  return [`${formatBRL(Number(v))} (${payload.contratos} contratos, ${payload.assinados} assinados)`, "Valor"];
                }}
              />
              <Bar dataKey="valorTotal" radius={[0, 4, 4, 0]}>
                {data.porCorretor.slice(0, 10).map((_, i) => (
                  <Cell key={i} fill={`hsl(${(i * 50) % 360}, 70%, 50%)`} />
                ))}
                <LabelList
                  dataKey="contratos"
                  position="right"
                  formatter={(v: unknown) => `${v} lotes`}
                  style={{ fill: "var(--text)", fontSize: 11, fontWeight: 700 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Footer */}
      <p className="text-xs text-right" style={{ color: "var(--text-dim)" }}>
        Atualizado: {new Date(data.fetchedAt).toLocaleString("pt-BR")}
      </p>
    </div>
  );
}
