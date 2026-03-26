"use client";

import { useState, useMemo } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";
import KPICard from "./KPICard";
import { Search, Home, BarChart3, DollarSign, TrendingUp, Layers } from "lucide-react";
import { formatBRL } from "@/lib/types";

interface EstoqueData {
  status: string;
  uauStatus?: string;
  summary: { total: number; disponivel: number; vendido: number; emVenda: number; vgvTotal: number; vgvVendido: number; areaTotal: number; areaVendida: number };
  quadras: Array<{ quadra: string; total: number; disponivel: number; vendido: number; emVenda: number; vgvTotal: number; vgvVendido: number }>;
  unidades: Array<{ identificador: string; quadra: string; lote: string; loteNum: number; status: string; area: number; valorTotal: number; valorM2: number; classificacao: string; rua: string }>;
  classificacoes: Array<{ nome: string; total: number; disponivel: number; vendido: number }>;
}

const STATUS_COLORS: Record<string, string> = {
  disponivel: "#10b981",
  vendida: "#e94560",
  vendido: "#e94560",
  "em venda": "#f4a236",
  em_venda: "#f4a236",
};

function getStatusColor(status: string): string {
  const s = status.toLowerCase();
  for (const [key, color] of Object.entries(STATUS_COLORS)) {
    if (s.includes(key)) return color;
  }
  return "#6b7280";
}

