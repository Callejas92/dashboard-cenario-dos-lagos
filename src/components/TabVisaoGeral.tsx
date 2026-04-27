"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Cell,
} from "recharts";
import {
  DollarSign, Users, ShoppingCart, Target,
  RefreshCw, X, Table, BarChart3,
  ChevronDown, ChevronUp,
} from "lucide-react";
import KPICard from "./KPICard";
import DateRangeFilter from "./DateRangeFilter";
import { MetricsData, formatBRL, formatPercent, formatNumber } from "@/lib/types";

interface Props {
  data: MetricsData;
}

type MetricKey = "investimento" | "leads" | "vendas" | "valorVendas";

const CANAL_COLORS: Record<string, string> = {
  "Meta Ads": "#1877f2",
  "Google Ads": "#ea4335",
  "WhatsApp": "#25d366",
  "Site": "#10b981",
  "Outdoor": "#f4a236",
  "Rádio": "#8b5cf6",
  "Jornal": "#e94560",
  "Indicação": "#0ea5e9",
  "Contato Corretor": "#f59e0b",
  "Outros": "#6b7280",
};

function today() {
  return new Date().toISOString().split("T")[0];
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

interface CanalApiData {
  investimento: number;
  leads: number;
  leadsQualificados: number;
  vendas: number;
  valorVendas: number;
  source: "api" | "manual";
}

interface DailyDataPoint {
  date: string;
  spend: number;
  leads: number;
}

interface DailyByCanalEntry {
  date: string;
  canal: string;
  investimento: number;
  leads: number;
  vendas: number;
  valorVendas: number;
}

interface CanaisApiResponse {
  canais: Record<string, CanalApiData>;
  kpis: {
    totalLeads: number;
    totalInvestimento: number;
    totalVendas: number;
    totalValorVendas: number;
    cpl: number;
    cac: number;
    roi: number;
  };
  daily: DailyDataPoint[];
  dailyByCanal?: DailyByCanalEntry[];
  canaisSemDadosDiarios?: string[];
  crmTotal: {
    total: number;
    convertidos: number;
  };
}

export default function TabVisaoGeral({ data }: Props) {
  const metas = data.config.metas;
  const vgv = data.config.vgv;

  // ---- Date state ----
  const [globalStart, setGlobalStart] = useState("2026-04-14");
  const [globalEnd, setGlobalEnd] = useState(today());
  const [globalQuick, setGlobalQuick] = useState<number | "total" | null>("total");

  // ---- API state ----
  const [apiData, setApiData] = useState<CanaisApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // ---- Detail panel ----
  const [expandedKPI, setExpandedKPI] = useState<MetricKey | null>(null);
  const [detailView, setDetailView] = useState<"tabela" | "grafico">("tabela");
  const [detailMode, setDetailMode] = useState<"canal" | "dia">("canal");
  const [detailCanalFilter, setDetailCanalFilter] = useState<string>("Todos"); // "Todos" ou nome do canal
  const [canalDropdownOpen, setCanalDropdownOpen] = useState(false);

  // ---- Fetch /api/canais ----
  const fetchCanais = useCallback(async (from: string, to: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/canais?from=${from}&to=${to}`);
      const json = await res.json();
      setApiData(json);
    } catch (err) {
      console.error("Erro ao buscar canais:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCanais(globalStart, globalEnd);
  }, [globalStart, globalEnd, fetchCanais]);

  function handleQuickSelect(days: number | "total") {
    setGlobalQuick(days);
    if (days === "total") {
      setGlobalStart("2026-04-14");
      setGlobalEnd(today());
    } else {
      setGlobalStart(daysAgo(days));
      setGlobalEnd(today());
    }
  }

  // ---- Derived values ----
  const kpis = apiData?.kpis ?? {
    totalLeads: 0,
    totalInvestimento: 0,
    totalVendas: 0,
    totalValorVendas: 0,
    cpl: 0,
    cac: 0,
    roi: 0,
  };

  const crmConvertidos = apiData?.crmTotal.convertidos ?? 0;

  // VSO: vendas / totalUnidades * 100
  const vso = vgv.totalUnidades > 0 ? (kpis.totalVendas / vgv.totalUnidades) * 100 : 0;

  // Canal data for charts
  const allCanalData = apiData
    ? Object.entries(apiData.canais).map(([nome, c]) => ({
        nome: nome.length > 13 ? nome.slice(0, 11) + "…" : nome,
        nomeCompleto: nome,
        investimento: c.investimento,
        leads: c.leads,
        vendas: c.vendas,
        color: CANAL_COLORS[nome] ?? "#6b7280",
      }))
    : [];

  const leadsChartData = allCanalData.filter((c) => c.leads > 0);
  const investChartData = allCanalData.filter((c) => c.investimento > 0);

  // ---- KPI statuses ----
  const cplStatus =
    kpis.cpl === 0 ? ("neutral" as const) : kpis.cpl <= metas.cpl ? ("good" as const) : ("bad" as const);
  const cacStatus =
    kpis.cac === 0 ? ("neutral" as const) : kpis.cac <= metas.cac ? ("good" as const) : ("bad" as const);
  const roiStatus =
    kpis.roi === 0 ? ("neutral" as const) : kpis.roi >= metas.roi ? ("good" as const) : ("bad" as const);
  const vsoStatus =
    vso === 0 ? ("neutral" as const) : vso >= metas.vso ? ("good" as const) : ("bad" as const);

  // ---- Tooltip / axis shared styles ----
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

  // ---- Metric config ----
  type DailyMetricKey = "investimento" | "leads" | "vendas" | "valorVendas";
  const metricConfig: Record<
    MetricKey,
    { label: string; color: string; format: (v: number) => string; dataKey: DailyMetricKey }
  > = {
    investimento: { label: "Investimento", color: "#f4a236", format: formatBRL, dataKey: "investimento" },
    leads:        { label: "Leads",        color: "#4285f4", format: formatNumber, dataKey: "leads" },
    vendas:       { label: "Vendas",       color: "#10b981", format: formatNumber, dataKey: "vendas" },
    valorVendas:  { label: "Receita",      color: "#e94560", format: formatBRL,   dataKey: "valorVendas" },
  };

  function toggleDetail(key: MetricKey) {
    setExpandedKPI((prev) => (prev === key ? null : key));
    setDetailView("tabela");
    setDetailMode("canal");
    setDetailCanalFilter("Todos");
  }

  const daily = apiData?.daily || [];
  const dailyByCanal = apiData?.dailyByCanal || [];

  // ---- Detail panel: per-canal or per-day breakdown ----
  function renderDetailPanel(key: MetricKey) {
    if (expandedKPI !== key || !apiData) return null;
    const cfg = metricConfig[key];

    // Daily data mapping per metric, opcionalmente filtrado por canal
    const getDailyValues = (canalFilter: string): { date: string; value: number }[] => {
      const dataKey = cfg.dataKey;
      const filtered = canalFilter === "Todos"
        ? dailyByCanal
        : dailyByCanal.filter((d) => d.canal === canalFilter);

      // Agrupa por data e soma o valor da métrica
      const byDate: Record<string, number> = {};
      for (const d of filtered) {
        const v = d[dataKey] as number;
        if (v > 0) byDate[d.date] = (byDate[d.date] || 0) + v;
      }

      return Object.entries(byDate)
        .map(([date, value]) => ({ date, value }))
        .sort((a, b) => a.date.localeCompare(b.date));
    };

    const canaisDetail = Object.entries(apiData.canais)
      .map(([nome, c]) => ({ nome, value: c[cfg.dataKey] as number }))
      .filter((c) => c.value > 0)
      .sort((a, b) => b.value - a.value);

    // Lista de canais com info se têm dados pra métrica atual
    const canaisComDados = Array.from(new Set(dailyByCanal.map((d) => d.canal)))
      .sort()
      .map((c) => ({
        nome: c,
        temValor: dailyByCanal.some((d) => d.canal === c && (d[cfg.dataKey] as number) > 0),
      }));

    const dailyValues = getDailyValues(detailCanalFilter);
    const hasDailyData = dailyByCanal.some((d) => (d[cfg.dataKey] as number) > 0);
    const currentData = detailMode === "dia" ? dailyValues : canaisDetail;
    const total = currentData.reduce((s, d) => s + d.value, 0);

    // Canais com valor > 0 mas sem dados diários para essa métrica
    const offlineCanais = Object.entries(apiData.canais)
      .filter(([nome, c]) => {
        const v = c[cfg.dataKey] as number;
        if (v <= 0) return false;
        const hasDaily = dailyByCanal.some((d) => d.canal === nome && (d[cfg.dataKey] as number) > 0);
        return !hasDaily;
      })
      .map(([nome]) => nome);

    return (
      <div
        className="col-span-2 lg:col-span-4"
        style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: "1rem", padding: "1.25rem", animation: "fadeIn 0.2s ease" }}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>
              {cfg.label.toUpperCase()} — {detailMode === "canal" ? "POR CANAL" : detailCanalFilter === "Todos" ? "POR DIA" : `POR DIA — ${detailCanalFilter.toUpperCase()}`}
            </h4>
            {/* Dropdown de canal — só aparece em modo "dia" */}
            {detailMode === "dia" && canaisComDados.length > 0 && (
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setCanalDropdownOpen((v) => !v)}
                  onBlur={() => setTimeout(() => setCanalDropdownOpen(false), 150)}
                  style={{
                    display: "flex", alignItems: "center", gap: "0.5rem",
                    padding: "0.375rem 0.75rem", fontSize: "0.7rem", fontWeight: 600,
                    background: detailCanalFilter !== "Todos" ? cfg.color + "20" : "var(--surface)",
                    color: detailCanalFilter !== "Todos" ? cfg.color : "var(--text)",
                    border: `1px solid ${detailCanalFilter !== "Todos" ? cfg.color : "var(--border)"}`,
                    borderRadius: "0.5rem",
                    cursor: "pointer",
                    minWidth: "140px",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                    {detailCanalFilter !== "Todos" && (
                      <span style={{
                        display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                        background: CANAL_COLORS[detailCanalFilter] ?? "#6b7280",
                      }} />
                    )}
                    {detailCanalFilter}
                  </span>
                  {canalDropdownOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {canalDropdownOpen && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, marginTop: "0.25rem",
                    background: "var(--card-bg)", border: "1px solid var(--border)",
                    borderRadius: "0.5rem", boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                    minWidth: "180px", zIndex: 50,
                    overflow: "hidden",
                  }}>
                    <button
                      onMouseDown={() => { setDetailCanalFilter("Todos"); setCanalDropdownOpen(false); }}
                      style={{
                        display: "flex", alignItems: "center", gap: "0.5rem",
                        width: "100%", padding: "0.5rem 0.75rem", fontSize: "0.75rem",
                        fontWeight: detailCanalFilter === "Todos" ? 700 : 500,
                        background: detailCanalFilter === "Todos" ? cfg.color + "15" : "transparent",
                        color: detailCanalFilter === "Todos" ? cfg.color : "var(--text)",
                        border: "none", cursor: "pointer", textAlign: "left",
                      }}
                    >
                      <span style={{ width: 8, height: 8 }} />
                      Todos os canais
                    </button>
                    {canaisComDados.map((c) => (
                      <button
                        key={c.nome}
                        onMouseDown={() => { setDetailCanalFilter(c.nome); setCanalDropdownOpen(false); }}
                        style={{
                          display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "space-between",
                          width: "100%", padding: "0.5rem 0.75rem", fontSize: "0.75rem",
                          fontWeight: detailCanalFilter === c.nome ? 700 : 500,
                          background: detailCanalFilter === c.nome ? cfg.color + "15" : "transparent",
                          color: detailCanalFilter === c.nome ? cfg.color : c.temValor ? "var(--text)" : "var(--text-dim)",
                          border: "none", cursor: "pointer", textAlign: "left",
                          opacity: c.temValor ? 1 : 0.55,
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{
                            display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                            background: CANAL_COLORS[c.nome] ?? "#6b7280",
                          }} />
                          {c.nome}
                        </span>
                        {!c.temValor && (
                          <span style={{ fontSize: "0.6rem", color: "var(--text-dim)" }}>(sem dados)</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Mode toggle: Canal / Dia */}
            {(["canal", "dia"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setDetailMode(m); setDetailView("tabela"); setDetailCanalFilter("Todos"); }}
                disabled={m === "dia" && !hasDailyData}
                style={{
                  padding: "0.25rem 0.75rem", fontSize: "0.7rem", fontWeight: 600, borderRadius: "0.375rem",
                  background: detailMode === m ? cfg.color : "var(--surface)",
                  color: detailMode === m ? "#fff" : "var(--text-muted)",
                  border: "1px solid var(--border)", cursor: m === "dia" && !hasDailyData ? "not-allowed" : "pointer",
                  opacity: m === "dia" && !hasDailyData ? 0.4 : 1,
                }}
              >
                {m === "canal" ? "Por Canal" : "Por Dia"}
              </button>
            ))}
            <span style={{ width: 1, height: 16, background: "var(--border)", display: "inline-block" }} />
            {(["tabela", "grafico"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setDetailView(v)}
                style={{
                  padding: "0.25rem 0.75rem", fontSize: "0.7rem", fontWeight: 600, borderRadius: "0.375rem",
                  background: detailView === v ? cfg.color : "var(--surface)",
                  color: detailView === v ? "#fff" : "var(--text-muted)",
                  border: "1px solid var(--border)", cursor: "pointer",
                }}
              >
                <span className="flex items-center gap-1">
                  {v === "tabela" ? <Table size={12} /> : <BarChart3 size={12} />}
                  {v === "tabela" ? "Tabela" : "Gráfico"}
                </span>
              </button>
            ))}
            <button
              onClick={() => setExpandedKPI(null)}
              style={{ padding: "0.25rem", borderRadius: "0.375rem", background: "var(--surface)", border: "1px solid var(--border)", cursor: "pointer", color: "var(--text-dim)" }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Nota sobre custos offline não incluídos no Por Dia */}
        {detailMode === "dia" && offlineCanais.length > 0 && (
          <div style={{
            marginBottom: "0.75rem", padding: "0.5rem 0.75rem",
            background: "var(--surface)", border: "1px dashed var(--border)",
            borderRadius: "0.375rem", fontSize: "0.7rem",
            color: "var(--text-dim)",
          }}>
            ℹ️ Canais sem dados diários (apenas mensais): <strong>{offlineCanais.join(", ")}</strong>. Use &quot;Por Canal&quot; para ver esses valores.
          </div>
        )}

        {detailMode === "dia" ? (
          /* ---- POR DIA ---- */
          detailView === "tabela" ? (
            dailyValues.length === 0 ? (
              <p className="text-sm text-center py-4" style={{ color: "var(--text-dim)" }}>Sem dados diários no período</p>
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
              <p className="text-sm text-center py-4" style={{ color: "var(--text-dim)" }}>Sem dados diários no período</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dailyValues.map((d) => ({ ...d, dateLabel: new Date(d.date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="dateLabel" tick={axisTick} interval="preserveStartEnd" />
                  <YAxis tick={axisTick} tickFormatter={(v) => cfg.format(Number(v))} />
                  <Tooltip
                    {...tooltipStyle}
                    labelFormatter={(_, p) => {
                      const payload = p[0]?.payload as { date?: string } | undefined;
                      return payload?.date ? new Date(payload.date + "T00:00:00").toLocaleDateString("pt-BR") : "";
                    }}
                    formatter={(v) => [cfg.format(Number(v)), cfg.label]}
                  />
                  <Bar dataKey="value" name={cfg.label} fill={cfg.color} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )
          )
        ) : (
          /* ---- POR CANAL ---- */
          detailView === "tabela" ? (
            canaisDetail.length === 0 ? (
              <p className="text-sm text-center py-4" style={{ color: "var(--text-dim)" }}>Sem dados no período</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--border)" }}>
                      <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", color: "var(--text-dim)", fontWeight: 600 }}>Canal</th>
                      <th style={{ textAlign: "right", padding: "0.5rem 0.75rem", color: "var(--text-dim)", fontWeight: 600 }}>{cfg.label}</th>
                      <th style={{ textAlign: "right", padding: "0.5rem 0.75rem", color: "var(--text-dim)", fontWeight: 600 }}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {canaisDetail.map((c) => (
                      <tr key={c.nome} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "0.5rem 0.75rem", color: "var(--text)", fontWeight: 600 }}>
                          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: CANAL_COLORS[c.nome] ?? "#6b7280", marginRight: 6 }} />
                          {c.nome}
                        </td>
                        <td style={{ textAlign: "right", padding: "0.5rem 0.75rem", color: "var(--text)", fontWeight: 500 }}>{cfg.format(c.value)}</td>
                        <td style={{ textAlign: "right", padding: "0.5rem 0.75rem", color: "var(--text-dim)" }}>{total > 0 ? ((c.value / total) * 100).toFixed(1) : "0"}%</td>
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
            canaisDetail.length === 0 ? (
              <p className="text-sm text-center py-4" style={{ color: "var(--text-dim)" }}>Sem dados no período</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(canaisDetail.length * 40 + 40, 180)}>
                <BarChart data={canaisDetail} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
                  <XAxis type="number" tick={axisTick} tickFormatter={(v) => cfg.format(Number(v))} />
                  <YAxis type="category" dataKey="nome" tick={axisTick} width={120} />
                  <Tooltip {...tooltipStyle} formatter={(v) => [cfg.format(Number(v)), cfg.label]} />
                  <Bar dataKey="value" name={cfg.label} radius={[0, 4, 4, 0]}>
                    {canaisDetail.map((c) => (
                      <Cell key={c.nome} fill={CANAL_COLORS[c.nome] ?? "#6b7280"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )
          )
        )}
      </div>
    );
  }

  // ---- Render ----
  return (
    <div className="space-y-6">
      {/* ===== Date filter ===== */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <DateRangeFilter
            startDate={globalStart}
            endDate={globalEnd}
            onStartChange={(d) => { setGlobalStart(d); setGlobalQuick(null); }}
            onEndChange={(d) => { setGlobalEnd(d); setGlobalQuick(null); }}
            onQuickSelect={handleQuickSelect}
            activeQuick={globalQuick}
          />
        </div>
        {loading && (
          <RefreshCw size={16} className="animate-spin flex-shrink-0" style={{ color: "#1a5c3a" }} />
        )}
      </div>

      {/* ===== KPI Cards (clicáveis) ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(
          [
            {
              key: "investimento" as MetricKey,
              label: "Investimento Total",
              value: formatBRL(kpis.totalInvestimento),
              iconColor: "#f4a236",
              Icon: DollarSign,
            },
            {
              key: "leads" as MetricKey,
              label: "Total de Leads",
              value: formatNumber(kpis.totalLeads),
              iconColor: "#4285f4",
              Icon: Users,
            },
            {
              key: "vendas" as MetricKey,
              label: "Vendas Realizadas",
              value: formatNumber(kpis.totalVendas),
              iconColor: "#10b981",
              Icon: ShoppingCart,
            },
            {
              key: "valorVendas" as MetricKey,
              label: "Receita Total",
              value: formatBRL(kpis.totalValorVendas),
              iconColor: "#e94560",
              Icon: Target,
            },
          ] as const
        ).map(({ key, label, value, iconColor, Icon }) => (
          <div key={key} onClick={() => toggleDetail(key)} style={{ cursor: "pointer" }}>
            <KPICard
              label={label}
              value={value}
              icon={
                <span className="flex items-center gap-1">
                  <Icon size={14} style={{ color: iconColor }} />
                  {expandedKPI === key ? (
                    <ChevronUp size={12} style={{ color: "var(--text-dim)" }} />
                  ) : (
                    <ChevronDown size={12} style={{ color: "var(--text-dim)" }} />
                  )}
                </span>
              }
            />
          </div>
        ))}

        {/* Detail panel spans full width below the cards */}
        {expandedKPI && renderDetailPanel(expandedKPI)}
      </div>

      {/* ===== Secondary KPIs ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard
          label="CPL"
          value={kpis.cpl > 0 ? formatBRL(kpis.cpl) : "--"}
          meta={metas.cpl > 0 ? `≤ ${formatBRL(metas.cpl)}` : undefined}
          status={cplStatus}
        />
        <KPICard
          label="CAC"
          value={kpis.cac > 0 ? formatBRL(kpis.cac) : "--"}
          meta={metas.cac > 0 ? `≤ ${formatBRL(metas.cac)}` : undefined}
          status={cacStatus}
        />
        <KPICard
          label="ROI"
          value={kpis.roi > 0 ? kpis.roi.toFixed(1) + "x" : "--"}
          meta={metas.roi > 0 ? `≥ ${metas.roi}x` : undefined}
          status={roiStatus}
        />
        <KPICard
          label="VSO"
          value={vso > 0 ? formatPercent(vso) : "--"}
          meta={metas.vso > 0 ? `≥ ${metas.vso}%` : undefined}
          status={vsoStatus}
        />
        <KPICard
          label="LTV"
          value={
            kpis.totalVendas > 0
              ? formatBRL(kpis.totalValorVendas / kpis.totalVendas)
              : "--"
          }
          meta="Valor médio/cliente"
        />
      </div>

      {/* ===== Charts: Leads por Canal + Investimento por Canal ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Leads por Canal */}
        <div className="kpi-card">
          <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>
            LEADS POR CANAL
          </h3>
          {leadsChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={leadsChartData} margin={{ left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="nome" tick={axisTick} />
                <YAxis tick={axisTick} allowDecimals={false} />
                <Tooltip
                  {...tooltipStyle}
                  labelFormatter={(_, p) => (p[0]?.payload as { nomeCompleto?: string })?.nomeCompleto ?? ""}
                  formatter={(v) => [formatNumber(Number(v)), "Leads"]}
                />
                <Bar dataKey="leads" name="Leads" radius={[4, 4, 0, 0]}>
                  {leadsChartData.map((c) => (
                    <Cell key={c.nome} fill={c.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div
              className="flex items-center justify-center"
              style={{ height: 250, color: "var(--text-dim)", fontSize: "0.875rem" }}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <RefreshCw size={14} className="animate-spin" /> Carregando...
                </span>
              ) : (
                "Sem leads no período"
              )}
            </div>
          )}
        </div>

        {/* Investimento por Canal */}
        <div className="kpi-card">
          <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>
            INVESTIMENTO POR CANAL
          </h3>
          {investChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={investChartData} margin={{ left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="nome" tick={axisTick} />
                <YAxis
                  tick={axisTick}
                  tickFormatter={(v: number) =>
                    v >= 1000000
                      ? (v / 1000000).toFixed(1) + "M"
                      : v >= 1000
                      ? (v / 1000).toFixed(0) + "K"
                      : String(v)
                  }
                />
                <Tooltip
                  {...tooltipStyle}
                  labelFormatter={(_, p) => (p[0]?.payload as { nomeCompleto?: string })?.nomeCompleto ?? ""}
                  formatter={(v) => [formatBRL(Number(v)), "Investimento"]}
                />
                <Bar dataKey="investimento" name="Investimento" radius={[4, 4, 0, 0]}>
                  {investChartData.map((c) => (
                    <Cell key={c.nome} fill={c.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div
              className="flex items-center justify-center"
              style={{ height: 250, color: "var(--text-dim)", fontSize: "0.875rem" }}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <RefreshCw size={14} className="animate-spin" /> Carregando...
                </span>
              ) : (
                "Sem investimento registrado"
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===== Funil de Vendas ===== */}
      <div className="kpi-card">
        <h3 className="text-sm font-bold mb-6" style={{ color: "var(--text-muted)" }}>
          FUNIL DE VENDAS
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {(() => {
            const stages = [
              { label: "Total Leads", value: kpis.totalLeads, color: "#4285f4" },
              { label: "Leads Convertidos", value: crmConvertidos, color: "#8b5cf6" },
              { label: "Vendas Realizadas", value: kpis.totalVendas, color: "#10b981" },
            ];
            const maxValue = Math.max(kpis.totalLeads, 1);

            function funnelRate(from: number, to: number) {
              return from > 0 ? ((to / from) * 100).toFixed(1) + "%" : "--";
            }

            return stages.map((stage, i) => {
              const widthPct = Math.max((stage.value / maxValue) * 100, 8);
              const nextStage = stages[i + 1];
              return (
                <div key={stage.label}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      marginBottom: nextStage ? "0.25rem" : 0,
                    }}
                  >
                    <div
                      style={{
                        width: "160px",
                        flexShrink: 0,
                        textAlign: "right",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "var(--text-muted)",
                      }}
                    >
                      {stage.label}
                    </div>
                    <div style={{ flex: 1 }}>
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
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        marginBottom: "0.25rem",
                      }}
                    >
                      <div style={{ width: "160px", flexShrink: 0 }} />
                      <div
                        style={{
                          fontSize: "0.7rem",
                          fontWeight: 600,
                          color: "var(--text-dim)",
                          paddingLeft: "0.5rem",
                        }}
                      >
                        ↓ {funnelRate(stage.value, nextStage.value)}
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
