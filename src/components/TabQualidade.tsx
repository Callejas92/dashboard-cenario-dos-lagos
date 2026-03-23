"use client";

import {
  BarChart,
  Bar,
  Cell,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";
import KPICard from "./KPICard";
import { MetricsData, calcKPIs, formatPercent, formatNumber } from "@/lib/types";
import { UserCheck, CalendarCheck, Clock, TrendingUp } from "lucide-react";

interface Props {
  data: MetricsData;
}

export default function TabQualidade({ data }: Props) {
  const kpis = calcKPIs(data.semanas, data.config.metas, data.config.vgv);

  // --- Per-week calculations ---
  const weeklyQuality = data.semanas.map((s) => {
    let leads = 0,
      qualificados = 0,
      comparecimentos = 0,
      slaTotal = 0,
      slaCount = 0;
    for (const c of Object.values(s.canais)) {
      leads += c.leads;
      qualificados += c.leadsQualificados;
      comparecimentos += c.comparecimentos;
      if (c.slaRespostaMin > 0) {
        slaTotal += c.slaRespostaMin;
        slaCount++;
      }
    }
    return {
      name: `S${s.semana}`,
      tlq: leads > 0 ? (qualificados / leads) * 100 : 0,
      tcs: qualificados > 0 ? (comparecimentos / qualificados) * 100 : 0,
      avgSla: slaCount > 0 ? slaTotal / slaCount : 0,
    };
  });

  // --- Funnel totals ---
  let totalLeads = 0,
    totalQualificados = 0,
    totalComparecimentos = 0,
    totalVendas = 0;
  for (const s of data.semanas) {
    for (const c of Object.values(s.canais)) {
      totalLeads += c.leads;
      totalQualificados += c.leadsQualificados;
      totalComparecimentos += c.comparecimentos;
      totalVendas += c.vendas;
    }
  }

  // --- SLA KPI: % of weeks with avg SLA <= 5min ---
  const weeksWithSla = weeklyQuality.filter((w) => w.avgSla > 0);
  const weeksWithinSla = weeksWithSla.filter((w) => w.avgSla <= 5);
  const slaPct = weeksWithSla.length > 0 ? (weeksWithinSla.length / weeksWithSla.length) * 100 : 0;

  // --- Taxa de Conversao ---
  const taxaConversao = totalLeads > 0 ? (totalVendas / totalLeads) * 100 : 0;

  // --- SLA distribution buckets ---
  const slaBuckets = [
    { label: "\u2264 5min", count: 0, color: "#10b981" },
    { label: "5-15min", count: 0, color: "#eab308" },
    { label: "15-30min", count: 0, color: "#f97316" },
    { label: "> 30min", count: 0, color: "#e94560" },
  ];
  for (const w of weeksWithSla) {
    if (w.avgSla <= 5) slaBuckets[0].count++;
    else if (w.avgSla <= 15) slaBuckets[1].count++;
    else if (w.avgSla <= 30) slaBuckets[2].count++;
    else slaBuckets[3].count++;
  }

  // --- Quality by channel ---
  const channelMap: Record<string, { leads: number; qualificados: number; comparecimentos: number }> = {};
  for (const s of data.semanas) {
    for (const [name, c] of Object.entries(s.canais)) {
      if (!channelMap[name]) channelMap[name] = { leads: 0, qualificados: 0, comparecimentos: 0 };
      channelMap[name].leads += c.leads;
      channelMap[name].qualificados += c.leadsQualificados;
      channelMap[name].comparecimentos += c.comparecimentos;
    }
  }
  const channelQuality = Object.entries(channelMap)
    .map(([canal, d]) => ({
      canal,
      leads: d.leads,
      qualificados: d.qualificados,
      tlq: d.leads > 0 ? (d.qualificados / d.leads) * 100 : 0,
      comparecimentos: d.comparecimentos,
      tcs: d.qualificados > 0 ? (d.comparecimentos / d.qualificados) * 100 : 0,
    }))
    .sort((a, b) => b.tlq - a.tlq);

  // --- Statuses ---
  const tlqStatus = kpis.tlq === 0 ? "neutral" : kpis.tlq >= kpis.metaTlq ? "good" : "bad";
  const tcsStatus = kpis.tcs === 0 ? "neutral" : kpis.tcs >= kpis.metaTcs ? "good" : "bad";
  const slaStatus = slaPct === 0 ? "neutral" : slaPct >= 80 ? "good" : "bad";
  const convStatus = taxaConversao === 0 ? "neutral" : taxaConversao >= 2 ? "good" : "bad";

  const hasData = data.semanas.length > 0;

  const tooltipStyle = {
    contentStyle: {
      background: "var(--tooltip-bg)",
      border: "1px solid var(--tooltip-border)",
      borderRadius: "0.75rem",
      color: "var(--tooltip-text)",
    },
    labelStyle: { color: "var(--tooltip-label)" },
  };

  // --- Funnel stages ---
  const funnelStages = [
    { label: "Total Leads", value: totalLeads, color: "#6366f1" },
    { label: "Leads Qualificados", value: totalQualificados, color: "#10b981" },
    { label: "Comparecimentos", value: totalComparecimentos, color: "#4285f4" },
    { label: "Vendas", value: totalVendas, color: "#f59e0b" },
  ];

  const maxFunnel = Math.max(...funnelStages.map((s) => s.value), 1);

  return (
    <div className="space-y-6">
      {/* 1. KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="TLQ — Taxa Lead Qualificado"
          value={kpis.tlq > 0 ? formatPercent(kpis.tlq) : "\u2014"}
          meta={`\u2265 ${kpis.metaTlq}%`}
          status={tlqStatus}
          icon={
            <UserCheck
              size={14}
              style={{
                color: tlqStatus === "good" ? "#10b981" : tlqStatus === "bad" ? "#e94560" : "var(--text-muted)",
              }}
            />
          }
        />
        <KPICard
          label="TCS — Taxa de Comparecimento"
          value={kpis.tcs > 0 ? formatPercent(kpis.tcs) : "\u2014"}
          meta={`\u2265 ${kpis.metaTcs}%`}
          status={tcsStatus}
          icon={
            <CalendarCheck
              size={14}
              style={{
                color: tcsStatus === "good" ? "#10b981" : tcsStatus === "bad" ? "#e94560" : "var(--text-muted)",
              }}
            />
          }
        />
        <KPICard
          label="SLA Atendimento"
          value={weeksWithSla.length > 0 ? `${formatPercent(slaPct)} em at\u00e9 5min` : "\u2014"}
          meta={`\u2265 80% dentro do SLA`}
          status={slaStatus}
          icon={
            <Clock
              size={14}
              style={{
                color: slaStatus === "good" ? "#10b981" : slaStatus === "bad" ? "#e94560" : "var(--text-muted)",
              }}
            />
          }
        />
        <KPICard
          label="Taxa de Convers\u00e3o"
          value={taxaConversao > 0 ? formatPercent(taxaConversao) : "\u2014"}
          meta="Vendas / Leads"
          status={convStatus}
          icon={
            <TrendingUp
              size={14}
              style={{
                color: convStatus === "good" ? "#10b981" : convStatus === "bad" ? "#e94560" : "var(--text-muted)",
              }}
            />
          }
        />
      </div>

      {hasData ? (
        <>
          {/* 2. Conversion Funnel */}
          <div className="kpi-card">
            <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>
              FUNIL DE CONVERS\u00c3O
            </h3>
            <div className="space-y-3">
              {funnelStages.map((stage, i) => {
                const widthPct = maxFunnel > 0 ? (stage.value / maxFunnel) * 100 : 0;
                const prevStage = i > 0 ? funnelStages[i - 1] : null;
                const convPct = prevStage && prevStage.value > 0 ? (stage.value / prevStage.value) * 100 : null;
                return (
                  <div key={stage.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>
                        {stage.label}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold" style={{ color: "var(--text)" }}>
                          {formatNumber(stage.value)}
                        </span>
                        {convPct !== null && (
                          <span
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{ background: "var(--surface)", color: "var(--text-muted)" }}
                          >
                            {formatPercent(convPct)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div
                      className="rounded"
                      style={{
                        height: "28px",
                        width: `${Math.max(widthPct, 2)}%`,
                        background: stage.color,
                        opacity: 0.85,
                        transition: "width 0.4s ease",
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Weekly Quality Chart */}
          <div className="kpi-card">
            <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>
              TLQ E TCS POR SEMANA
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={weeklyQuality}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="name" tick={{ fill: "var(--text-dim)", fontSize: 11 }} />
                <YAxis tick={{ fill: "var(--text-dim)", fontSize: 11 }} domain={[0, 100]} />
                <Tooltip {...tooltipStyle} formatter={(value) => formatPercent(Number(value ?? 0))} />
                <Legend wrapperStyle={{ color: "var(--text-muted)", fontSize: 12 }} />
                <ReferenceLine
                  y={data.config.metas.tlq}
                  stroke="#10b981"
                  strokeDasharray="5 5"
                  label={{
                    value: `Meta TLQ ${data.config.metas.tlq}%`,
                    fill: "#10b981",
                    fontSize: 10,
                  }}
                />
                <ReferenceLine
                  y={data.config.metas.tcs}
                  stroke="#4285f4"
                  strokeDasharray="5 5"
                  label={{
                    value: `Meta TCS ${data.config.metas.tcs}%`,
                    fill: "#4285f4",
                    fontSize: 10,
                  }}
                />
                <Bar dataKey="tlq" name="TLQ (%)" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="tcs" name="TCS (%)" fill="#4285f4" radius={[4, 4, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* 4. Response Time Distribution */}
          <div className="kpi-card">
            <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>
              DISTRIBUI\u00c7\u00c3O TEMPO DE RESPOSTA
            </h3>
            {weeksWithSla.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={slaBuckets}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="label" tick={{ fill: "var(--text-dim)", fontSize: 11 }} />
                  <YAxis
                    tick={{ fill: "var(--text-dim)", fontSize: 11 }}
                    allowDecimals={false}
                    label={{
                      value: "Semanas",
                      angle: -90,
                      position: "insideLeft",
                      fill: "var(--text-dim)",
                      fontSize: 11,
                    }}
                  />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(value) => [`${Number(value ?? 0)} semana${Number(value ?? 0) !== 1 ? "s" : ""}`, "Quantidade"]}
                  />
                  <Bar dataKey="count" name="Semanas" radius={[4, 4, 0, 0]}>
                    {slaBuckets.map((bucket, i) => (
                      <Cell key={i} fill={bucket.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-center py-8" style={{ color: "var(--text-dim)" }}>
                Sem dados de SLA dispon\u00edveis
              </p>
            )}
            {weeksWithSla.length > 0 && (
              <div className="flex justify-center gap-4 mt-3">
                {slaBuckets.map((b) => (
                  <div key={b.label} className="flex items-center gap-1.5">
                    <div className="rounded" style={{ width: 10, height: 10, background: b.color }} />
                    <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                      {b.label}: {b.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 5. Quality by Channel */}
          {channelQuality.length > 0 && (
            <div className="kpi-card">
              <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>
                QUALIDADE POR CANAL
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ color: "var(--text)" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <th className="text-left py-2 px-3 text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                        Canal
                      </th>
                      <th
                        className="text-right py-2 px-3 text-xs font-semibold"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Leads
                      </th>
                      <th
                        className="text-right py-2 px-3 text-xs font-semibold"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Qualificados
                      </th>
                      <th
                        className="text-right py-2 px-3 text-xs font-semibold"
                        style={{ color: "var(--text-muted)" }}
                      >
                        TLQ%
                      </th>
                      <th
                        className="text-right py-2 px-3 text-xs font-semibold"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Comparec.
                      </th>
                      <th
                        className="text-right py-2 px-3 text-xs font-semibold"
                        style={{ color: "var(--text-muted)" }}
                      >
                        TCS%
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {channelQuality.map((ch) => (
                      <tr key={ch.canal} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td className="py-2 px-3 font-medium">{ch.canal}</td>
                        <td className="py-2 px-3 text-right">{formatNumber(ch.leads)}</td>
                        <td className="py-2 px-3 text-right">{formatNumber(ch.qualificados)}</td>
                        <td className="py-2 px-3 text-right">
                          <span
                            className="font-semibold"
                            style={{ color: ch.tlq >= data.config.metas.tlq ? "#10b981" : "#e94560" }}
                          >
                            {formatPercent(ch.tlq)}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right">{formatNumber(ch.comparecimentos)}</td>
                        <td className="py-2 px-3 text-right">
                          <span
                            className="font-semibold"
                            style={{ color: ch.tcs >= data.config.metas.tcs ? "#10b981" : "#e94560" }}
                          >
                            {formatPercent(ch.tcs)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="kpi-card text-center py-12">
          <p className="text-lg font-bold" style={{ color: "var(--text-dim)" }}>
            Nenhum dado de qualidade ainda
          </p>
          <p className="text-sm mt-2" style={{ color: "var(--text-dim)" }}>
            Insira dados semanais incluindo leads qualificados, comparecimentos e SLA.
          </p>
        </div>
      )}
    </div>
  );
}