function getStatusKey(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("vendid")) return "vendido";
  if (s.includes("em venda") || s.includes("em_venda")) return "emVenda";
  return "disponivel";
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}K`;
  return formatBRL(value);
}

type SortField = "quadra" | "lote" | "area" | "valorTotal" | "valorM2" | "classificacao" | "rua" | "status";
type SortDir = "asc" | "desc";

export default function TabEstoque({ data }: { data: EstoqueData }) {
  const [filterQuadra, setFilterQuadra] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterClassificacao, setFilterClassificacao] = useState("all");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("quadra");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { summary, quadras, unidades, classificacoes } = data;

  const vso = summary.total > 0 ? ((summary.vendido / summary.total) * 100).toFixed(1) : "0";
  const ticketMedio = summary.total > 0 ? summary.vgvTotal / summary.total : 0;

  // Donut chart data
  const donutData = [
    { name: "Disponivel", value: summary.disponivel },
    { name: "Vendido", value: summary.vendido },
    { name: "Em Venda", value: summary.emVenda },
  ].filter((d) => d.value > 0);

  const donutColors = ["#10b981", "#e94560", "#f4a236"];

  // Classification bar chart data
  const classChartData = classificacoes.map((c) => ({
    nome: c.nome,
    Disponivel: c.disponivel,
    Vendido: c.vendido,
  }));

  // Filter units
  const filteredUnidades = useMemo(() => {
    let filtered = unidades.filter((u) => {
      if (filterQuadra !== "all" && u.quadra !== filterQuadra) return false;
      if (filterStatus !== "all" && getStatusKey(u.status) !== filterStatus) return false;
      if (filterClassificacao !== "all" && u.classificacao !== filterClassificacao) return false;
      if (search && !u.identificador.toLowerCase().includes(search.toLowerCase()) && !u.rua.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });

    // Sort
    filtered = [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "quadra": {
          const nA = parseInt(a.quadra.replace(/\D/g, "")) || 0;
          const nB = parseInt(b.quadra.replace(/\D/g, "")) || 0;
          cmp = nA - nB || a.loteNum - b.loteNum;
          break;
        }
        case "lote": cmp = a.loteNum - b.loteNum; break;
        case "area": cmp = a.area - b.area; break;
        case "valorTotal": cmp = a.valorTotal - b.valorTotal; break;
        case "valorM2": cmp = a.valorM2 - b.valorM2; break;
        case "classificacao": cmp = a.classificacao.localeCompare(b.classificacao); break;
        case "rua": cmp = a.rua.localeCompare(b.rua); break;
        case "status": cmp = a.status.localeCompare(b.status); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return filtered;
  }, [unidades, filterQuadra, filterStatus, filterClassificacao, search, sortField, sortDir]);

  // Totals for filtered
  const filteredTotals = useMemo(() => {
    let area = 0, valor = 0;
    for (const u of filteredUnidades) {
      area += u.area;
      valor += u.valorTotal;
    }
    return { area, valor };
  }, [filteredUnidades]);

  // Unique values for dropdowns
  const uniqueQuadras = Array.from(new Set(unidades.map((u) => u.quadra))).sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, "")) || 0;
    const numB = parseInt(b.replace(/\D/g, "")) || 0;
    return numA - numB;
  });

  const uniqueClassificacoes = Array.from(new Set(unidades.map((u) => u.classificacao))).sort((a, b) => {
    const order = ["A", "B", "C", "D", "E", "F", "2A", "3A"];
    return order.indexOf(a) - order.indexOf(b);
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  };

  const tooltipStyle = {
    contentStyle: {
      background: "var(--tooltip-bg)",
      border: "1px solid var(--tooltip-border)",
      borderRadius: "0.75rem",
      color: "var(--tooltip-text)",
    },
    labelStyle: { color: "var(--tooltip-label)" },
  };

  const selectStyle: React.CSSProperties = {
    padding: "0.375rem 0.5rem",
    fontSize: "0.75rem",
    fontWeight: 600,
    borderRadius: "0.5rem",
    background: "var(--surface)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    cursor: "pointer",
  };

  const thStyle: React.CSSProperties = {
    color: "var(--text-dim)",
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Home size={18} style={{ color: "#10b981" }} />
        <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>Estoque de Unidades</h3>
        {data.uauStatus && (
          <span style={{ fontSize: "0.65rem", padding: "0.15rem 0.5rem", borderRadius: "9999px", background: "#f4a23622", color: "#f4a236", fontWeight: 600 }}>
            UAU {data.uauStatus}
          </span>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
        <KPICard
          label="Total Lotes"
          value={String(summary.total)}
          icon={<Layers size={14} style={{ color: "#4285f4" }} />}
        />
        <KPICard
          label="Disponiveis"
          value={String(summary.disponivel)}
          status="good"
        />
        <KPICard
          label="Vendidos"
          value={String(summary.vendido)}
          status="bad"
        />
        <KPICard
          label="Em Venda"
          value={String(summary.emVenda)}
          icon={<BarChart3 size={14} style={{ color: "#f4a236" }} />}
        />
        <KPICard
          label="VSO"
          value={`${vso}%`}
          icon={<TrendingUp size={14} style={{ color: "#8b5cf6" }} />}
        />
        <KPICard
          label="VGV Total"
          value={formatCompact(summary.vgvTotal)}
          icon={<DollarSign size={14} style={{ color: "#10b981" }} />}
        />
        <KPICard
          label="VGV Vendido"
          value={formatCompact(summary.vgvVendido)}
          icon={<DollarSign size={14} style={{ color: "#e94560" }} />}
        />
        <KPICard
          label="Ticket Medio"
          value={formatCompact(ticketMedio)}
          icon={<BarChart3 size={14} style={{ color: "#4285f4" }} />}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Donut Chart */}
        <div className="kpi-card">
          <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>DISTRIBUICAO POR STATUS</h3>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "2rem", flexWrap: "wrap" }}>
            <ResponsiveContainer width={220} height={220}>
              <PieChart>
                <Pie
                  data={donutData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                  label={(v) => `${v.value}`}
                  labelLine={false}
                  style={{ fontSize: "0.7rem", fontWeight: 600 }}
                >
                  {donutData.map((_, i) => (
                    <Cell key={i} fill={donutColors[i % donutColors.length]} />
                  ))}
                </Pie>
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {donutData.map((d, i) => {
                const pct = summary.total > 0 ? ((d.value / summary.total) * 100).toFixed(1) : "0";
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: donutColors[i % donutColors.length] }} />
                    <span style={{ fontSize: "0.8rem", color: "var(--text)", fontWeight: 600 }}>{d.name}</span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {d.value} ({pct}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bar Chart by Classification */}
        <div className="kpi-card">
          <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>DISTRIBUICAO POR CLASSIFICACAO</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={classChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="nome" tick={{ fill: "var(--text-dim)", fontSize: 12 }} />
              <YAxis tick={{ fill: "var(--text-dim)", fontSize: 12 }} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
              <Bar dataKey="Disponivel" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Vendido" stackId="a" fill="#e94560" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Visual Grid by Quadra */}
      <div className="kpi-card">
        <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>MAPA VISUAL POR QUADRA</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {quadras.map((q) => {
            const quadraUnits = unidades
              .filter((u) => u.quadra === q.quadra)
              .sort((a, b) => a.loteNum - b.loteNum);
            return (
              <div
                key={q.quadra}
                style={{
                  padding: "0.75rem",
                  borderRadius: "0.75rem",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text)" }}>{q.quadra}</span>
                  <span style={{ fontSize: "0.6rem", color: "var(--text-dim)" }}>
                    {q.total} lotes | {q.vendido} vendidos | {formatCompact(q.vgvTotal)}
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
                  {quadraUnits.map((u) => (
                    <div
                      key={u.identificador}
                      title={`${u.identificador} — ${u.status} — ${u.area.toFixed(0)}m² — ${formatBRL(u.valorTotal)}`}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 4,
                        background: getStatusColor(u.status),
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        fontSize: "0.5rem",
                        fontWeight: 700,
                        color: "#fff",
                        transition: "transform 0.1s",
                      }}
                      onMouseEnter={(e) => {
                        (e.target as HTMLElement).style.transform = "scale(1.3)";
                      }}
                      onMouseLeave={(e) => {
                        (e.target as HTMLElement).style.transform = "scale(1)";
                      }}
                    >
                      {u.loteNum}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 justify-center">
          {[
            { label: "Disponivel", color: "#10b981" },
            { label: "Vendido", color: "#e94560" },
            { label: "Em Venda", color: "#f4a236" },
          ].map((item) => (
            <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: item.color }} />
              <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Table with Filters */}
      <div className="kpi-card overflow-x-auto">
        <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>LISTA DE UNIDADES</h3>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Search size={14} style={{ color: "var(--text-dim)" }} />
            <input
              type="text"
              placeholder="Buscar identificador ou rua..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                ...selectStyle,
                minWidth: 200,
              }}
            />
          </div>
          <select
            value={filterQuadra}
            onChange={(e) => setFilterQuadra(e.target.value)}
            style={selectStyle}
          >
            <option value="all">Todas as Quadras</option>
            {uniqueQuadras.map((q) => (
              <option key={q} value={q}>{q}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={selectStyle}
          >
            <option value="all">Todos os Status</option>
            <option value="disponivel">Disponivel</option>
            <option value="vendido">Vendido</option>
            <option value="emVenda">Em Venda</option>
          </select>
          <select
            value={filterClassificacao}
            onChange={(e) => setFilterClassificacao(e.target.value)}
            style={selectStyle}
          >
            <option value="all">Todas Classificacoes</option>
            {uniqueClassificacoes.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
            {filteredUnidades.length} de {unidades.length} unidades
          </span>
        </div>

        {/* Table */}
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "2px solid var(--border)" }}>
              <th className="text-left py-2 px-2 font-semibold" style={thStyle} onClick={() => handleSort("quadra")}>
                Quadra{sortIcon("quadra")}
              </th>
              <th className="text-left py-2 px-2 font-semibold" style={thStyle} onClick={() => handleSort("lote")}>
                Lote{sortIcon("lote")}
              </th>
              <th className="text-right py-2 px-2 font-semibold" style={thStyle} onClick={() => handleSort("area")}>
                Area (m²){sortIcon("area")}
              </th>
              <th className="text-right py-2 px-2 font-semibold" style={thStyle} onClick={() => handleSort("valorTotal")}>
                Valor Total (R$){sortIcon("valorTotal")}
              </th>
              <th className="text-right py-2 px-2 font-semibold" style={thStyle} onClick={() => handleSort("valorM2")}>
                Valor M² (R$){sortIcon("valorM2")}
              </th>
              <th className="text-center py-2 px-2 font-semibold" style={thStyle} onClick={() => handleSort("classificacao")}>
                Class.{sortIcon("classificacao")}
              </th>
              <th className="text-left py-2 px-2 font-semibold" style={thStyle} onClick={() => handleSort("rua")}>
                Rua{sortIcon("rua")}
              </th>
              <th className="text-center py-2 px-2 font-semibold" style={thStyle} onClick={() => handleSort("status")}>
                Status{sortIcon("status")}
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredUnidades.map((u) => (
              <tr key={u.identificador} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="py-2 px-2" style={{ color: "var(--text)", fontWeight: 600 }}>{u.quadra}</td>
                <td className="py-2 px-2" style={{ color: "var(--text)" }}>{u.lote}</td>
                <td className="text-right py-2 px-2" style={{ color: "var(--text-muted)" }}>
                  {u.area.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="text-right py-2 px-2" style={{ color: "var(--text)" }}>
                  {formatBRL(u.valorTotal)}
                </td>
                <td className="text-right py-2 px-2" style={{ color: "var(--text-muted)" }}>
                  {formatBRL(u.valorM2)}
                </td>
                <td className="text-center py-2 px-2">
                  <span style={{
                    padding: "0.1rem 0.4rem",
                    borderRadius: "0.25rem",
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    color: "var(--text)",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                  }}>
                    {u.classificacao}
                  </span>
                </td>
                <td className="py-2 px-2" style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{u.rua}</td>
                <td className="text-center py-2 px-2">
                  <span
                    style={{
                      padding: "0.15rem 0.5rem",
                      borderRadius: "9999px",
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      color: "#fff",
                      background: getStatusColor(u.status),
                    }}
                  >
                    {u.status}
                  </span>
                </td>
              </tr>
            ))}
            {filteredUnidades.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center" style={{ color: "var(--text-dim)" }}>
                  Nenhuma unidade encontrada com os filtros selecionados.
                </td>
              </tr>
            )}
            {/* Totals row */}
            {filteredUnidades.length > 0 && (
              <tr style={{ borderTop: "2px solid var(--border)", background: "var(--surface)" }}>
                <td colSpan={2} className="py-2 px-2" style={{ color: "var(--text)", fontWeight: 700, fontSize: "0.75rem" }}>
                  TOTAL ({filteredUnidades.length} lotes)
                </td>
                <td className="text-right py-2 px-2" style={{ color: "var(--text)", fontWeight: 700 }}>
                  {filteredTotals.area.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="text-right py-2 px-2" style={{ color: "var(--text)", fontWeight: 700 }}>
                  {formatBRL(filteredTotals.valor)}
                </td>
                <td colSpan={4} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
