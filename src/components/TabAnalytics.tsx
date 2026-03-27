"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Globe, Users, Clock, MousePointer, Eye, XCircle } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import KPICard from "./KPICard";
import DateRangeFilter from "./DateRangeFilter";
import { formatNumber } from "@/lib/types";

interface AnalyticsData {
  configured: boolean;
  message?: string;
  error?: string;
  overview?: {
    users: number;
    sessions: number;
    pageViews: number;
    avgSessionDuration: number;
    bounceRate: number;
    conversions: number;
  };
  sources?: { channel: string; sessions: number; users: number; conversions: number }[];
  daily?: {
    date: string;
    users: number;
    sessions: number;
    pageViews: number;
    engagementRate?: number;
    bounceRate?: number;
    conversions?: number;
    avgDuration?: number;
  }[];
  topPages?: { path: string; views: number; users: number }[];
  fetchedAt?: string;
}

function today() { return new Date().toISOString().split("T")[0]; }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split("T")[0]; }

type DailyMetric = "traffic" | "engagement" | "conversions";

export default function TabAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [dailyView, setDailyView] = useState<DailyMetric>("traffic");

  // Date range state
  const [startDate, setStartDate] = useState(daysAgo(30));
  const [endDate, setEndDate] = useState(today());
  const [activeQuick, setActiveQuick] = useState<number | "total" | null>(30);

  const days = Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)));

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics?days=${days}&startDate=${startDate}&endDate=${endDate}`);
      setData(await res.json());
    } catch {
      setData({ configured: false, message: "Erro de conexao" });
    }
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, [startDate, endDate]);

  const handleQuickSelect = useCallback((value: number | "total") => {
    setActiveQuick(value);
    if (value === "total") {
      setStartDate("2020-01-01");
      setEndDate(today());
    } else {
      setStartDate(daysAgo(value));
      setEndDate(today());
    }
  }, []);

  const tooltipStyle = {
    contentStyle: { background: "var(--tooltip-bg)", border: "1px solid var(--tooltip-border)", borderRadius: "0.75rem", color: "var(--tooltip-text)" },
    labelStyle: { color: "var(--tooltip-label)" },
  };

  if (!data && !loading) return null;

  const dailyViewButtons: { key: DailyMetric; label: string }[] = [
    { key: "traffic", label: "Trafego" },
    { key: "engagement", label: "Engajamento" },
    { key: "conversions", label: "Conversoes" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Globe size={18} style={{ color: "#4285f4" }} />
        <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>Google Analytics — mangabaurbanismo.com.br</h3>
        <button onClick={fetchData} disabled={loading} className="p-1.5 rounded-lg hover:bg-white/5 ml-auto">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} style={{ color: "var(--text-dim)" }} />
        </button>
      </div>

      {/* Global Date Range Filter */}
      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onStartChange={(d) => { setStartDate(d); setActiveQuick(null); }}
        onEndChange={(d) => { setEndDate(d); setActiveQuick(null); }}
        onQuickSelect={handleQuickSelect}
        activeQuick={activeQuick}
      />

      {!data?.configured && (
        <div className="kpi-card text-center py-12">
          <XCircle size={24} className="mx-auto mb-2" style={{ color: "var(--text-dim)" }} />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>{data?.message || data?.error || "Aguardando configuracao."}</p>
        </div>
      )}

      {data?.configured && data?.error && (
        <div className="kpi-card p-4">
          <p className="text-xs" style={{ color: "#f87171" }}>{data.error}</p>
        </div>
      )}

      {data?.configured && !data?.error && data?.overview && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <KPICard
              label="Usuarios"
              value={formatNumber(data.overview.users)}
              icon={<Users size={14} style={{ color: "#4285f4" }} />}
            />
            <KPICard
              label="Sessoes"
              value={formatNumber(data.overview.sessions)}
              icon={<MousePointer size={14} style={{ color: "#10b981" }} />}
            />
            <KPICard
              label="Visualizacoes"
              value={formatNumber(data.overview.pageViews)}
              icon={<Eye size={14} style={{ color: "#f4a236" }} />}
            />
            <KPICard
              label="Tempo Medio"
              value={`${Math.floor(data.overview.avgSessionDuration / 60)}m ${Math.floor(data.overview.avgSessionDuration % 60)}s`}
              icon={<Clock size={14} style={{ color: "#8b5cf6" }} />}
            />
            <KPICard
              label="Taxa de Rejeicao"
              value={`${(data.overview.bounceRate * 100).toFixed(1)}%`}
              status={data.overview.bounceRate < 0.5 ? "good" : "bad"}
            />
            <KPICard
              label="Conversoes"
              value={formatNumber(data.overview.conversions)}
              icon={<Globe size={14} style={{ color: "#e94560" }} />}
            />
          </div>

          {/* Grafico diario com toggle de views */}
          {data.daily && data.daily.length > 0 && (
            <div className="kpi-card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>METRICAS DIARIAS</h3>
                <div className="flex items-center gap-1">
                  {dailyViewButtons.map((btn) => (
                    <button
                      key={btn.key}
                      onClick={() => setDailyView(btn.key)}
                      style={{
                        padding: "0.25rem 0.6rem",
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        borderRadius: "0.375rem",
                        background: dailyView === btn.key ? "#4285f4" : "transparent",
                        color: dailyView === btn.key ? "#fff" : "var(--text-dim)",
                        border: dailyView === btn.key ? "1px solid #4285f4" : "1px solid var(--border)",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>

              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data.daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="date" tick={{ fill: "var(--text-dim)", fontSize: 10 }} interval="preserveStartEnd" />
                  <Tooltip {...tooltipStyle} />
                  <Legend wrapperStyle={{ color: "var(--text-muted)", fontSize: 12 }} />

                  {dailyView === "traffic" && (
                    <>
                      <YAxis tick={{ fill: "var(--text-dim)", fontSize: 11 }} />
                      <Line type="monotone" dataKey="users" name="Usuarios" stroke="#4285f4" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="sessions" name="Sessoes" stroke="#10b981" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="pageViews" name="Page Views" stroke="#f4a236" strokeWidth={2} dot={false} />
                    </>
                  )}

                  {dailyView === "engagement" && (
                    <>
                      <YAxis tick={{ fill: "var(--text-dim)", fontSize: 11 }} domain={[0, 100]} unit="%" />
                      <Line type="monotone" dataKey="engagementRate" name="Engajamento %" stroke="#10b981" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="bounceRate" name="Rejeicao %" stroke="#e94560" strokeWidth={2} dot={false} />
                    </>
                  )}

                  {dailyView === "conversions" && (
                    <>
                      <YAxis tick={{ fill: "var(--text-dim)", fontSize: 11 }} />
                      <Line type="monotone" dataKey="conversions" name="Conversoes" stroke="#e94560" strokeWidth={2.5} dot={{ r: 3, fill: "#e94560" }} />
                      <Line type="monotone" dataKey="users" name="Usuarios" stroke="#4285f4" strokeWidth={1.5} dot={false} strokeDasharray="5 5" />
                    </>
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Fontes de trafego */}
          {data.sources && data.sources.length > 0 && (
            <div className="kpi-card">
              <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>FONTES DE TRAFEGO</h3>
              <ResponsiveContainer width="100%" height={Math.max(200, data.sources.length * 40)}>
                <BarChart data={data.sources} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis type="number" tick={{ fill: "var(--text-dim)", fontSize: 11 }} />
                  <YAxis dataKey="channel" type="category" tick={{ fill: "var(--text-muted)", fontSize: 11 }} width={140} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="sessions" name="Sessoes" fill="#4285f4" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Top paginas */}
          {data.topPages && data.topPages.length > 0 && (
            <div className="kpi-card overflow-x-auto">
              <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>PAGINAS MAIS VISITADAS</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>Pagina</th>
                    <th className="text-right py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>Views</th>
                    <th className="text-right py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>Usuarios</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topPages.map((p, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="py-2 px-2" style={{ color: "var(--text)" }}>{p.path}</td>
                      <td className="text-right py-2 px-2" style={{ color: "var(--text)" }}>{formatNumber(p.views)}</td>
                      <td className="text-right py-2 px-2" style={{ color: "var(--text-muted)" }}>{formatNumber(p.users)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.fetchedAt && (
            <p className="text-xs text-right" style={{ color: "var(--text-dim)" }}>
              Atualizado: {new Date(data.fetchedAt).toLocaleString("pt-BR")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
