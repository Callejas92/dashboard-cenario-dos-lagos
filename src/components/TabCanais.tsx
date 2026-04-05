"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell,
} from "recharts";
import { RefreshCw } from "lucide-react";
import { MetricsData, formatBRL, formatNumber } from "@/lib/types";
import DateRangeFilter from "./DateRangeFilter";

interface Props {
  data: MetricsData;
}

interface CanalData {
  investimento: number;
  leads: number;
  leadsQualificados: number;
  vendas: number;
  valorVendas: number;
  source: "api" | "manual";
}

interface CanaisAPIData {
  dateFrom: string;
  dateTo: string;
  canais: Record<string, CanalData>;
  kpis: {
    totalLeads: number;
    totalInvestimento: number;
    totalVendas: number;
    totalValorVendas: number;
    cpl: number;
    cac: number;
    roi: number;
  };
  metaExtras: {
    reach: number;
    impressions: number;
    clicks: number;
    ctr: number;
    cpc: number;
  };
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
  const [startDate, setStartDate] = useState(() => daysAgo(30));
  const [endDate, setEndDate] = useState(today);
  const [activeQuick, setActiveQuick] = useState<number | "total" | null>(30);
  const [apiData, setApiData] = useState<CanaisAPIData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/canais?from=${startDate}&to=${endDate}`);
      const json = await res.json();
      setApiData(json);
    } catch { /* ignore */ }
    setLoading(false);
  }, [startDate, endDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleQuickSelect = useCallback((value: number | "total") => {
    setActiveQuick(value);
    if (value === "total") {
      setStartDate(daysAgo(365));
      setEndDate(today());
    } else {
      setStartDate(daysAgo(value));
      setEndDate(today());
    }
  }, []);

  const metas = data.config.metas;
  const canaisConfig = data.config.canais;

  const canalStats = useMemo(() => {
    return canaisConfig.map((canal, i) => {
      const d = apiData?.canais[canal] || { investimento: 0, leads: 0, leadsQualificados: 0, vendas: 0, valorVendas: 0, source: "api" as const };
      const cpl = d.investimento > 0 && d.leads > 0 ? d.investimento / d.leads : 0;
      const cac = d.investimento > 0 && d.vendas > 0 ? d.investimento / d.vendas : 0;
      const roi = d.investimento > 0 && d.valorVendas > 0 ? d.valorVendas / d.investimento : 0;
      return { canal, ...d, cpl, cac, roi, color: COLORS[i % COLORS.length] };
    });
  }, [canaisConfig, apiData]);

  const sortedStats = useMemo(() => {
    const arr = [...canalStats];
    arr.sort((a, b) => {
      const aVal = a[sortKey as keyof typeof a] as number | string;
      const bVal = b[sortKey as keyof typeof b] as number | string;
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return arr;
  }, [canalStats, sortKey, sortDir]);

  const pieLeads = useMemo(
    () => canalStats.filter((c) => c.leads > 0).map((c) => ({ name: c.canal, value: c.leads, color: c.color })),
    [canalStats],
  );

  const barInvestimento = useMemo(
    () => [...canalStats].filter((c) => c.investimento > 0).sort((a, b) => b.investimento - a.investimento),
    [canalStats],
  );

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sortArrow = (key: SortKey) => sortKey !== key ? "" : sortDir === "asc" ? " ▲" : " ▼";

  const tooltipStyle = {
    contentStyle: { background: "var(--tooltip-bg)", border: "1px solid var(--tooltip-border)", borderRadius: "0.75rem", color: "var(--tooltip-text)" },
    labelStyle: { color: "var(--tooltip-label)" },
  };

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

      {/* KPIs globais */}
      {apiData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="kpi-card">
            <p className="text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>Investimento Total</p>
            <p className="text-xl font-bold" style={{ color: "var(--text)" }}>{formatBRL(apiData.kpis.totalInvestimento)}</p>
          </div>
          <div className="kpi-card">
            <p className="text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>Total Leads</p>
            <p className="text-xl font-bold" style={{ color: "var(--text)" }}>{formatNumber(apiData.kpis.totalLeads)}</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>CPL {formatBRL(apiData.kpis.cpl)}</p>
          </div>
          <div className="kpi-card">
            <p className="text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>Vendas (UAU)</p>
            <p className="text-xl font-bold" style={{ color: "var(--text)" }}>{apiData.kpis.totalVendas}</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>{formatBRL(apiData.kpis.totalValorVendas)}</p>
          </div>
          <div className="kpi-card">
            <p className="text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>ROI Médio</p>
            <p className="text-xl font-bold" style={{ color: apiData.kpis.roi > 0 ? roiColor(apiData.kpis.roi) : "var(--text)" }}>
              {apiData.kpis.roi > 0 ? `${apiData.kpis.roi.toFixed(1)}x` : "—"}
            </p>
          </div>
        </div>
      )}

      {/* Meta Ads extras */}
      {apiData && apiData.metaExtras.impressions > 0 && (
        <div className="kpi-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>META ADS — DETALHES</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
            <div>
              <p className="text-lg font-bold" style={{ color: "var(--text)" }}>{formatNumber(apiData.metaExtras.reach)}</p>
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>Alcance</p>
            </div>
            <div>
              <p className="text-lg font-bold" style={{ color: "var(--text)" }}>{formatNumber(apiData.metaExtras.impressions)}</p>
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>Impressões</p>
            </div>
            <div>
              <p className="text-lg font-bold" style={{ color: "var(--text)" }}>{formatNumber(apiData.metaExtras.clicks)}</p>
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>Cliques</p>
            </div>
            <div>
              <p className="text-lg font-bold" style={{ color: "var(--text)" }}>{apiData.metaExtras.ctr.toFixed(2)}%</p>
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>CTR</p>
            </div>
            <div>
              <p className="text-lg font-bold" style={{ color: "var(--text)" }}>{formatBRL(apiData.metaExtras.cpc)}</p>
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>CPC</p>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="kpi-card overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>PERFORMANCE POR CANAL</h3>
          <div className="flex items-center gap-2">
            {loading && <RefreshCw size={14} className="animate-spin" style={{ color: "var(--text-dim)" }} />}
            <button onClick={fetchData} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
              <RefreshCw size={14} style={{ color: "var(--text-dim)" }} />
            </button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th className="py-3 px-2 font-semibold" style={thStyle("canal", "left")} onClick={() => handleSort("canal")}>Canal{sortArrow("canal")}</th>
              <th className="py-3 px-2 font-semibold" style={thStyle("investimento")} onClick={() => handleSort("investimento")}>Investimento{sortArrow("investimento")}</th>
              <th className="py-3 px-2 font-semibold" style={thStyle("leads")} onClick={() => handleSort("leads")}>Leads{sortArrow("leads")}</th>
              <th className="py-3 px-2 font-semibold" style={thStyle("vendas")} onClick={() => handleSort("vendas")}>Vendas{sortArrow("vendas")}</th>
              <th className="py-3 px-2 font-semibold" style={thStyle("valorVendas")} onClick={() => handleSort("valorVendas")}>Receita{sortArrow("valorVendas")}</th>
              <th className="py-3 px-2 font-semibold" style={thStyle("cpl")} onClick={() => handleSort("cpl")}>CPL{sortArrow("cpl")}</th>
              <th className="py-3 px-2 font-semibold" style={thStyle("cac")} onClick={() => handleSort("cac")}>CAC{sortArrow("cac")}</th>
              <th className="py-3 px-2 font-semibold" style={thStyle("roi")} onClick={() => handleSort("roi")}>ROI{sortArrow("roi")}</th>
            </tr>
          </thead>
          <tbody>
            {sortedStats.map((c) => (
              <tr key={c.canal} style={{ borderBottom: "1px solid var(--border)" }} className="hover:bg-white/[0.02]">
                <td className="py-3 px-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.color }} />
                    <span style={{ color: "var(--text)" }}>{c.canal}</span>
                    {c.source === "api" && c.investimento > 0 && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: "#10b98120", color: "#10b981", fontSize: "10px" }}>API</span>
                    )}
                  </div>
                </td>
                <td className="text-right py-3 px-2" style={{ color: "var(--text)" }}>{formatBRL(c.investimento)}</td>
                <td className="text-right py-3 px-2" style={{ color: "var(--text)" }}>{formatNumber(c.leads)}</td>
                <td className="text-right py-3 px-2" style={{ color: "var(--text)" }}>{formatNumber(c.vendas)}</td>
                <td className="text-right py-3 px-2" style={{ color: "var(--text)" }}>{formatBRL(c.valorVendas)}</td>
                <td className="text-right py-3 px-2" style={{ color: cplColor(c.cpl) }}>{c.cpl > 0 ? formatBRL(c.cpl) : "—"}</td>
                <td className="text-right py-3 px-2" style={{ color: c.cac > 0 ? "var(--text)" : "var(--text-dim)" }}>{c.cac > 0 ? formatBRL(c.cac) : "—"}</td>
                <td className="text-right py-3 px-2" style={{ color: c.roi > 0 ? roiColor(c.roi) : "var(--text-dim)" }}>{c.roi > 0 ? c.roi.toFixed(1) + "x" : "—"}</td>
              </tr>
            ))}
            <tr style={{ borderTop: "2px solid var(--border)" }}>
              <td className="py-3 px-2 font-semibold" style={{ color: "var(--text-muted)" }}>
                <div className="flex items-center gap-2">Meta</div>
              </td>
              <td className="text-right py-3 px-2" style={{ color: "var(--text-dim)" }}>—</td>
              <td className="text-right py-3 px-2" style={{ color: "var(--text-dim)" }}>—</td>
              <td className="text-right py-3 px-2" style={{ color: "var(--text-dim)" }}>—</td>
              <td className="text-right py-3 px-2" style={{ color: "var(--text-dim)" }}>—</td>
              <td className="text-right py-3 px-2 font-semibold" style={{ color: "var(--text-muted)" }}>{formatBRL(metas.cpl)}</td>
              <td className="text-right py-3 px-2 font-semibold" style={{ color: "var(--text-muted)" }}>{formatBRL(metas.cac)}</td>
              <td className="text-right py-3 px-2 font-semibold" style={{ color: "var(--text-muted)" }}>{metas.roi.toFixed(1)}x</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {pieLeads.length > 0 && (
          <div className="kpi-card">
            <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>LEADS POR CANAL</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieLeads} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100}
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                  {pieLeads.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
        {barInvestimento.length > 0 && (
          <div className="kpi-card">
            <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>INVESTIMENTO POR CANAL</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={barInvestimento} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis type="number" tick={{ fill: "var(--text-dim)", fontSize: 11 }} tickFormatter={(v) => `R$${Number(v).toLocaleString("pt-BR")}`} />
                <YAxis dataKey="canal" type="category" tick={{ fill: "var(--text-muted)", fontSize: 11 }} width={110} />
                <Tooltip {...tooltipStyle} formatter={(v) => [formatBRL(Number(v)), "Investimento"]} />
                <Bar dataKey="investimento" name="Investimento" radius={[0, 4, 4, 0]}>
                  {barInvestimento.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
