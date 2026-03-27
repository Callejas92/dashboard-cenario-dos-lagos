"use client";

import { useState, useMemo, useCallback } from "react";
import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Legend, ComposedChart, Line,
} from "recharts";
import { DollarSign, Users, ShoppingCart, Target, ChevronDown, ChevronUp, Table, BarChart3, X } from "lucide-react";
import KPICard from "./KPICard";
import DateRangeFilter from "./DateRangeFilter";
import { MetricsData, calcKPIs, formatBRL, formatPercent, formatNumber } from "@/lib/types";

interface Props {
  data: MetricsData;
}

type MetricKey = "investimento" | "leads" | "vendas" | "valorVendas";

// Helper: get month name from date string
function getMonthFromDate(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

// Helper: format date for display
function formatDateBR(d: string) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// Helper: get today in yyyy-mm-dd
function today() {
  return new Date().toISOString().split("T")[0];
}

// Helper: get date N days ago in yyyy-mm-dd
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

export default function TabVisaoGeral({ data }: Props) {
  const kpis = calcKPIs(data.semanas, data.config.metas, data.config.vgv);

  const [expandedKPI, setExpandedKPI] = useState<MetricKey | null>(null);
  const [detailView, setDetailView] = useState<"tabela" | "grafico">("tabela");

  // ---------- All weekly data ----------
  const allWeeklyData = useMemo(() => {
    return data.semanas.map((s) => {
      let inv = 0, leads = 0, vendas = 0, valor = 0;
      let lq = 0, comp = 0;
      for (const c of Object.values(s.canais)) {
        inv += c.investimento;
        leads += c.leads;
        vendas += c.vendas;
        valor += c.valorVendas;
        lq += c.leadsQualificados;
        comp += c.comparecimentos;
      }
      // Format: "01-07 Mar"
      const formatWeekName = () => {
        if (!s.inicio || !s.fim) return `S${s.semana}`;
        const di = new Date(s.inicio + "T00:00:00");
        const df = new Date(s.fim + "T00:00:00");
        const dayI = di.toLocaleDateString("pt-BR", { day: "2-digit" });
        const dayF = df.toLocaleDateString("pt-BR", { day: "2-digit" });
        const monthF = df.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
        return `${dayI}-${dayF} ${monthF.charAt(0).toUpperCase() + monthF.slice(1)}`;
      };
      return {
        semana: s.semana,
        name: formatWeekName(),
        inicio: s.inicio,
        fim: s.fim,
        investimento: inv,
        leads,
        vendas,
        valorVendas: valor,
        leadsQualificados: lq,
        comparecimentos: comp,
      };
    });
  }, [data.semanas]);

  // ---------- Date bounds ----------
  const minDate = allWeeklyData.length > 0 ? allWeeklyData[0].inicio : "2020-01-01";
  const maxDate = allWeeklyData.length > 0 ? allWeeklyData[allWeeklyData.length - 1].fim : today();

  // ---------- Global filter (KPIs + Funnel) ----------
  const [globalStart, setGlobalStart] = useState(minDate);
  const [globalEnd, setGlobalEnd] = useState(maxDate);
  const [globalQuick, setGlobalQuick] = useState<number | "total" | null>("total");

  // ---------- Chart filters (independent) ----------
  const [leadsStart, setLeadsStart] = useState(minDate);
  const [leadsEnd, setLeadsEnd] = useState(maxDate);
  const [leadsQuick, setLeadsQuick] = useState<number | "total" | null>("total");

  const [receitaStart, setReceitaStart] = useState(minDate);
  const [receitaEnd, setReceitaEnd] = useState(maxDate);
  const [receitaQuick, setReceitaQuick] = useState<number | "total" | null>("total");

  // ---------- Quick select handler factory ----------
  const makeQuickHandler = useCallback((
    setStart: (v: string) => void,
    setEnd: (v: string) => void,
    setQuick: (v: number | "total" | null) => void,
  ) => (days: number | "total") => {
    setQuick(days);
    if (days === "total") {
      setStart(minDate);
      setEnd(maxDate);
    } else {
      setStart(daysAgo(days));
      setEnd(today());
    }
  }, [minDate, maxDate]);

  // ---------- Filter weekly data by date range ----------
  const filterByDateRange = useCallback((start: string, end: string) => {
    return allWeeklyData.filter((w) => {
      if (!w.inicio || !w.fim) return true;
      return w.fim >= start && w.inicio <= end;
    });
  }, [allWeeklyData]);

  // ---------- Filtered datasets ----------
  const globalData = useMemo(() => filterByDateRange(globalStart, globalEnd), [filterByDateRange, globalStart, globalEnd]);
  const leadsChartData = useMemo(() => filterByDateRange(leadsStart, leadsEnd), [filterByDateRange, leadsStart, leadsEnd]);
  const receitaChartData = useMemo(() => filterByDateRange(receitaStart, receitaEnd), [filterByDateRange, receitaStart, receitaEnd]);

  // ---------- Monthly grouped data (for detail panel) ----------
  const monthlyData = useMemo(() => {
    const groups: Record<string, {
      month: string;
      investimento: number;
      leads: number;
      vendas: number;
      valorVendas: number;
      leadsQualificados: number;
      comparecimentos: number;
      weeks: number;
    }> = {};

    for (const w of globalData) {
      const month = getMonthFromDate(w.inicio) || `S${w.semana}`;
      if (!groups[month]) {
        groups[month] = { month, investimento: 0, leads: 0, vendas: 0, valorVendas: 0, leadsQualificados: 0, comparecimentos: 0, weeks: 0 };
      }
      groups[month].investimento += w.investimento;
      groups[month].leads += w.leads;
      groups[month].vendas += w.vendas;
      groups[month].valorVendas += w.valorVendas;
      groups[month].leadsQualificados += w.leadsQualificados;
      groups[month].comparecimentos += w.comparecimentos;
      groups[month].weeks++;
    }

    return Object.values(groups);
  }, [globalData]);

  // ---------- Filtered totals (global) ----------
  const filteredTotals = useMemo(() => {
    return globalData.reduce(
      (acc, w) => ({
        investimento: acc.investimento + w.investimento,
        leads: acc.leads + w.leads,
        vendas: acc.vendas + w.vendas,
        valorVendas: acc.valorVendas + w.valorVendas,
        leadsQualificados: acc.leadsQualificados + w.leadsQualificados,
        comparecimentos: acc.comparecimentos + w.comparecimentos,
      }),
      { investimento: 0, leads: 0, vendas: 0, valorVendas: 0, leadsQualificados: 0, comparecimentos: 0 }
    );
  }, [globalData]);

  // ---------- Funnel totals ----------
  const funnelTotals = useMemo(() => {
    return {
      leads: filteredTotals.leads,
      lq: filteredTotals.leadsQualificados,
      comp: filteredTotals.comparecimentos,
      vendas: filteredTotals.vendas,
    };
  }, [filteredTotals]);

  // ---------- KPI statuses ----------
  const cplStatus = kpis.cpl === 0 ? "neutral" as const : kpis.cpl <= kpis.metaCpl ? "good" as const : "bad" as const;
  const cacStatus = kpis.cac === 0 ? "neutral" as const : kpis.cac <= kpis.metaCac ? "good" as const : "bad" as const;
  const roiStatus = kpis.roi === 0 ? "neutral" as const : kpis.roi >= kpis.metaRoi ? "good" as const : "bad" as const;
  const vsoStatus = kpis.vso === 0 ? "neutral" as const : kpis.vso >= kpis.metaVso ? "good" as const : "bad" as const;

  // ---------- Tooltip shared style ----------
  const tooltipStyle = {
    contentStyle: {
      background: "var(--tooltip-bg)",
      border: "1px solid var(--tooltip-border)",
      borderRadius: "0.75rem",
      color: "var(--tooltip-text)",
    },
    labelStyle: { color: "var(--tooltip-label)" },
  };

  const axisTick = { fill: "var(--text-dim)", fontSize: 11 };

  // ---------- Toggle detail panel ----------
  function toggleDetail(key: MetricKey) {
    setExpandedKPI((prev) => (prev === key ? null : key));
    setDetailView("tabela");
  }

  // ---------- Metric config ----------
  const metricConfig: Record<MetricKey, { label: string; color: string; format: (v: number) => string }> = {
    investimento: { label: "Investimento", color: "#f4a236", format: formatBRL },
    leads: { label: "Leads", color: "#4285f4", format: formatNumber },
    vendas: { label: "Vendas", color: "#10b981", format: formatNumber },
    valorVendas: { label: "Receita", color: "#e94560", format: formatBRL },
  };

  // ---------- Render detail panel (table + chart) ----------
  function renderDetailPanel(key: MetricKey) {
    if (expandedKPI !== key) return null;
    const config = metricConfig[key];

    return (
      <div
        className="col-span-2 lg:col-span-4"
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
          borderRadius: "1rem",
          padding: "1.25rem",
          animation: "fadeIn 0.2s ease",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>
            {config.label.toUpperCase()} - DETALHAMENTO
          </h4>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDetailView("tabela")}
              style={{
                padding: "0.25rem 0.75rem",
                fontSize: "0.7rem",
                fontWeight: 600,
                borderRadius: "0.375rem",
                background: detailView === "tabela" ? config.color : "var(--surface)",
                color: detailView === "tabela" ? "#fff" : "var(--text-muted)",
                border: "1px solid var(--border)",
                cursor: "pointer",
              }}
            >
              <span className="flex items-center gap-1"><Table size={12} /> Tabela</span>
            </button>
            <button
              onClick={() => setDetailView("grafico")}
              style={{
                padding: "0.25rem 0.75rem",
                fontSize: "0.7rem",
                fontWeight: 600,
                borderRadius: "0.375rem",
                background: detailView === "grafico" ? config.color : "var(--surface)",
                color: detailView === "grafico" ? "#fff" : "var(--text-muted)",
                border: "1px solid var(--border)",
                cursor: "pointer",
              }}
            >
              <span className="flex items-center gap-1"><BarChart3 size={12} /> Grafico</span>
            </button>
            <button
              onClick={() => setExpandedKPI(null)}
              style={{
                padding: "0.25rem",
                borderRadius: "0.375rem",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                cursor: "pointer",
                color: "var(--text-dim)",
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {detailView === "tabela" ? (
          <div style={{ overflowX: "auto" }}>
            {/* Weekly Table */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)" }}>
                  <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", color: "var(--text-dim)", fontWeight: 600 }}>Semana</th>
                  <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", color: "var(--text-dim)", fontWeight: 600 }}>Periodo</th>
                  <th style={{ textAlign: "right", padding: "0.5rem 0.75rem", color: "var(--text-dim)", fontWeight: 600 }}>{config.label}</th>
                  <th style={{ textAlign: "right", padding: "0.5rem 0.75rem", color: "var(--text-dim)", fontWeight: 600 }}>Acumulado</th>
                  <th style={{ textAlign: "right", padding: "0.5rem 0.75rem", color: "var(--text-dim)", fontWeight: 600 }}>Var. %</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let accumulated = 0;
                  let lastMonth = "";
                  let monthAcc = 0;
                  const rows: React.ReactNode[] = [];

                  globalData.forEach((w, i) => {
                    const currentMonth = getMonthFromDate(w.inicio);
                    const val = w[key] as number;
                    const prevVal = i > 0 ? (globalData[i - 1][key] as number) : 0;
                    const variation = i > 0 && prevVal > 0 ? ((val - prevVal) / prevVal) * 100 : 0;
                    accumulated += val;

                    // Insert month subtotal row when month changes
                    if (lastMonth && currentMonth !== lastMonth) {
                      rows.push(
                        <tr key={`month-${lastMonth}`} style={{ background: "var(--surface)", fontWeight: 700 }}>
                          <td colSpan={2} style={{ padding: "0.5rem 0.75rem", color: config.color, fontSize: "0.75rem" }}>
                            Total {lastMonth.toUpperCase()}
                          </td>
                          <td style={{ textAlign: "right", padding: "0.5rem 0.75rem", color: config.color }}>
                            {config.format(monthAcc)}
                          </td>
                          <td colSpan={2} />
                        </tr>
                      );
                      monthAcc = 0;
                    }

                    monthAcc += val;
                    lastMonth = currentMonth;

                    const periodo = w.inicio && w.fim
                      ? `${formatDateBR(w.inicio)} - ${formatDateBR(w.fim)}`
                      : "\u2014";

                    rows.push(
                      <tr key={w.name} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "0.5rem 0.75rem", color: "var(--text)", fontWeight: 600 }}>{w.name}</td>
                        <td style={{ padding: "0.5rem 0.75rem", color: "var(--text-dim)", fontSize: "0.75rem" }}>{periodo}</td>
                        <td style={{ textAlign: "right", padding: "0.5rem 0.75rem", color: "var(--text)", fontWeight: 500 }}>{config.format(val)}</td>
                        <td style={{ textAlign: "right", padding: "0.5rem 0.75rem", color: "var(--text-dim)" }}>{config.format(accumulated)}</td>
                        <td style={{
                          textAlign: "right",
                          padding: "0.5rem 0.75rem",
                          color: i === 0 ? "var(--text-dim)" : variation >= 0 ? "#10b981" : "#e94560",
                          fontWeight: 600,
                        }}>
                          {i === 0 ? "\u2014" : `${variation >= 0 ? "+" : ""}${variation.toFixed(1)}%`}
                        </td>
                      </tr>
                    );
                  });

                  // Last month subtotal
                  if (lastMonth) {
                    rows.push(
                      <tr key={`month-${lastMonth}-last`} style={{ background: "var(--surface)", fontWeight: 700 }}>
                        <td colSpan={2} style={{ padding: "0.5rem 0.75rem", color: config.color, fontSize: "0.75rem" }}>
                          Total {lastMonth.toUpperCase()}
                        </td>
                        <td style={{ textAlign: "right", padding: "0.5rem 0.75rem", color: config.color }}>
                          {config.format(monthAcc)}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    );
                  }

                  // Grand total
                  rows.push(
                    <tr key="grand-total" style={{ background: config.color + "15", fontWeight: 700, borderTop: "2px solid " + config.color }}>
                      <td colSpan={2} style={{ padding: "0.625rem 0.75rem", color: config.color }}>
                        TOTAL GERAL
                      </td>
                      <td style={{ textAlign: "right", padding: "0.625rem 0.75rem", color: config.color, fontSize: "0.9rem" }}>
                        {config.format(accumulated)}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  );

                  return rows;
                })()}
              </tbody>
            </table>

            {/* Monthly summary cards */}
            {monthlyData.length > 1 && (
              <div className="mt-4">
                <h5 className="text-xs font-bold mb-2" style={{ color: "var(--text-dim)" }}>RESUMO MENSAL</h5>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {monthlyData.map((m) => (
                    <div key={m.month} className="p-3 rounded-lg" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                      <p className="text-xs font-semibold" style={{ color: "var(--text-dim)" }}>{m.month.toUpperCase()}</p>
                      <p className="text-base font-bold" style={{ color: config.color }}>{config.format(m[key] as number)}</p>
                      <p className="text-xs" style={{ color: "var(--text-dim)" }}>{m.weeks} semana{m.weeks > 1 ? "s" : ""}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Evolution Chart */
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={globalData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="name" tick={axisTick} />
              <YAxis
                tick={axisTick}
                tickFormatter={(v: number) =>
                  key === "leads" || key === "vendas"
                    ? formatNumber(v)
                    : v >= 1000000 ? (v / 1000000).toFixed(1) + "M" : v >= 1000 ? (v / 1000).toFixed(0) + "K" : String(v)
                }
              />
              <Tooltip {...tooltipStyle} formatter={(v) => config.format(Number(v ?? 0))} />
              <Bar dataKey={key} name={config.label} fill={config.color} radius={[4, 4, 0, 0]} opacity={0.7} />
              <Line type="monotone" dataKey={key} name="Tendencia" stroke={config.color} strokeWidth={2.5} dot={{ r: 4, fill: config.color }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    );
  }

  // ---------- Funnel helpers ----------
  function funnelRate(from: number, to: number) {
    return from > 0 ? ((to / from) * 100).toFixed(1) + "%" : "--";
  }

  // ---------- Empty state ----------
  if (allWeeklyData.length === 0) {
    return (
      <div className="kpi-card text-center py-12">
        <p className="text-lg font-bold" style={{ color: "var(--text-dim)" }}>
          Nenhum dado inserido ainda
        </p>
        <p className="text-sm mt-2" style={{ color: "var(--text-dim)" }}>
          Use a aba &quot;Inserir Dados&quot; para adicionar as metricas semanais.
        </p>
      </div>
    );
  }

  // ---------- Render ----------
  return (
    <div className="space-y-6">
      {/* ===== Global Date Range Filter ===== */}
      <DateRangeFilter
        startDate={globalStart}
        endDate={globalEnd}
        onStartChange={(d) => { setGlobalStart(d); setGlobalQuick(null); }}
        onEndChange={(d) => { setGlobalEnd(d); setGlobalQuick(null); }}
        onQuickSelect={makeQuickHandler(setGlobalStart, setGlobalEnd, setGlobalQuick)}
        activeQuick={globalQuick}
      />

      {/* ===== 1. KPI Cards - Main (clickable) ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div onClick={() => toggleDetail("investimento")} style={{ cursor: "pointer" }}>
          <KPICard
            label="Investimento Total"
            value={formatBRL(filteredTotals.investimento)}
            icon={
              <span className="flex items-center gap-1">
                <DollarSign size={14} style={{ color: "#f4a236" }} />
                {expandedKPI === "investimento" ? <ChevronUp size={12} style={{ color: "var(--text-dim)" }} /> : <ChevronDown size={12} style={{ color: "var(--text-dim)" }} />}
              </span>
            }
          />
        </div>

        <div onClick={() => toggleDetail("leads")} style={{ cursor: "pointer" }}>
          <KPICard
            label="Total de Leads"
            value={formatNumber(filteredTotals.leads)}
            icon={
              <span className="flex items-center gap-1">
                <Users size={14} style={{ color: "#4285f4" }} />
                {expandedKPI === "leads" ? <ChevronUp size={12} style={{ color: "var(--text-dim)" }} /> : <ChevronDown size={12} style={{ color: "var(--text-dim)" }} />}
              </span>
            }
          />
        </div>

        <div onClick={() => toggleDetail("vendas")} style={{ cursor: "pointer" }}>
          <KPICard
            label="Vendas Realizadas"
            value={formatNumber(filteredTotals.vendas)}
            icon={
              <span className="flex items-center gap-1">
                <ShoppingCart size={14} style={{ color: "#10b981" }} />
                {expandedKPI === "vendas" ? <ChevronUp size={12} style={{ color: "var(--text-dim)" }} /> : <ChevronDown size={12} style={{ color: "var(--text-dim)" }} />}
              </span>
            }
          />
        </div>

        <div onClick={() => toggleDetail("valorVendas")} style={{ cursor: "pointer" }}>
          <KPICard
            label="Receita Total"
            value={formatBRL(filteredTotals.valorVendas)}
            icon={
              <span className="flex items-center gap-1">
                <Target size={14} style={{ color: "#e94560" }} />
                {expandedKPI === "valorVendas" ? <ChevronUp size={12} style={{ color: "var(--text-dim)" }} /> : <ChevronDown size={12} style={{ color: "var(--text-dim)" }} />}
              </span>
            }
          />
        </div>

        {/* Detail panel renders below the KPI row */}
        {expandedKPI && renderDetailPanel(expandedKPI)}
      </div>

      {/* ===== 2. Secondary KPIs with metas ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="CPL" value={kpis.cpl > 0 ? formatBRL(kpis.cpl) : "--"} meta={`\u2264 ${formatBRL(kpis.metaCpl)}`} status={cplStatus} />
        <KPICard label="CAC" value={kpis.cac > 0 ? formatBRL(kpis.cac) : "--"} meta={`\u2264 ${formatBRL(kpis.metaCac)}`} status={cacStatus} />
        <KPICard label="ROI" value={kpis.roi > 0 ? kpis.roi.toFixed(1) + "x" : "--"} meta={`\u2265 ${kpis.metaRoi}x`} status={roiStatus} />
        <KPICard label="VSO" value={kpis.vso > 0 ? formatPercent(kpis.vso) : "--"} meta={`\u2265 ${kpis.metaVso}%`} status={vsoStatus} />
      </div>

      {/* ===== 3. Chart: Leads x Vendas (independent filter) ===== */}
      <div className="space-y-3">
        <DateRangeFilter
          startDate={leadsStart}
          endDate={leadsEnd}
          onStartChange={(d) => { setLeadsStart(d); setLeadsQuick(null); }}
          onEndChange={(d) => { setLeadsEnd(d); setLeadsQuick(null); }}
          onQuickSelect={makeQuickHandler(setLeadsStart, setLeadsEnd, setLeadsQuick)}
          activeQuick={leadsQuick}
        />
        <div className="kpi-card">
          <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>
            LEADS x VENDAS POR SEMANA
          </h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={leadsChartData} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="name" tick={axisTick} />
              <YAxis yAxisId="left" tick={axisTick} />
              <YAxis yAxisId="right" orientation="right" tick={axisTick} />
              <Tooltip
                {...tooltipStyle}
                formatter={(value, name) => {
                  if (name === "Taxa Conv.") return Number(value ?? 0).toFixed(1) + "%";
                  return formatNumber(Number(value ?? 0));
                }}
              />
              <Legend wrapperStyle={{ color: "var(--text-muted)", fontSize: 12 }} />
              <Bar yAxisId="left" dataKey="leads" name="Leads" fill="#4285f4" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="left" dataKey="vendas" name="Vendas" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ===== 4. Chart: Receita x Investimento (independent filter) ===== */}
      <div className="space-y-3">
        <DateRangeFilter
          startDate={receitaStart}
          endDate={receitaEnd}
          onStartChange={(d) => { setReceitaStart(d); setReceitaQuick(null); }}
          onEndChange={(d) => { setReceitaEnd(d); setReceitaQuick(null); }}
          onQuickSelect={makeQuickHandler(setReceitaStart, setReceitaEnd, setReceitaQuick)}
          activeQuick={receitaQuick}
        />
        <div className="kpi-card">
          <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>
            RECEITA x INVESTIMENTO
          </h3>
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={receitaChartData}>
              <defs>
                <linearGradient id="gradReceita" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="gradInvestimento" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#e94560" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#e94560" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="name" tick={axisTick} />
              <YAxis
                tick={axisTick}
                tickFormatter={(v: number) =>
                  v >= 1000000 ? (v / 1000000).toFixed(1) + "M" : v >= 1000 ? (v / 1000).toFixed(0) + "K" : String(v)
                }
              />
              <Tooltip {...tooltipStyle} formatter={(v) => formatBRL(Number(v ?? 0))} />
              <Legend wrapperStyle={{ color: "var(--text-muted)", fontSize: 12 }} />
              <Area type="monotone" dataKey="valorVendas" name="Receita (R$)" stroke="#10b981" strokeWidth={2} fill="url(#gradReceita)" />
              <Area type="monotone" dataKey="investimento" name="Investimento (R$)" stroke="#e94560" strokeWidth={2} fill="url(#gradInvestimento)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ===== 5. Sales Funnel ===== */}
      <div className="kpi-card">
        <h3 className="text-sm font-bold mb-6" style={{ color: "var(--text-muted)" }}>
          FUNIL DE VENDAS
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
          {(() => {
            const stages = [
              { label: "Total Leads", value: funnelTotals.leads, color: "#4285f4" },
              { label: "Leads Qualificados", value: funnelTotals.lq, color: "#8b5cf6" },
              { label: "Comparecimentos", value: funnelTotals.comp, color: "#f4a236" },
              { label: "Vendas", value: funnelTotals.vendas, color: "#10b981" },
            ];
            const maxValue = Math.max(funnelTotals.leads, 1);

            return stages.map((stage, i) => {
              const widthPct = Math.max((stage.value / maxValue) * 100, 8);
              const nextStage = stages[i + 1];

              return (
                <div key={stage.label}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: nextStage ? "0.25rem" : 0 }}>
                    <div style={{ width: "140px", flexShrink: 0, textAlign: "right", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)" }}>
                      {stage.label}
                    </div>
                    <div style={{ flex: 1, position: "relative" }}>
                      <div
                        style={{
                          width: `${widthPct}%`,
                          height: "36px",
                          background: stage.color,
                          borderRadius: "0.375rem",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minWidth: "60px",
                          transition: "width 0.5s ease",
                        }}
                      >
                        <span style={{ color: "#fff", fontSize: "0.8rem", fontWeight: 700 }}>
                          {formatNumber(stage.value)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {nextStage && (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.25rem" }}>
                      <div style={{ width: "140px", flexShrink: 0 }} />
                      <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-dim)", paddingLeft: "0.5rem" }}>
                        {"\u2193"} {funnelRate(stage.value, nextStage.value)}
                      </div>
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      </div>
    </div>
  );
}
