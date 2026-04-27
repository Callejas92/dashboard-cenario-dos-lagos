"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, DollarSign, Eye, MousePointer, TrendingUp, Target, BarChart3 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line, ComposedChart,
} from "recharts";
import { formatNumber } from "@/lib/types";
import DateRangeFilter from "@/components/DateRangeFilter";
import KPICard from "@/components/KPICard";

interface Campaign {
  campaignId: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  cost: number;
  costMicros: number;
  conversions: number;
  ctr: string;
  cpc: string;
}

interface Daily {
  date: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
}

interface Totals {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  ctr: string;
  cpc: string;
  cpa: string;
}

interface GoogleAdsData {
  configured: boolean;
  message?: string;
  error?: string;
  accountName?: string;
  note?: string | null;
  dateFrom: string;
  dateTo: string;
  campaigns: Campaign[];
  totals: Totals;
  daily?: Daily[];
  fetchedAt: string;
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function today() {
  return new Date().toISOString().split("T")[0];
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

export default function TabGoogleAds() {
  const [data, setData] = useState<GoogleAdsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("2026-04-14");
  const [endDate, setEndDate] = useState(today());
  const [activeQuick, setActiveQuick] = useState<number | "total" | null>("total");
  const [chartMetric, setChartMetric] = useState<"cost" | "clicks" | "impressions">("cost");

  const tooltipStyle = {
    contentStyle: { background: "var(--tooltip-bg)", border: "1px solid var(--border)", borderRadius: "0.75rem", color: "var(--text)" },
    labelStyle: { color: "var(--text-muted)" },
  };
  const axisTick = { fill: "var(--text-dim)", fontSize: 11 };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("from", startDate);
      if (endDate) params.set("to", endDate);
      const res = await fetch(`/api/google-ads?${params}`);
      const json = await res.json();
      if (!json.configured) setError(json.message || "Google Ads não configurado");
      else if (json.error) setError(json.error);
      else setData(json);
    } catch (err) {
      setError(String(err));
    }
    setLoading(false);
  }, [startDate, endDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function handleQuickSelect(days: number | "total") {
    setActiveQuick(days);
    if (days === "total") {
      setStartDate("2026-04-14");
      setEndDate(today());
    } else {
      setStartDate(daysAgo(days));
      setEndDate(today());
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <RefreshCw size={24} className="animate-spin mx-auto mb-3" style={{ color: "#ea4335" }} />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Carregando dados do Google Ads...</p>
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

  const { campaigns, totals, daily = [], note, accountName } = data;

  const chartConfig = {
    cost: { label: "Gasto", color: "#ea4335", format: formatCurrency },
    clicks: { label: "Cliques", color: "#4285f4", format: formatNumber },
    impressions: { label: "Impressões", color: "#fbbc04", format: formatNumber },
  };

  const cfg = chartConfig[chartMetric];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="kpi-card">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "#ea433520" }}>
              <Target size={20} style={{ color: "#ea4335" }} />
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ color: "var(--text)" }}>{accountName || "Google Ads"}</h2>
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                {campaigns.length} campanha(s) ativa(s)
              </p>
            </div>
          </div>
          <button onClick={fetchData} className="p-2 rounded-lg hover:bg-white/5 transition-colors">
            <RefreshCw size={14} style={{ color: "var(--text-dim)" }} />
          </button>
        </div>
        {note && (
          <div style={{
            marginTop: "0.75rem", padding: "0.5rem 0.75rem",
            background: "#f59e0b15", border: "1px solid #f59e0b40",
            borderRadius: "0.375rem", fontSize: "0.7rem", color: "#f59e0b",
          }}>
            ⚠️ {note}
          </div>
        )}
      </div>

      {/* Filtro de período */}
      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onStartChange={(d) => { setStartDate(d); setActiveQuick(null); }}
        onEndChange={(d) => { setEndDate(d); setActiveQuick(null); }}
        onQuickSelect={handleQuickSelect}
        activeQuick={activeQuick}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Investimento"
          value={formatCurrency(totals.cost)}
          icon={<DollarSign size={14} style={{ color: "#ea4335" }} />}
        />
        <KPICard
          label="Impressões"
          value={formatNumber(totals.impressions)}
          icon={<Eye size={14} style={{ color: "#fbbc04" }} />}
        />
        <KPICard
          label="Cliques"
          value={formatNumber(totals.clicks)}
          icon={<MousePointer size={14} style={{ color: "#4285f4" }} />}
        />
        <KPICard
          label="Conversões"
          value={formatNumber(totals.conversions)}
          icon={<Target size={14} style={{ color: "#10b981" }} />}
        />
        <KPICard
          label="CTR"
          value={`${totals.ctr}%`}
          icon={<TrendingUp size={14} style={{ color: "#8b5cf6" }} />}
        />
        <KPICard
          label="CPC Médio"
          value={formatCurrency(parseFloat(totals.cpc))}
          icon={<DollarSign size={14} style={{ color: "#06b6d4" }} />}
        />
        <KPICard
          label="CPA"
          value={totals.conversions > 0 ? formatCurrency(parseFloat(totals.cpa)) : "—"}
          icon={<Target size={14} style={{ color: "#f59e0b" }} />}
        />
        <KPICard
          label="Taxa Conv."
          value={totals.clicks > 0 ? `${((totals.conversions / totals.clicks) * 100).toFixed(2)}%` : "—"}
          icon={<TrendingUp size={14} style={{ color: "#10b981" }} />}
        />
      </div>

      {/* Gráfico diário */}
      {daily.length > 0 && (
        <div className="kpi-card">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>EVOLUÇÃO DIÁRIA</h3>
            <div className="flex items-center gap-1">
              {(["cost", "clicks", "impressions"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setChartMetric(m)}
                  style={{
                    padding: "0.25rem 0.6rem", fontSize: "0.7rem", fontWeight: 600,
                    borderRadius: "0.375rem",
                    background: chartMetric === m ? chartConfig[m].color : "var(--surface)",
                    color: chartMetric === m ? "#fff" : "var(--text-muted)",
                    border: "1px solid var(--border)", cursor: "pointer",
                  }}
                >
                  {chartConfig[m].label}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={daily.map((d) => ({
              ...d,
              dataLabel: new Date(d.date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
            }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="dataLabel" tick={axisTick} interval="preserveStartEnd" />
              <YAxis tick={axisTick} tickFormatter={(v) => cfg.format(Number(v))} />
              <Tooltip
                {...tooltipStyle}
                labelFormatter={(_, p) => {
                  const payload = p[0]?.payload as { date?: string } | undefined;
                  return payload?.date ? new Date(payload.date + "T00:00:00").toLocaleDateString("pt-BR") : "";
                }}
                formatter={(v) => [cfg.format(Number(v)), cfg.label]}
              />
              <Bar dataKey={chartMetric} fill={cfg.color} radius={[4, 4, 0, 0]} />
              {chartMetric === "cost" && (
                <Line type="monotone" dataKey="conversions" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Conversões" />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabela de campanhas */}
      {campaigns.length > 0 ? (
        <div className="kpi-card overflow-x-auto">
          <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>CAMPANHAS</h3>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)" }}>
                <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>Campanha</th>
                <th className="text-right py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>Gasto</th>
                <th className="text-right py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>Impressões</th>
                <th className="text-right py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>Cliques</th>
                <th className="text-right py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>CTR</th>
                <th className="text-right py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>CPC</th>
                <th className="text-right py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>Conversões</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.campaignId} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="py-2 px-2" style={{ color: "var(--text)", fontWeight: 600 }}>{c.campaignName}</td>
                  <td className="text-right py-2 px-2" style={{ color: "#ea4335", fontWeight: 600 }}>{formatCurrency(c.cost)}</td>
                  <td className="text-right py-2 px-2" style={{ color: "var(--text)" }}>{formatNumber(c.impressions)}</td>
                  <td className="text-right py-2 px-2" style={{ color: "var(--text)" }}>{formatNumber(c.clicks)}</td>
                  <td className="text-right py-2 px-2" style={{ color: "var(--text-muted)" }}>{c.ctr}%</td>
                  <td className="text-right py-2 px-2" style={{ color: "var(--text-muted)" }}>R$ {c.cpc}</td>
                  <td className="text-right py-2 px-2" style={{ color: c.conversions > 0 ? "#10b981" : "var(--text-dim)", fontWeight: c.conversions > 0 ? 600 : 400 }}>
                    {c.conversions > 0 ? formatNumber(c.conversions) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "#ea433510", borderTop: "2px solid #ea4335" }}>
                <td className="py-3 px-2" style={{ color: "#ea4335", fontWeight: 700 }}>TOTAL</td>
                <td className="text-right py-3 px-2" style={{ color: "#ea4335", fontWeight: 700 }}>{formatCurrency(totals.cost)}</td>
                <td className="text-right py-3 px-2" style={{ color: "#ea4335", fontWeight: 700 }}>{formatNumber(totals.impressions)}</td>
                <td className="text-right py-3 px-2" style={{ color: "#ea4335", fontWeight: 700 }}>{formatNumber(totals.clicks)}</td>
                <td className="text-right py-3 px-2" style={{ color: "#ea4335", fontWeight: 700 }}>{totals.ctr}%</td>
                <td className="text-right py-3 px-2" style={{ color: "#ea4335", fontWeight: 700 }}>R$ {totals.cpc}</td>
                <td className="text-right py-3 px-2" style={{ color: "#ea4335", fontWeight: 700 }}>{formatNumber(totals.conversions)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="kpi-card text-center py-8">
          <BarChart3 size={32} className="mx-auto mb-3" style={{ color: "var(--text-dim)" }} />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nenhuma campanha encontrada no período.</p>
        </div>
      )}

      {/* Footer */}
      <p className="text-xs text-right" style={{ color: "var(--text-dim)" }}>
        Atualizado: {new Date(data.fetchedAt).toLocaleString("pt-BR")}
      </p>
    </div>
  );
}
