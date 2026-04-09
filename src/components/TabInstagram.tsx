"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Users, Heart, MessageCircle, TrendingUp, Eye, Image, ChevronDown, ChevronUp, X, Table, BarChart3 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";
import { formatNumber } from "@/lib/types";
import DateRangeFilter from "@/components/DateRangeFilter";

interface Post {
  id: string;
  caption: string;
  tipo: string;
  url: string;
  thumbnail: string;
  link: string;
  data: string;
  likes: number;
  comentarios: number;
  engajamento: number;
}

interface IGData {
  configured: boolean;
  message?: string;
  error?: string;
  perfil: {
    nome: string;
    username: string;
    foto: string;
    seguidores: number;
    seguindo: number;
    totalPosts: number;
    bio: string;
  };
  metricas: {
    totalLikes: number;
    totalComments: number;
    avgEngagement: number;
    engagementRate: number;
  };
  insights: Record<string, number[]>;
  posts: Post[];
  topPosts: Post[];
  porTipo: { tipo: string; qtd: number }[];
  fetchedAt: string;
}

const COLORS = ["#e94560", "#f59e0b", "#6366f1", "#10b981", "#06b6d4", "#ec4899"];

const TIPO_LABEL: Record<string, string> = {
  IMAGE: "Foto",
  VIDEO: "Vídeo",
  CAROUSEL_ALBUM: "Carrossel",
  REELS: "Reels",
};

type IgMetricKey = "seguidores" | "curtidas" | "comentarios" | "engajamento";

