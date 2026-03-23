"use client";

import { useState, useEffect } from "react";
import { RefreshCw, Globe, Users, Clock, MousePointer, Eye, XCircle } from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import KPICard from "./KPICard";
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
  daily?: { date: string; users: number; sessions: number; pageViews: number }[];
  topPages?: { path: string; views: number; users: number }[];
  fetchedAt?: string;
}

const COLORS = ["#4285f4", "#e94560", "#10b981", "#f4a236", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

export default function TabAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics?days=${days}`);
      setData(await res.json());
    } catch {
      setData({ configured: false, message: "Erro de conexao" });
    }
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, [days]);

  const tooltipStyle = {
    contentStyle: { background: "var(--tooltip-bg)", border: "1px solid var(--tooltip-border)", borderRadius: "0.75rem", color: "var(--tooltip-text)" },
    labelStyle: { color: "var(--tooltip-label)" },
  };

  if (!data && !loading) return null;

  return (
    <div className="space-y-6">
      {/* Header com seletor de periodo */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Globe size={18} style={{ color: "#4285f4" }} />
          <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>Google Analytics — mangabaurbanismo.com.br</h3>
        </div>
        <div className="flex items-center gap-2">
          {[7, 14, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                days === d ? "tab-active" : "tab-inactive"
              }`}
            >
              {d}d
            </button>
          ))}
          <button onClick={fetchData} disabled={loading} className="p-1.5 rounded-lg hover:bg-white/5">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} style={{ color: "var(--text-dim)" }} />
          </button>
        </div>
      </div>

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

          {/* Grafico diario */}
          {data.daily && data.daily.length > 0 && (
            <div className="kpi-card">
              <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>TRAFEGO DIARIO</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data.daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="date" tick={{ fill: "var(--text-dim)", fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: "var(--text-dim)", fontSize: 11 }} />
                  <Tooltip {...tooltipStyle} />
                  <Legend wrapperStyle={{ color: "var(--text-muted)", fontSize: 12 }} />
                  <Line type="monotone" dataKey="users" name="Usuarios" stroke="#4285f4" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="sessions" name="Sessoes" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="pageViews" name="Page Views" stroke="#f4a236" strokeWidth={2} dot={false} />
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
