"use client";

import { useState, useMemo, useCallback, Fragment } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronRight } from "lucide-react";
import { MetricsData, calcKPIsPorCanal, formatBRL, formatNumber } from "@/lib/types";
import DateRangeFilter from "./DateRangeFilter";

interface Props {
  data: MetricsData;
}

const COLORS = ["#e94560", "#4285f4", "#10b981", "#f4a236", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316"];

type SortKey = "canal" | "investimento" | "leads" | "vendas" | "valorVendas" | "cpl" | "cac" | "roi";
type SortDir = "asc" | "desc";

function roiColor(roi: number): string {
  if (roi > 3) return "#10b981";
  if (roi >= 1) return "#f4a236";
  return "#e94560";
}

function cplColor(cpl: number): string {
  if (cpl <= 0) return "var(--text-dim)";
  if (cpl <= 50) return "#10b981";
  if (cpl <= 100) return "#f4a236";
  return "#e94560";
}

function today() { return new Date().toISOString().split("T")[0]; }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split("T")[0]; }

export default function TabCanais({ data }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("investimento");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedCanal, setExpandedCanal] = useState<string | null>(null);

  // Date bounds from data
  const minDate = data.semanas.length > 0 ? data.semanas[0].inicio : "2020-01-01";
  const maxDate = data.semanas.length > 0 ? data.semanas[data.semanas.length - 1].fim : today();

  const [startDate, setStartDate] = useState(minDate);
  const [endDate, setEndDate] = useState(maxDate);
  const [activeQuick, setActiveQuick] = useState<number | "total" | null>("total");

  const handleQuickSelect = useCallback((value: number | "total") => {
    setActiveQuick(value);
    if (value === "total") {
      setStartDate(minDate);
      setEndDate(maxDate);
    } else {
      setStartDate(daysAgo(value));
      setEndDate(today());
    }
  }, [minDate, maxDate]);

  // Filter semanas by date range
  const filteredSemanas = useMemo(() => {
    return data.semanas.filter((s) => {
      if (!s.inicio || !s.fim) return true;
      return s.fim >= startDate && s.inicio <= endDate;
    });
  }, [data.semanas, startDate, endDate]);

  const canalStats = useMemo(() => {
    return data.config.canais.map((canal, i) => {
      const stats = calcKPIsPorCanal(filteredSemanas, canal);
      return { canal, ...stats, color: COLORS[i % COLORS.length] };
    });
  }, [filteredSemanas, data.config.canais]);

  const sortedStats = useMemo(() => {
    const arr = [...canalStats];
    arr.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return arr;
  }, [canalStats, sortKey, sortDir]);

  const hasData = canalStats.some((c) => c.investimento > 0 || c.leads > 0);

  const pieLeads = useMemo(
    () => canalStats.filter((c) => c.leads > 0).map((c) => ({ name: c.canal, value: c.leads, color: c.color })),
    [canalStats],
  );

  const barInvestimento = useMemo(
    () =>
      [...canalStats]
        .filter((c) => c.investimento > 0)
        .sort((a, b) => b.investimento - a.investimento),
    [canalStats],
  );

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortArrow = (key: SortKey) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " \u25B2" : " \u25BC";
  };

  // Weekly detail data for expanded canal
  const weeklyDetail = useMemo(() => {
    if (!expandedCanal) return null;
    const weekly = filteredSemanas.map((s) => {
      const c = s.canais[expandedCanal];
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
        semana: formatWeekName(),
        leads: c?.leads ?? 0,
        vendas: c?.vendas ?? 0,
        investimento: c?.investimento ?? 0,
      };
    });

    if (weekly.length === 0) return null;

    let bestWeek = weekly[0];
    let worstWeek = weekly[0];
    for (const w of weekly) {
      if (w.leads > bestWeek.leads) bestWeek = w;
      if (w.leads < worstWeek.leads) worstWeek = w;
    }

    const mid = Math.floor(weekly.length / 2) || 1;
    const firstHalf = weekly.slice(0, mid).reduce((s, w) => s + w.leads, 0) / mid;
    const secondHalf = weekly.slice(mid).reduce((s, w) => s + w.leads, 0) / (weekly.length - mid);
    const trend = secondHalf > firstHalf * 1.05 ? "up" : secondHalf < firstHalf * 0.95 ? "down" : "stable";

    return { weekly, bestWeek, worstWeek, trend };
  }, [expandedCanal, filteredSemanas]);

  const tooltipStyle = {
    contentStyle: {
      background: "var(--tooltip-bg)",
      border: "1px solid var(--tooltip-border)",
      borderRadius: "0.75rem",
      color: "var(--tooltip-text)",
    },
    labelStyle: { color: "var(--tooltip-label)" },
  };

  const metas = data.config.metas;

  if (!hasData) {
    return (
      <div className="kpi-card text-center py-12">
        <p className="text-lg font-bold" style={{ color: "var(--text-dim)" }}>Nenhum dado por canal ainda</p>
        <p className="text-sm mt-2" style={{ color: "var(--text-dim)" }}>
          Insira dados semanais para ver a performance por canal.
        </p>
      </div>
    );
  }

  const thStyle = (key: SortKey, align: "left" | "right" = "right"): React.CSSProperties => ({
    color: sortKey === key ? "var(--text)" : "var(--text-dim)",
    cursor: "pointer",
    userSelect: "none",
    textAlign: align,
  });

  return (
    <div className="space-y-6">
      {/* Date Range Filter */}
      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onStartChange={(d) => { setStartDate(d); setActiveQuick(null); }}
        onEndChange={(d) => { setEndDate(d); setActiveQuick(null); }}
        onQuickSelect={handleQuickSelect}
        activeQuick={activeQuick}
      />

      {/* Sortable summary table */}
      <div className="kpi-card overflow-x-auto">
        <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>
          PERFORMANCE POR CANAL
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th className="py-3 px-2 font-semibold" style={thStyle("canal", "left")} onClick={() => handleSort("canal")}>
                Canal{sortArrow("canal")}
              </th>
              <th className="py-3 px-2 font-semibold" style={thStyle("investimento")} onClick={() => handleSort("investimento")}>
                Investimento{sortArrow("investimento")}
              </th>
              <th className="py-3 px-2 font-semibold" style={thStyle("leads")} onClick={() => handleSort("leads")}>
                Leads{sortArrow("leads")}
              </th>
              <th className="py-3 px-2 font-semibold" style={thStyle("vendas")} onClick={() => handleSort("vendas")}>
                Vendas{sortArrow("vendas")}
              </th>
              <th className="py-3 px-2 font-semibold" style={thStyle("valorVendas")} onClick={() => handleSort("valorVendas")}>
                Receita{sortArrow("valorVendas")}
              </th>
              <th className="py-3 px-2 font-semibold" style={thStyle("cpl")} onClick={() => handleSort("cpl")}>
                CPL{sortArrow("cpl")}
              </th>
              <th className="py-3 px-2 font-semibold" style={thStyle("cac")} onClick={() => handleSort("cac")}>
                CAC{sortArrow("cac")}
              </th>
              <th className="py-3 px-2 font-semibold" style={thStyle("roi")} onClick={() => handleSort("roi")}>
                ROI{sortArrow("roi")}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedStats.map((c) => {
              const isExpanded = expandedCanal === c.canal;
              return (
                <Fragment key={c.canal}>
                  <tr
                    style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                    className="hover:bg-white/[0.02]"
                    onClick={() => setExpandedCanal(isExpanded ? null : c.canal)}
                  >
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown size={14} style={{ color: "var(--text-dim)" }} />
                        ) : (
                          <ChevronRight size={14} style={{ color: "var(--text-dim)" }} />
                        )}
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.color }} />
                        <span style={{ color: "var(--text)" }}>{c.canal}</span>
                      </div>
                    </td>
                    <td className="text-right py-3 px-2" style={{ color: "var(--text)" }}>{formatBRL(c.investimento)}</td>
                    <td className="text-right py-3 px-2" style={{ color: "var(--text)" }}>{formatNumber(c.leads)}</td>
                    <td className="text-right py-3 px-2" style={{ color: "var(--text)" }}>{formatNumber(c.vendas)}</td>
                    <td className="text-right py-3 px-2" style={{ color: "var(--text)" }}>{formatBRL(c.valorVendas)}</td>
                    <td className="text-right py-3 px-2" style={{ color: cplColor(c.cpl) }}>
                      {c.cpl > 0 ? formatBRL(c.cpl) : "\u2014"}
                    </td>
                    <td className="text-right py-3 px-2" style={{ color: c.cac > 0 ? "var(--text)" : "var(--text-dim)" }}>
                      {c.cac > 0 ? formatBRL(c.cac) : "\u2014"}
                    </td>
                    <td className="text-right py-3 px-2" style={{ color: c.roi > 0 ? roiColor(c.roi) : "var(--text-dim)" }}>
                      {c.roi > 0 ? c.roi.toFixed(1) + "x" : "\u2014"}
                    </td>
                  </tr>
                  {isExpanded && weeklyDetail && (
                    <tr>
                      <td colSpan={8} style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
                        <div className="p-4 space-y-4">
                          <div className="flex flex-wrap gap-6 text-sm">
                            <div>
                              <span style={{ color: "var(--text-dim)" }}>Melhor semana: </span>
                              <span style={{ color: "#10b981" }}>
                                {weeklyDetail.bestWeek.semana} ({weeklyDetail.bestWeek.leads} leads)
                              </span>
                            </div>
                            <div>
                              <span style={{ color: "var(--text-dim)" }}>Pior semana: </span>
                              <span style={{ color: "#e94560" }}>
                                {weeklyDetail.worstWeek.semana} ({weeklyDetail.worstWeek.leads} leads)
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span style={{ color: "var(--text-dim)" }}>Tendência: </span>
                              {weeklyDetail.trend === "up" && (
                                <span className="flex items-center gap-1" style={{ color: "#10b981" }}>
                                  <TrendingUp size={14} /> Em alta
                                </span>
                              )}
                              {weeklyDetail.trend === "down" && (
                                <span className="flex items-center gap-1" style={{ color: "#e94560" }}>
                                  <TrendingDown size={14} /> Em queda
                                </span>
                              )}
                              {weeklyDetail.trend === "stable" && (
                                <span className="flex items-center gap-1" style={{ color: "#f4a236" }}>
                                  <Minus size={14} /> Estável
                                </span>
                              )}
                            </div>
                          </div>
                          {weeklyDetail.weekly.length > 1 && (
                            <ResponsiveContainer width="100%" height={200}>
                              <LineChart data={weeklyDetail.weekly}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                                <XAxis dataKey="semana" tick={{ fill: "var(--text-dim)", fontSize: 11 }} />
                                <YAxis tick={{ fill: "var(--text-dim)", fontSize: 11 }} />
                                <Tooltip {...tooltipStyle} />
                                <Legend wrapperStyle={{ color: "var(--text-muted)", fontSize: 11 }} />
                                <Line type="monotone" dataKey="leads" name="Leads" stroke="#4285f4" strokeWidth={2} dot={{ r: 3 }} />
                                <Line type="monotone" dataKey="vendas" name="Vendas" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                              </LineChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            <tr style={{ borderTop: "2px solid var(--border)" }}>
              <td className="py-3 px-2 font-semibold" style={{ color: "var(--text-muted)" }}>
                <div className="flex items-center gap-2 pl-5">Meta</div>
              </td>
              <td className="text-right py-3 px-2" style={{ color: "var(--text-dim)" }}>{"\u2014"}</td>
              <td className="text-right py-3 px-2" style={{ color: "var(--text-dim)" }}>{"\u2014"}</td>
              <td className="text-right py-3 px-2" style={{ color: "var(--text-dim)" }}>{"\u2014"}</td>
              <td className="text-right py-3 px-2" style={{ color: "var(--text-dim)" }}>{"\u2014"}</td>
              <td className="text-right py-3 px-2 font-semibold" style={{ color: "var(--text-muted)" }}>
                {formatBRL(metas.cpl)}
              </td>
              <td className="text-right py-3 px-2 font-semibold" style={{ color: "var(--text-muted)" }}>
                {formatBRL(metas.cac)}
              </td>
              <td className="text-right py-3 px-2 font-semibold" style={{ color: "var(--text-muted)" }}>
                {metas.roi.toFixed(1)}x
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Distribution charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {pieLeads.length > 0 && (
          <div className="kpi-card">
            <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>LEADS POR CANAL</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieLeads}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                  fontSize={10}
                >
                  {pieLeads.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {barInvestimento.length > 0 && (
          <div className="kpi-card">
            <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>INVESTIMENTO POR CANAL</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barInvestimento} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis type="number" tick={{ fill: "var(--text-dim)", fontSize: 11 }} />
                <YAxis dataKey="canal" type="category" tick={{ fill: "var(--text-muted)", fontSize: 11 }} width={110} />
                <Tooltip {...tooltipStyle} formatter={(value) => formatBRL(Number(value ?? 0))} />
                <Bar dataKey="investimento" name="Investimento (R$)" radius={[0, 4, 4, 0]}>
                  {barInvestimento.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
