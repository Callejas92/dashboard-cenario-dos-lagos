"use client";

import { useState, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Legend, ComposedChart,
} from "recharts";
import { DollarSign, Users, ShoppingCart, Target, ChevronDown, ChevronUp } from "lucide-react";
import KPICard from "./KPICard";
import { MetricsData, calcKPIs, formatBRL, formatPercent, formatNumber } from "@/lib/types";

interface Props {
  data: MetricsData;
}

type SparklineKey = "investimento" | "leads" | "vendas" | "valorVendas";

export default function TabVisaoGeral({ data }: Props) {
  const kpis = calcKPIs(data.semanas, data.config.metas, data.config.vgv);

  const [expandedKPI, setExpandedKPI] = useState<SparklineKey | null>(null);
  const [viewMode, setViewMode] = useState<"semanal" | "acumulado">("semanal");

  // ---------- Weekly data ----------
  const weeklyData = useMemo(() => {
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
      return {
        name: `S${s.semana}`,
        investimento: inv,
        leads,
        vendas,
        valorVendas: valor,
        leadsQualificados: lq,
        comparecimentos: comp,
      };
    });
  }, [data.semanas]);

  // ---------- Cumulative data ----------
  const cumulativeData = useMemo(() => {
    let cumInv = 0, cumLeads = 0, cumVendas = 0, cumValor = 0;
    let cumLq = 0, cumComp = 0;
    return weeklyData.map((w) => {
      cumInv += w.investimento;
      cumLeads += w.leads;
      cumVendas += w.vendas;
      cumValor += w.valorVendas;
      cumLq += w.leadsQualificados;
      cumComp += w.comparecimentos;
      return {
        name: w.name,
        investimento: cumInv,
        leads: cumLeads,
        vendas: cumVendas,
        valorVendas: cumValor,
        leadsQualificados: cumLq,
        comparecimentos: cumComp,
      };
    });
  }, [weeklyData]);

  const chartData = viewMode === "semanal" ? weeklyData : cumulativeData;

  // ---------- Funnel totals ----------
  const funnelTotals = useMemo(() => {
    let leads = 0, lq = 0, comp = 0, vendas = 0;
    for (const w of weeklyData) {
      leads += w.leads;
      lq += w.leadsQualificados;
      comp += w.comparecimentos;
      vendas += w.vendas;
    }
    return { leads, lq, comp, vendas };
  }, [weeklyData]);

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

  // ---------- Toggle sparkline ----------
  function toggleSparkline(key: SparklineKey) {
    setExpandedKPI((prev) => (prev === key ? null : key));
  }

  // ---------- Mini sparkline ----------
  function renderSparkline(dataKey: SparklineKey, color: string) {
    if (expandedKPI !== dataKey || weeklyData.length === 0) return null;
    return (
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "0.5rem",
          padding: "0.5rem",
          marginTop: "0.25rem",
        }}
      >
        <ResponsiveContainer width="100%" height={60}>
          <LineChart data={weeklyData}>
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              dot={false}
            />
            <Tooltip
              {...tooltipStyle}
              formatter={(v) =>
                dataKey === "leads" || dataKey === "vendas"
                  ? formatNumber(Number(v ?? 0))
                  : formatBRL(Number(v ?? 0))
              }
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // ---------- Funnel helpers ----------
  function funnelRate(from: number, to: number) {
    return from > 0 ? ((to / from) * 100).toFixed(1) + "%" : "—";
  }

  // ---------- Empty state ----------
  if (weeklyData.length === 0) {
    return (
      <div className="kpi-card text-center py-12">
        <p className="text-lg font-bold" style={{ color: "var(--text-dim)" }}>
          Nenhum dado inserido ainda
        </p>
        <p className="text-sm mt-2" style={{ color: "var(--text-dim)" }}>
          Use a aba &quot;Inserir Dados&quot; para adicionar as m&eacute;tricas semanais.
        </p>
      </div>
    );
  }

  // ---------- Render ----------
  return (
    <div className="space-y-6">
      {/* ===== 1. KPI Cards - Main (clickable with sparklines) ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Investimento Total */}
        <div>
          <div
            onClick={() => toggleSparkline("investimento")}
            style={{ cursor: "pointer" }}
          >
            <KPICard
              label="Investimento Total"
              value={formatBRL(kpis.totalInvestimento)}
              icon={
                <span className="flex items-center gap-1">
                  <DollarSign size={14} style={{ color: "#f4a236" }} />
                  {expandedKPI === "investimento" ? (
                    <ChevronUp size={12} style={{ color: "var(--text-dim)" }} />
                  ) : (
                    <ChevronDown size={12} style={{ color: "var(--text-dim)" }} />
                  )}
                </span>
              }
            />
          </div>
          {renderSparkline("investimento", "#f4a236")}
        </div>

        {/* Total Leads */}
        <div>
          <div
            onClick={() => toggleSparkline("leads")}
            style={{ cursor: "pointer" }}
          >
            <KPICard
              label="Total de Leads"
              value={formatNumber(kpis.totalLeads)}
              icon={
                <span className="flex items-center gap-1">
                  <Users size={14} style={{ color: "#4285f4" }} />
                  {expandedKPI === "leads" ? (
                    <ChevronUp size={12} style={{ color: "var(--text-dim)" }} />
                  ) : (
                    <ChevronDown size={12} style={{ color: "var(--text-dim)" }} />
                  )}
                </span>
              }
            />
          </div>
          {renderSparkline("leads", "#4285f4")}
        </div>

        {/* Vendas */}
        <div>
          <div
            onClick={() => toggleSparkline("vendas")}
            style={{ cursor: "pointer" }}
          >
            <KPICard
              label="Vendas Realizadas"
              value={formatNumber(kpis.totalVendas)}
              icon={
                <span className="flex items-center gap-1">
                  <ShoppingCart size={14} style={{ color: "#10b981" }} />
                  {expandedKPI === "vendas" ? (
                    <ChevronUp size={12} style={{ color: "var(--text-dim)" }} />
                  ) : (
                    <ChevronDown size={12} style={{ color: "var(--text-dim)" }} />
                  )}
                </span>
              }
            />
          </div>
          {renderSparkline("vendas", "#10b981")}
        </div>

        {/* Receita */}
        <div>
          <div
            onClick={() => toggleSparkline("valorVendas")}
            style={{ cursor: "pointer" }}
          >
            <KPICard
              label="Receita Total"
              value={formatBRL(kpis.totalValorVendas)}
              icon={
                <span className="flex items-center gap-1">
                  <Target size={14} style={{ color: "#e94560" }} />
                  {expandedKPI === "valorVendas" ? (
                    <ChevronUp size={12} style={{ color: "var(--text-dim)" }} />
                  ) : (
                    <ChevronDown size={12} style={{ color: "var(--text-dim)" }} />
                  )}
                </span>
              }
            />
          </div>
          {renderSparkline("valorVendas", "#e94560")}
        </div>
      </div>

      {/* ===== 2. Secondary KPIs with metas ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="CPL"
          value={kpis.cpl > 0 ? formatBRL(kpis.cpl) : "—"}
          meta={`\u2264 ${formatBRL(kpis.metaCpl)}`}
          status={cplStatus}
        />
        <KPICard
          label="CAC"
          value={kpis.cac > 0 ? formatBRL(kpis.cac) : "—"}
          meta={`\u2264 ${formatBRL(kpis.metaCac)}`}
          status={cacStatus}
        />
        <KPICard
          label="ROI"
          value={kpis.roi > 0 ? kpis.roi.toFixed(1) + "x" : "—"}
          meta={`\u2265 ${kpis.metaRoi}x`}
          status={roiStatus}
        />
        <KPICard
          label="VSO"
          value={kpis.vso > 0 ? formatPercent(kpis.vso) : "—"}
          meta={`\u2265 ${kpis.metaVso}%`}
          status={vsoStatus}
        />
      </div>

      {/* ===== View mode toggle ===== */}
      <div className="flex justify-end">
        <div
          style={{
            display: "inline-flex",
            borderRadius: "0.5rem",
            overflow: "hidden",
            border: "1px solid var(--border)",
          }}
        >
          <button
            onClick={() => setViewMode("semanal")}
            style={{
              padding: "0.375rem 1rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              background: viewMode === "semanal" ? "#e94560" : "var(--surface)",
              color: viewMode === "semanal" ? "#fff" : "var(--text-muted)",
              border: "none",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            Semanal
          </button>
          <button
            onClick={() => setViewMode("acumulado")}
            style={{
              padding: "0.375rem 1rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              background: viewMode === "acumulado" ? "#e94560" : "var(--surface)",
              color: viewMode === "acumulado" ? "#fff" : "var(--text-muted)",
              border: "none",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            Acumulado
          </button>
        </div>
      </div>

      {/* ===== 3. Chart: Leads x Vendas (ComposedChart) ===== */}
      <div className="kpi-card">
        <h3
          className="text-sm font-bold mb-4"
          style={{ color: "var(--text-muted)" }}
        >
          LEADS x VENDAS POR SEMANA
        </h3>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis dataKey="name" tick={axisTick} />
            <YAxis
              yAxisId="left"
              tick={axisTick}
              label={{
                value: "Leads",
                angle: -90,
                position: "insideLeft",
                style: { fill: "var(--text-dim)", fontSize: 11 },
              }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={axisTick}
              label={{
                value: "Vendas",
                angle: 90,
                position: "insideRight",
                style: { fill: "var(--text-dim)", fontSize: 11 },
              }}
            />
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ color: "var(--text-muted)", fontSize: 12 }} />
            <Bar
              yAxisId="left"
              dataKey="leads"
              name="Leads"
              fill="#4285f4"
              radius={[4, 4, 0, 0]}
              opacity={0.85}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="vendas"
              name="Vendas"
              stroke="#10b981"
              strokeWidth={2.5}
              dot={{ r: 4, fill: "#10b981" }}
              activeDot={{ r: 6 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ===== 4. Chart: Receita x Investimento (AreaChart) ===== */}
      <div className="kpi-card">
        <h3
          className="text-sm font-bold mb-4"
          style={{ color: "var(--text-muted)" }}
        >
          RECEITA x INVESTIMENTO {viewMode === "acumulado" ? "(ACUMULADO)" : "(SEMANAL)"}
        </h3>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={chartData}>
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
                v >= 1000000
                  ? (v / 1000000).toFixed(1) + "M"
                  : v >= 1000
                  ? (v / 1000).toFixed(0) + "K"
                  : String(v)
              }
            />
            <Tooltip
              {...tooltipStyle}
              formatter={(v) => formatBRL(Number(v ?? 0))}
            />
            <Legend wrapperStyle={{ color: "var(--text-muted)", fontSize: 12 }} />
            <Area
              type="monotone"
              dataKey="valorVendas"
              name="Receita (R$)"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#gradReceita)"
            />
            <Area
              type="monotone"
              dataKey="investimento"
              name="Investimento (R$)"
              stroke="#e94560"
              strokeWidth={2}
              fill="url(#gradInvestimento)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ===== 5. Sales Funnel ===== */}
      <div className="kpi-card">
        <h3
          className="text-sm font-bold mb-6"
          style={{ color: "var(--text-muted)" }}
        >
          FUNIL DE VENDAS
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
          {/* Funnel stages */}
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
                  {/* Bar */}
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
                        width: "140px",
                        flexShrink: 0,
                        textAlign: "right",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "var(--text-muted)",
                      }}
                    >
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
                        <span
                          style={{
                            color: "#fff",
                            fontSize: "0.8rem",
                            fontWeight: 700,
                          }}
                        >
                          {formatNumber(stage.value)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Conversion rate between stages */}
                  {nextStage && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        marginBottom: "0.25rem",
                      }}
                    >
                      <div style={{ width: "140px", flexShrink: 0 }} />
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