export default function TabInstagram() {
  const [data, setData] = useState<IGData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("2026-04-14");
  const [endDate, setEndDate] = useState("");
  const [activeQuick, setActiveQuick] = useState<number | "total" | null>("total");
  const [expandedKPI, setExpandedKPI] = useState<IgMetricKey | null>(null);
  const [detailView, setDetailView] = useState<"tabela" | "grafico">("tabela");

  const tooltipStyle = {
    contentStyle: { background: "var(--tooltip-bg)", border: "1px solid var(--border)", borderRadius: "0.75rem", color: "var(--text)" },
    labelStyle: { color: "var(--text-muted)" },
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/instagram");
      const json = await res.json();
      if (!json.configured) {
        setError(json.message || "Instagram não configurado");
      } else if (json.error) {
        setError(json.error);
      } else {
        setData(json);
      }
    } catch (err) {
      setError(String(err));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="text-center py-12">
        <RefreshCw size={24} className="animate-spin mx-auto mb-3" style={{ color: "#e94560" }} />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Carregando dados do Instagram...</p>
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

  // Filter posts by date range
  const filteredPosts = data.posts.filter((p) => {
    if (!p.data) return true;
    const d = p.data.split("T")[0];
    if (startDate && d < startDate) return false;
    if (endDate && d > endDate) return false;
    return true;
  });

  const totalLikes = filteredPosts.reduce((s, p) => s + p.likes, 0);
  const totalComments = filteredPosts.reduce((s, p) => s + p.comentarios, 0);
  const avgEng = filteredPosts.length > 0 ? (totalLikes + totalComments) / filteredPosts.length : 0;
  const engRate = data.perfil.seguidores > 0 ? (avgEng / data.perfil.seguidores) * 100 : 0;

  // Daily likes/comments for expandable KPIs
  const diaLikesMap = new Map<string, number>();
  const diaCommentsMap = new Map<string, number>();
  const diaEngMap = new Map<string, number>();
  for (const p of filteredPosts) {
    if (!p.data) continue;
    const dia = p.data.split("T")[0];
    diaLikesMap.set(dia, (diaLikesMap.get(dia) || 0) + p.likes);
    diaCommentsMap.set(dia, (diaCommentsMap.get(dia) || 0) + p.comentarios);
    diaEngMap.set(dia, (diaEngMap.get(dia) || 0) + p.engajamento);
  }

  const igMetricConfig: Record<IgMetricKey, { label: string; color: string; getDailyData: () => { date: string; value: number }[] }> = {
    seguidores:   { label: "Seguidores", color: "#e94560", getDailyData: () => [] }, // static, no daily
    curtidas:     { label: "Curtidas",   color: "#f59e0b", getDailyData: () => Array.from(diaLikesMap.entries()).map(([d, v]) => ({ date: d, value: v })).sort((a, b) => a.date.localeCompare(b.date)) },
    comentarios:  { label: "Comentários", color: "#6366f1", getDailyData: () => Array.from(diaCommentsMap.entries()).map(([d, v]) => ({ date: d, value: v })).sort((a, b) => a.date.localeCompare(b.date)) },
    engajamento:  { label: "Engajamento", color: "#10b981", getDailyData: () => Array.from(diaEngMap.entries()).map(([d, v]) => ({ date: d, value: v })).sort((a, b) => a.date.localeCompare(b.date)) },
  };

  // Por tipo
  const tipoMap = new Map<string, number>();
  for (const p of filteredPosts) {
    tipoMap.set(p.tipo, (tipoMap.get(p.tipo) || 0) + 1);
  }
  const porTipo = Array.from(tipoMap.entries()).map(([tipo, qtd]) => ({ tipo: TIPO_LABEL[tipo] || tipo, qtd }));

  // Top posts
  const topPosts = [...filteredPosts].sort((a, b) => b.engajamento - a.engajamento).slice(0, 5);

  // Posts por semana
  const semanaMap = new Map<string, number>();
  for (const p of filteredPosts) {
    if (!p.data) continue;
    const date = new Date(p.data);
    // Get week start (Monday)
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const weekStart = new Date(date.setDate(diff));
    const key = weekStart.toISOString().split("T")[0];
    semanaMap.set(key, (semanaMap.get(key) || 0) + 1);
  }
  const porSemana = Array.from(semanaMap.entries())
    .map(([data, qtd]) => ({ data, qtd }))
    .sort((a, b) => a.data.localeCompare(b.data));

  return (
    <div className="space-y-6">
      {/* Perfil */}
      <div className="kpi-card">
        <div className="flex items-center gap-4">
          {data.perfil.foto && (
            <img src={data.perfil.foto} alt={data.perfil.username} className="w-16 h-16 rounded-full object-cover" />
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold" style={{ color: "var(--text)" }}>{data.perfil.nome}</h2>
              <span className="text-sm" style={{ color: "var(--text-dim)" }}>@{data.perfil.username}</span>
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{data.perfil.bio}</p>
            <div className="flex gap-4 mt-2">
              <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                <strong style={{ color: "var(--text)" }}>{formatNumber(data.perfil.seguidores)}</strong> seguidores
              </span>
              <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                <strong style={{ color: "var(--text)" }}>{formatNumber(data.perfil.seguindo)}</strong> seguindo
              </span>
              <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                <strong style={{ color: "var(--text)" }}>{formatNumber(data.perfil.totalPosts)}</strong> posts
              </span>
            </div>
          </div>
          <button onClick={fetchData} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
            <RefreshCw size={14} style={{ color: "var(--text-dim)" }} />
          </button>
        </div>
      </div>

      {/* Date Filter */}
      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onStartChange={(d) => { setStartDate(d); setActiveQuick(null); }}
        onEndChange={(d) => { setEndDate(d); setActiveQuick(null); }}
        onQuickSelect={(days) => {
          setActiveQuick(days);
          if (days === "total") {
            setStartDate("");
            setEndDate("");
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {([
          { key: "seguidores" as IgMetricKey, label: "Seguidores", value: formatNumber(data.perfil.seguidores), sub: undefined as string | undefined, icon: Users, color: "#e94560" },
          { key: "curtidas" as IgMetricKey, label: "Curtidas", value: formatNumber(totalLikes), sub: `${filteredPosts.length} posts` as string | undefined, icon: Heart, color: "#f59e0b" },
          { key: "comentarios" as IgMetricKey, label: "Comentários", value: formatNumber(totalComments), sub: undefined as string | undefined, icon: MessageCircle, color: "#6366f1" },
          { key: "engajamento" as IgMetricKey, label: "Taxa Engaj.", value: `${engRate.toFixed(2)}%`, sub: `Méd. ${avgEng.toFixed(1)}/post` as string | undefined, icon: TrendingUp, color: "#10b981" },
        ]).map(({ key, label, value, sub, icon: Icon, color }) => (
          <div key={key} onClick={() => { if (key !== "seguidores") { setExpandedKPI((prev) => (prev === key ? null : key)); setDetailView("tabela"); } }} style={{ cursor: key !== "seguidores" ? "pointer" : "default" }}>
            <div className="kpi-card">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
                  <Icon size={16} style={{ color }} />
                </div>
                <p className="text-xs font-medium" style={{ color: "var(--text-dim)" }}>{label}</p>
                {key !== "seguidores" && (expandedKPI === key ? <ChevronUp size={12} style={{ color: "var(--text-dim)", marginLeft: "auto" }} /> : <ChevronDown size={12} style={{ color: "var(--text-dim)", marginLeft: "auto" }} />)}
              </div>
              <p className="text-2xl font-bold" style={{ color: "var(--text)" }}>{value}</p>
              {sub && <p className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>{sub}</p>}
            </div>
          </div>
        ))}

        {expandedKPI && expandedKPI !== "seguidores" && (() => {
          const cfg = igMetricConfig[expandedKPI];
          const dailyValues = cfg.getDailyData().filter((d) => d.value > 0);
          const total = dailyValues.reduce((s, d) => s + d.value, 0);

          return (
            <div className="col-span-2 sm:col-span-4" style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: "1rem", padding: "1.25rem", animation: "fadeIn 0.2s ease" }}>
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>{cfg.label.toUpperCase()} — POR DIA</h4>
                <div className="flex items-center gap-2">
                  {(["tabela", "grafico"] as const).map((v) => (
                    <button key={v} onClick={() => setDetailView(v)} style={{ padding: "0.25rem 0.75rem", fontSize: "0.7rem", fontWeight: 600, borderRadius: "0.375rem", background: detailView === v ? cfg.color : "var(--surface)", color: detailView === v ? "#fff" : "var(--text-muted)", border: "1px solid var(--border)", cursor: "pointer" }}>
                      <span className="flex items-center gap-1">{v === "tabela" ? <Table size={12} /> : <BarChart3 size={12} />}{v === "tabela" ? "Tabela" : "Gráfico"}</span>
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
                            <td style={{ padding: "0.5rem 0.75rem", color: "var(--text)", fontWeight: 500 }}>{new Date(d.date + "T00:00:00").toLocaleDateString("pt-BR")}</td>
                            <td style={{ textAlign: "right", padding: "0.5rem 0.75rem", color: "var(--text)", fontWeight: 500 }}>{formatNumber(d.value)}</td>
                            <td style={{ textAlign: "right", padding: "0.5rem 0.75rem", color: "var(--text-dim)" }}>{total > 0 ? ((d.value / total) * 100).toFixed(1) : "0"}%</td>
                          </tr>
                        ))}
                        <tr style={{ background: cfg.color + "15", fontWeight: 700, borderTop: "2px solid " + cfg.color }}>
                          <td style={{ padding: "0.625rem 0.75rem", color: cfg.color }}>TOTAL</td>
                          <td style={{ textAlign: "right", padding: "0.625rem 0.75rem", color: cfg.color, fontSize: "0.9rem" }}>{formatNumber(total)}</td>
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
                    <BarChart data={dailyValues.map((d) => ({ ...d, dateLabel: new Date(d.date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="dateLabel" tick={{ fill: "var(--text-dim)", fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: "var(--text-dim)", fontSize: 11 }} allowDecimals={false} />
                      <Tooltip {...tooltipStyle} labelFormatter={(_, p) => p[0]?.payload?.date ? new Date(p[0].payload.date + "T00:00:00").toLocaleDateString("pt-BR") : ""} formatter={(v) => [formatNumber(Number(v)), cfg.label]} />
                      <Bar dataKey="value" name={cfg.label} fill={cfg.color} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )
              )}
            </div>
          );
        })()}
      </div>

      {/* Charts */}
      {filteredPosts.length > 0 ? (
        <>
          {porSemana.length > 1 && (
            <div className="kpi-card">
              <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>POSTS POR SEMANA</h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={porSemana}>
                  <defs>
                    <linearGradient id="gradIG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#e94560" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#e94560" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="data" tick={{ fill: "var(--text-dim)", fontSize: 11 }} tickFormatter={(v) => { const p = v.split("-"); return `${p[2]}/${p[1]}`; }} />
                  <YAxis tick={{ fill: "var(--text-dim)", fontSize: 11 }} allowDecimals={false} />
                  <Tooltip {...tooltipStyle} labelFormatter={(v) => { const p = String(v).split("-"); return `Sem. ${p[2]}/${p[1]}/${p[0]}`; }} />
                  <Area type="monotone" dataKey="qtd" name="Posts" stroke="#e94560" fill="url(#gradIG)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Por tipo */}
            {porTipo.length > 0 && (
              <div className="kpi-card">
                <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>POR TIPO DE CONTEÚDO</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={porTipo} dataKey="qtd" nameKey="tipo" cx="50%" cy="50%" outerRadius={75} label={({ name, value }) => `${name}: ${value}`}>
                      {porTipo.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip {...tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Top posts por engajamento */}
            {topPosts.length > 0 && (
              <div className="kpi-card">
                <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>TOP POSTS (ENGAJAMENTO)</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={topPosts.map(p => ({ nome: p.data ? new Date(p.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—", eng: p.engajamento }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="nome" tick={{ fill: "var(--text-dim)", fontSize: 11 }} />
                    <YAxis tick={{ fill: "var(--text-dim)", fontSize: 11 }} allowDecimals={false} />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="eng" name="Engajamento" fill="#e94560" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Posts table */}
          <div className="kpi-card">
            <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>POSTS RECENTES</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="text-left py-2 px-2 font-medium" style={{ color: "var(--text-dim)" }}>Data</th>
                    <th className="text-left py-2 px-2 font-medium" style={{ color: "var(--text-dim)" }}>Tipo</th>
                    <th className="text-left py-2 px-2 font-medium" style={{ color: "var(--text-dim)" }}>Legenda</th>
                    <th className="text-right py-2 px-2 font-medium" style={{ color: "var(--text-dim)" }}>Curtidas</th>
                    <th className="text-right py-2 px-2 font-medium" style={{ color: "var(--text-dim)" }}>Comentários</th>
                    <th className="text-right py-2 px-2 font-medium" style={{ color: "var(--text-dim)" }}>Engaj.</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPosts.slice(0, 20).map((p) => (
                    <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }} className="hover:bg-white/5">
                      <td className="py-2 px-2" style={{ color: "var(--text-muted)" }}>
                        {p.data ? new Date(p.data).toLocaleDateString("pt-BR") : "—"}
                      </td>
                      <td className="py-2 px-2">
                        <span className="flex items-center gap-1" style={{ color: "var(--text-dim)" }}>
                          <Image size={10} />
                          {TIPO_LABEL[p.tipo] || p.tipo}
                        </span>
                      </td>
                      <td className="py-2 px-2 max-w-xs truncate" style={{ color: "var(--text)" }}>
                        {p.link ? (
                          <a href={p.link} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            {p.caption || "—"}
                          </a>
                        ) : (p.caption || "—")}
                      </td>
                      <td className="py-2 px-2 text-right" style={{ color: "var(--text-muted)" }}>{formatNumber(p.likes)}</td>
                      <td className="py-2 px-2 text-right" style={{ color: "var(--text-muted)" }}>{formatNumber(p.comentarios)}</td>
                      <td className="py-2 px-2 text-right font-medium" style={{ color: "#e94560" }}>{formatNumber(p.engajamento)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredPosts.length > 20 && (
              <p className="text-xs mt-3 text-center" style={{ color: "var(--text-dim)" }}>
                Mostrando 20 de {filteredPosts.length} posts
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="kpi-card text-center py-8">
          <Eye size={32} className="mx-auto mb-3" style={{ color: "var(--text-dim)" }} />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nenhum post encontrado no período selecionado.</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>O perfil ainda pode não ter publicações ou o acesso à mídia precisa ser configurado.</p>
        </div>
      )}
    </div>
  );
}
