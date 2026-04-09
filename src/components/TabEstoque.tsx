"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  AreaChart, Area, Line,
} from "recharts";
import KPICard from "./KPICard";
import DateRangeFilter from "./DateRangeFilter";
import { Search, Home, BarChart3, DollarSign, TrendingUp, Layers, RefreshCw, ShoppingCart, User, CreditCard, Calendar } from "lucide-react";
import { formatBRL, VendasResponse, VendaRecord } from "@/lib/types";

interface EstoqueData {
  status: string;
  uauStatus?: string;
  summary: { total: number; disponivel: number; vendido: number; emVenda: number; foraDeVenda: number; vgvTotal: number; vgvVendido: number; areaTotal: number; areaVendida: number };
  quadras: Array<{ quadra: string; total: number; disponivel: number; vendido: number; emVenda: number; foraDeVenda: number; vgvTotal: number; vgvVendido: number }>;
  unidades: Array<{ identificador: string; quadra: string; lote: string; loteNum: number; status: string; area: number; valorTotal: number; valorM2: number; classificacao: string; rua: string }>;
  classificacoes: Array<{ nome: string; total: number; disponivel: number; vendido: number; foraDeVenda: number }>;
}

const STATUS_COLORS: Record<string, string> = {
  disponivel: "#10b981",
  vendida: "#e94560",
  vendido: "#e94560",
  "em venda": "#f4a236",
  em_venda: "#f4a236",
  "fora de venda": "#6b7280",
  bloqueado: "#6b7280",
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
  if (s.includes("fora de venda") || s.includes("bloqueado")) return "foraDeVenda";
  return "disponivel";
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}K`;
  return formatBRL(value);
}

type Aggregation = "day" | "week" | "month";

function aggregateVendas(vendas: VendasResponse["porDia"], agg: Aggregation) {
  if (agg === "day") return vendas;

  const map = new Map<string, { data: string; quantidade: number; valorTotal: number }>();
  for (const d of vendas) {
    let key: string;
    if (agg === "month") {
      key = d.data.substring(0, 7);
    } else {
      const dt = new Date(d.data + "T00:00:00");
      const jan1 = new Date(dt.getFullYear(), 0, 1);
      const week = Math.ceil(((dt.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
      key = `${dt.getFullYear()}-S${String(week).padStart(2, "0")}`;
    }
    if (!map.has(key)) map.set(key, { data: key, quantidade: 0, valorTotal: 0 });
    const entry = map.get(key)!;
    entry.quantidade += d.quantidade;
    entry.valorTotal += d.valorTotal;
  }
  return Array.from(map.values()).sort((a, b) => a.data.localeCompare(b.data));
}

function formatLabel(key: string, agg: Aggregation): string {
  if (agg === "day") {
    const [, m, d] = key.split("-");
    return `${d}/${m}`;
  }
  if (agg === "week") {
    return key.replace(/^\d{4}-/, "");
  }
  const [y, m] = key.split("-");
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${months[parseInt(m) - 1]}/${y.slice(2)}`;
}

