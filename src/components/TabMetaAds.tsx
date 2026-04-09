"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, DollarSign, Eye, MousePointer, Users, TrendingUp, ChevronDown, ChevronUp, X, Table, BarChart3 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell,
} from "recharts";
import { formatNumber } from "@/lib/types";
import DateRangeFilter from "@/components/DateRangeFilter";

interface Campaign {
  campaignId: string;
  campaignName: string;
  reach: number;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
}

interface DailyData {
  date: string;
  reach: number;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
}

interface MetaAdsData {
  configured: boolean;
  message?: string;
  error?: string;
  dateFrom: string;
  dateTo: string;
  campaigns: Campaign[];
  daily: DailyData[];
  totals: {
    reach: number;
    impressions: number;
    clicks: number;
    spend: number;
    leads: number;
  };
  fetchedAt: string;
}

const COLORS = ["#1877f2", "#10b981", "#f59e0b", "#e94560", "#6366f1", "#8b5cf6", "#06b6d4"];

type MetaMetricKey = "spend" | "reach" | "impressions" | "clicks" | "leads" | "cpc";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function TabMetaAds() {
  const [data, setData] = useState<MetaAdsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("2026-04-14");
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [activeQuick, setActiveQuick] = useState<number | "total" | null>("total");
  const [expandedKPI, setExpandedKPI] = useState<MetaMetricKey | null>(null);
  const [detailView, setDetailView] = useState<"tabela" | "grafico">("tabela");

  const tooltipStyle = {
    contentStyle: { background: "var(--tooltip-bg)", border: "1px solid var(--border)", borderRadius: "0.75rem", color: "var(--text)" },
    labelStyle: { color: "var(--text-muted)" },
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("from", startDate);
      if (endDate) params.set("to", endDate);
      const res = await fetch(`/api/meta-ads?${params}`);
      const json = await res.json();
      if (!json.configured) {
        setError(json.message || "Meta Ads não configurado");
      } else if (json.error) {
        setError(json.error);
      } else {
        setData(json);
      }
    } catch (err) {
      setError(String(err));
    }
    setLoading(false);
  }, [startDate, endDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="text-center py-12">
        <RefreshCw size={24} className="animate-spin mx-auto mb-3" style={{ color: "#1877f2" }} />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Carregando dados do Meta Ads...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="kpi-card text-center py-12">
        <p className="text-sm" style={{ color: "#e94560" }}>{error}</p>
        <button onClick={fetchData} className="mt-3 px-4 py-2 rounded-lg text-sm" style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" }}>
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!data) return null;

  const cpl = data.totals.leads > 0 ? data.totals.spend / data.totals.leads : 0;
  const ctr = data.totals.impressions > 0 ? (data.totals.clicks / data.totals.impressions) * 100 : 0;
  const cpc = data.totals.clicks > 0 ? data.totals.spend / data.totals.clicks : 0;

  const daily = data.daily || [];

  const metricConfig: Record<MetaMetricKey, { label: string; color: string; format: (v: number) => string; getValue: (d: DailyData) => number }> = {
    spend:       { label: "Investimento", color: "#1877f2", format: formatCurrency,  getValue: (d) => d.spend },
    reach:       { label: "Alcance",      color: "#10b981", format: formatNumber,    getValue: (d) => d.reach },
    impressions: { label: "Impressões",   color: "#f59e0b", format: formatNumber,    getValue: (d) => d.impressions },
    clicks:      { label: "Cliques",      color: "#6366f1", format: formatNumber,    getValue: (d) => d.clicks },
    leads:       { label: "Leads",        color: "#e94560", format: formatNumber,    getValue: (d) => d.leads },
    cpc:         { label: "CPC",          color: "#8b5cf6", format: formatCurrency,  getValue: (d) => d.clicks > 0 ? d.spend / d.clicks : 0 },
  };

  function toggleKPI(key: MetaMetricKey) {
    setExpandedKPI((prev) => (prev === key ? null : key));
    setDetailView("tabela");
  }

  function renderDailyPanel(key: MetaMetricKey) {
    if (expandedKPI !== key) return null;
    const cfg = metricConfig[key];
    const dailyValues = daily.filter((d) => cfg.getValue(d) > 0).map((d) => ({
      date: d.date,
      dateLabel: new Date(d.date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      value: cfg.getValue(d),
    }));
    const total = dailyValues.reduce((s, d) => s + d.value, 0);

    return (
      <div
        className="col-span-2 sm:col-span-3 lg:col-span-6"
        style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: "1rem", padding: "1.25rem", animation: "fadeIn 0.2s ease" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>
            {cfg.label.toUpperCase()} — POR DIA
          </h4>
          <div className="flex items-center gap-2">
            {(["tabela", "grafico"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setDetailView(v)}
                style={{ padding: "0.25rem 0.75rem", fontSize: "0.7rem", fontWeight: 600, borderRadius: "0.375rem", background: detailView === v ? cfg.color : "var(--surface)", color: detailView === v ? "#fff" : "var(--text-muted)", border: "1px solid var(--border)", cursor: "pointer" }}
              >
                <span className="flex items-center gap-1">
                  {v === "tabela" ? <Table size={12} /> : <BarChart3 size={12} />}
                  {v === "tabela" ? "Tabela" : "Gráfico"}
                </span>
              </button>
            ))}
            <button onClick={() => setExpandedKPI(null)} style={{ padding: "0.25rem", borderRadius: "0.375rem", background: "var(--surface)", border: "1px solid var(--border)", cursor: "pointer", color: "var(--text-dim)" }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {detailView === "tabela" ? (
          dailyValues.length === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: "var(--text-dim)" }}>Sem dados no período</p>
          ) : (
            <div style={{ overflowX: "auto", maxHeight: "320px", overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border)", position: "sticky", top: 0, background: "var(--card-bg)" }}>
                    <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", color: "var(--text-dim)", fontWeight: 600 }}>Data</th>
                    <th style={{ textAlign: "right", padding: "0.5rem 0.75rem", color: "var(--text-dim)", fontWeight: 600 }}>{cfg.label}</th>
                    <th style={{ textAlign: "right", padding: "0.5rem 0.75rem", color: "var(--text-dim)", fontWeight: 600 }}>%</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyValues.map((d) => (
                    <tr key={d.date} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "0.5rem 0.75rem", color: "var(--text)", fontWeight: 500 }}>
                        {new Date(d.date + "T00:00:00").toLocaleDateString("pt-BR")}
                      </td>
                      <td style={{ textAlign: "right", padding: "0.5rem 0.75rem", color: "var(--text)", fontWeight: 500 }}>{cfg.format(d.value)}</td>
                      <td style={{ textAlign: "right", padding: "0.5rem 0.75rem", color: "var(--text-dim)" }}>{total > 0 ? ((d.value / total) * 100).toFixed(1) : "0"}%</td>
                    </tr>
                  ))}
                  <tr style={{ background: cfg.color + "15", fontWeight: 700, borderTop: "2px solid " + cfg.color }}>
                    <td style={{ padding: "0.625rem 0.75rem", color: cfg.color }}>TOTAL</td>
                    <td style={{ textAlign: "right", padding: "0.625rem 0.75rem", color: cfg.color, fontSize: "0.9rem" }}>{cfg.format(total)}</td>
                    <td style={{ textAlign: "right", padding: "0.625rem 0.75rem", color: cfg.color }}>100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )
        ) : (
          dailyValues.length === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: "var(--text-dim)" }}>Sem dados no período</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyValues}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="dateLabel" tick={{ fill: "var(--text-dim)", fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "var(--text-dim)", fontSize: 11 }} tickFormatter={(v) => cfg.format(Number(v))} />
                <Tooltip {...tooltipStyle} labelFormatter={(_, p) => p[0]?.payload?.date ? new Date(p[0].payload.date + "T00:00:00").toLocaleDateString("pt-BR") : ""} formatter={(v) => [cfg.format(Number(v)), cfg.label]} />
                <Bar dataKey="value" name={cfg.label} fill={cfg.color} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Date Filter */}
      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onStartChange={(d) => { setStartDate(d); setActiveQuick(null); }}
        onEndChange={(d) => { setEndDate(d); setActiveQuick(null); }}
        onQuickSelect={(days) => {
          setActiveQuick(days);
          if (days === "total") {
            setStartDate("2026-04-14");
            setEndDate(new Date().toISOString().split("T")[0]);
          } else {
            const end = new Date();
            const start = new Date();
            start.setDate(start.getDate() - days);
            setStartDate(start.toISOString().split("T")[0]);
            setEndDate(end.toISOString().split("T")[0]);
          }
        }}
        activeQuick={activeQuick}
      />

      {/* KPIs - Expandable */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {([
          { key: "spend" as MetaMetricKey, label: "Investimento", value: formatCurrency(data.totals.spend), sub: undefined as string | undefined, icon: DollarSign, color: "#1877f2" },
          { key: "reach" as MetaMetricKey, label: "Alcance", value: formatNumber(data.totals.reach), sub: undefined as string | undefined, icon: Users, color: "#10b981" },
          { key: "impressions" as MetaMetricKey, label: "Impressões", value: formatNumber(data.totals.impressions), sub: undefined as string | undefined, icon: Eye, color: "#f59e0b" },
          { key: "clicks" as MetaMetricKey, label: "Cliques", value: formatNumber(data.totals.clicks), sub: `CTR ${ctr.toFixed(2)}%` as string | undefined, icon: MousePointer, color: "#6366f1" },
          { key: "leads" as MetaMetricKey, label: "Leads", value: formatNumber(data.totals.leads), sub: `CPL ${formatCurrency(cpl)}` as string | undefined, icon: TrendingUp, color: "#e94560" },
          { key: "cpc" as MetaMetricKey, label: "CPC", value: formatCurrency(cpc), sub: undefined as string | undefined, icon: DollarSign, color: "#8b5cf6" },
        ]).map(({ key, label, value, sub, icon: Icon, color }) => (
          <div key={key} onClick={() => toggleKPI(key)} style={{ cursor: "pointer" }}>
            <div className="kpi-card">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
                  <Icon size={16} style={{ color }} />
                </div>
                <p className="text-xs font-medium" style={{ color: "var(--text-dim)" }}>{label}</p>
                {expandedKPI === key ? <ChevronUp size={12} style={{ color: "var(--text-dim)", marginLeft: "auto" }} /> : <ChevronDown size={12} style={{ color: "var(--text-dim)", marginLeft: "auto" }} />}
              </div>
              <p className="text-2xl font-bold" style={{ color: "var(--text)" }}>{value}</p>
              {sub && <p className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>{sub}</p>}
            </div>
          </div>
        ))}

        {expandedKPI && renderDailyPanel(expandedKPI)}
      </div>

      {/* Gráficos por campanha */}
      {data.campaigns.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Gasto por campanha */}
            <div className="kpi-card">
              <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>INVESTIMENTO POR CAMPANHA</h3>
              <ResponsiveContainer width="100%" height={Math.max(200, data.campaigns.length * 45)}>
                <BarChart data={data.campaigns.map(c => ({ nome: c.campaignName.length > 25 ? c.campaignName.slice(0, 25) + "…" : c.campaignName, valor: c.spend }))} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" tick={{ fill: "var(--text-dim)", fontSize: 11 }} tickFormatter={(v) => `R$${v.toFixed(0)}`} />
                  <YAxis dataKey="nome" type="category" tick={{ fill: "var(--text-muted)", fontSize: 10 }} width={180} />
                  <Tooltip {...tooltipStyle} formatter={(v) => [formatCurrency(Number(v)), "Investimento"]} />
                  <Bar dataKey="valor" fill="#1877f2" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Leads por campanha */}
            <div className="kpi-card">
              <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>LEADS POR CAMPANHA</h3>
              {data.campaigns.some(c => c.leads > 0) ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={data.campaigns.filter(c => c.leads > 0).map(c => ({ name: c.campaignName.length > 20 ? c.campaignName.slice(0, 20) + "…" : c.campaignName, value: c.leads }))}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, value }) => `${value}`}
                    >
                      {data.campaigns.filter(c => c.leads > 0).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip {...tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[220px]">
                  <p className="text-sm" style={{ color: "var(--text-dim)" }}>Sem leads no período</p>
                </div>
              )}
            </div>
          </div>

          {/* Tabela de campanhas */}
          <div className="kpi-card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>CAMPANHAS</h3>
              <button onClick={fetchData} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                <RefreshCw size={14} style={{ color: "var(--text-dim)" }} />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="text-left py-2 px-2 font-medium" style={{ color: "var(--text-dim)" }}>Campanha</th>
                    <th className="text-right py-2 px-2 font-medium" style={{ color: "var(--text-dim)" }}>Invest.</th>
                    <th className="text-right py-2 px-2 font-medium" style={{ color: "var(--text-dim)" }}>Alcance</th>
                    <th className="text-right py-2 px-2 font-medium" style={{ color: "var(--text-dim)" }}>Cliques</th>
                    <th className="text-right py-2 px-2 font-medium" style={{ color: "var(--text-dim)" }}>Leads</th>
                    <th className="text-right py-2 px-2 font-medium" style={{ color: "var(--text-dim)" }}>CPL</th>
                    <th className="text-right py-2 px-2 font-medium" style={{ color: "var(--text-dim)" }}>CTR</th>
                  </tr>
                </thead>
                <tbody>
                  {data.campaigns.sort((a, b) => b.spend - a.spend).map((c) => {
                    const campCpl = c.leads > 0 ? c.spend / c.leads : 0;
                    const campCtr = c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0;
                    return (
                      <tr key={c.campaignId} style={{ borderBottom: "1px solid var(--border)" }} className="hover:bg-white/5">
                        <td className="py-2 px-2 font-medium" style={{ color: "var(--text)" }}>{c.campaignName}</td>
                        <td className="py-2 px-2 text-right" style={{ color: "var(--text-muted)" }}>{formatCurrency(c.spend)}</td>
                        <td className="py-2 px-2 text-right" style={{ color: "var(--text-muted)" }}>{formatNumber(c.reach)}</td>
                        <td className="py-2 px-2 text-right" style={{ color: "var(--text-muted)" }}>{formatNumber(c.clicks)}</td>
                        <td className="py-2 px-2 text-right font-medium" style={{ color: c.leads > 0 ? "#10b981" : "var(--text-dim)" }}>{c.leads}</td>
                        <td className="py-2 px-2 text-right" style={{ color: "var(--text-muted)" }}>{campCpl > 0 ? formatCurrency(campCpl) : "—"}</td>
                        <td className="py-2 px-2 text-right" style={{ color: "var(--text-muted)" }}>{campCtr.toFixed(2)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {data.campaigns.length === 0 && (
        <div className="kpi-card text-center py-8">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nenhuma campanha encontrada no período selecionado.</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>Verifique se há campanhas ativas no Gerenciador de Anúncios da Meta.</p>
        </div>
      )}
    </div>
  );
}