function SalesHistorySection() {
  const [salesData, setSalesData] = useState<VendasResponse | null>(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState<string | null>(null);
  const [aggregation, setAggregation] = useState<Aggregation>("month");

  const now = new Date();
  const defaultEnd = now.toISOString().split("T")[0];
  const defaultStart = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().split("T")[0];

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [activeQuick, setActiveQuick] = useState<number | "total" | null>("total");

  const fetchSales = useCallback(async (start: string, end: string) => {
    setSalesLoading(true);
    setSalesError(null);
    try {
      const res = await fetch(`/api/uau/vendas?startDate=${start}&endDate=${end}`);
      if (!res.ok) throw new Error("Erro ao buscar vendas");
      const json = await res.json();
      setSalesData(json);
    } catch (err) {
      setSalesError(err instanceof Error ? err.message : String(err));
    } finally {
      setSalesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSales(startDate, endDate);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStartChange = (d: string) => { setStartDate(d); setActiveQuick(null); fetchSales(d, endDate); };
  const handleEndChange = (d: string) => { setEndDate(d); setActiveQuick(null); fetchSales(startDate, d); };
  const handleQuickSelect = (days: number | "total") => {
    setActiveQuick(days);
    const end = new Date();
    const endStr = end.toISOString().split("T")[0];
    let startStr: string;
    if (days === "total") {
      startStr = new Date(end.getFullYear() - 2, end.getMonth(), end.getDate()).toISOString().split("T")[0];
    } else {
      const s = new Date(end);
      s.setDate(s.getDate() - days);
      startStr = s.toISOString().split("T")[0];
    }
    setStartDate(startStr);
    setEndDate(endStr);
    fetchSales(startStr, endStr);
  };

  const chartData = useMemo(() => {
    if (!salesData) return [];
    return aggregateVendas(salesData.porDia, aggregation).map((d) => ({
      ...d,
      label: formatLabel(d.data, aggregation),
      valorK: Math.round(d.valorTotal / 1000),
    }));
  }, [salesData, aggregation]);

  const aggBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: "0.2rem 0.5rem",
    fontSize: "0.65rem",
    fontWeight: 700,
    borderRadius: "0.375rem",
    background: active ? "#4285f4" : "transparent",
    color: active ? "#fff" : "var(--text-dim)",
    border: active ? "1px solid #4285f4" : "1px solid var(--border)",
    cursor: "pointer",
  });

  const tooltipStyle = {
    contentStyle: {
      background: "var(--tooltip-bg)",
      border: "1px solid var(--tooltip-border)",
      borderRadius: "0.75rem",
      color: "var(--tooltip-text)",
    },
    labelStyle: { color: "var(--tooltip-label)" },
  };

  return (
    <div className="kpi-card">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <ShoppingCart size={14} style={{ color: "#8b5cf6" }} />
          <h3 className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>HISTORICO DE VENDAS</h3>
        </div>
        <div className="flex items-center gap-1">
          {(["day", "week", "month"] as Aggregation[]).map((a) => (
            <button key={a} onClick={() => setAggregation(a)} style={aggBtnStyle(aggregation === a)}>
              {a === "day" ? "Dia" : a === "week" ? "Semana" : "Mes"}
            </button>
          ))}
        </div>
      </div>

      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onStartChange={handleStartChange}
        onEndChange={handleEndChange}
        onQuickSelect={handleQuickSelect}
        activeQuick={activeQuick}
        inline
      />

      {salesLoading ? (
        <div className="text-center py-8">
          <RefreshCw size={20} className="animate-spin mx-auto mb-2" style={{ color: "#1a5c3a" }} />
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Carregando vendas...</p>
        </div>
      ) : salesError ? (
        <div className="text-center py-8">
          <p className="text-xs" style={{ color: "#e94560" }}>{salesError}</p>
          <button onClick={() => fetchSales(startDate, endDate)} className="mt-2 text-xs underline" style={{ color: "var(--text-dim)" }}>Tentar novamente</button>
        </div>
      ) : salesData && salesData.total === 0 ? (
        <div className="text-center py-8">
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>Nenhuma venda encontrada no periodo.</p>
        </div>
      ) : salesData ? (
        <>
          {/* Summary mini KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div style={{ padding: "0.5rem 0.75rem", borderRadius: "0.5rem", background: "var(--surface)", border: "1px solid var(--border)" }}>
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>Total Vendas</p>
              <p className="text-lg font-bold" style={{ color: "var(--text)" }}>{salesData.total}</p>
            </div>
            <div style={{ padding: "0.5rem 0.75rem", borderRadius: "0.5rem", background: "var(--surface)", border: "1px solid var(--border)" }}>
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>Valor Total</p>
              <p className="text-lg font-bold" style={{ color: "#10b981" }}>{formatCompact(salesData.valorTotal)}</p>
            </div>
            <div style={{ padding: "0.5rem 0.75rem", borderRadius: "0.5rem", background: "var(--surface)", border: "1px solid var(--border)" }}>
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>Ticket Medio</p>
              <p className="text-lg font-bold" style={{ color: "#4285f4" }}>{formatCompact(salesData.total > 0 ? salesData.valorTotal / salesData.total : 0)}</p>
            </div>
            <div style={{ padding: "0.5rem 0.75rem", borderRadius: "0.5rem", background: "var(--surface)", border: "1px solid var(--border)" }}>
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>Periodo</p>
              <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{salesData.porDia.length} {aggregation === "day" ? "dias" : aggregation === "week" ? "semanas" : "meses"}</p>
            </div>
          </div>

          {/* Chart */}
          {chartData.length > 0 && (
            <div style={{ marginBottom: "1rem" }}>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fill: "var(--text-dim)", fontSize: 10 }} />
                  <YAxis yAxisId="left" tick={{ fill: "var(--text-dim)", fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: "var(--text-dim)", fontSize: 10 }} tickFormatter={(v) => `${v}K`} />
                  <Tooltip {...tooltipStyle} formatter={(value, name) => [name === "valorK" ? `R$ ${value}K` : value, name === "valorK" ? "Valor (R$ mil)" : "Qtd Vendas"]} />
                  <Area yAxisId="left" type="monotone" dataKey="quantidade" fill="#8b5cf6" fillOpacity={0.15} stroke="#8b5cf6" strokeWidth={2} name="Qtd Vendas" />
                  <Line yAxisId="right" type="monotone" dataKey="valorK" stroke="#10b981" strokeWidth={2} dot={false} name="Valor (R$ mil)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Sales table */}
          {salesData.vendas.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border)" }}>
                    <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>
                      <Calendar size={10} className="inline mr-1" />Data
                    </th>
                    <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>Unidade</th>
                    <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>
                      <User size={10} className="inline mr-1" />Corretor
                    </th>
                    <th className="text-right py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>
                      <DollarSign size={10} className="inline mr-1" />Valor
                    </th>
                    <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>
                      <CreditCard size={10} className="inline mr-1" />Forma Pgto
                    </th>
                    <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>Comprador</th>
                  </tr>
                </thead>
                <tbody>
                  {salesData.vendas.map((v: VendaRecord, i: number) => (
                    <tr key={`${v.chaveVenda}-${i}`} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="py-1.5 px-2" style={{ color: "var(--text)" }}>
                        {v.dataVenda ? new Date(v.dataVenda + "T00:00:00").toLocaleDateString("pt-BR") : "-"}
                      </td>
                      <td className="py-1.5 px-2" style={{ color: "var(--text)", fontWeight: 600 }}>{v.identificadorUnidade || "-"}</td>
                      <td className="py-1.5 px-2" style={{ color: "var(--text-muted)" }}>{v.corretor || "-"}</td>
                      <td className="text-right py-1.5 px-2" style={{ color: "#10b981", fontWeight: 600 }}>{formatBRL(v.valorVenda)}</td>
                      <td className="py-1.5 px-2" style={{ color: "var(--text-muted)" }}>{v.formaPagamento || "-"}</td>
                      <td className="py-1.5 px-2" style={{ color: "var(--text-muted)" }}>{v.compradorNome || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
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
  const ticketMedio = summary.vendido > 0 ? summary.vgvVendido / summary.vendido : 0;

  // Donut chart data
  const donutData = [
    { name: "Disponivel", value: summary.disponivel },
    { name: "Vendido", value: summary.vendido },
    { name: "Em Venda", value: summary.emVenda },
    { name: "Fora de Venda", value: summary.foraDeVenda ?? 0 },
  ].filter((d) => d.value > 0);

  const donutColors = ["#10b981", "#e94560", "#f4a236", "#6b7280"];

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
          label="Fora de Venda"
          value={String(summary.foraDeVenda ?? 0)}
          icon={<BarChart3 size={14} style={{ color: "#6b7280" }} />}
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

      {/* Sales History Section */}
      <SalesHistorySection />

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
            <option value="foraDeVenda">Fora de Venda</option>
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
