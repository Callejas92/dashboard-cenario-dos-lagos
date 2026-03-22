"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine, Cell } from "recharts";
import KPICard from "./KPICard";
import { MetricsData, calcKPIs, formatPercent } from "@/lib/types";
import { UserCheck, CalendarCheck, Clock } from "lucide-react";

interface Props {
  data: MetricsData;
}

export default function TabQualidade({ data }: Props) {
  const kpis = calcKPIs(data.semanas, data.config.metas, data.config.vgv);

  const weeklyQuality = data.semanas.map((s) => {
    let leads = 0, qualificados = 0, comparecimentos = 0, slaTotal = 0, slaCount = 0;
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
      sla: slaCount > 0 ? slaTotal / slaCount : 0,
    };
  });

  const hasData = data.semanas.length > 0;

  const tlqStatus = kpis.tlq === 0 ? "neutral" : kpis.tlq >= kpis.metaTlq ? "good" : "bad";
  const tcsStatus = kpis.tcs === 0 ? "neutral" : kpis.tcs >= kpis.metaTcs ? "good" : "bad";
  const slaStatus = kpis.slaMedia === 0 ? "neutral" : kpis.slaMedia <= kpis.metaSla ? "good" : "bad";

  const tooltipStyle = {
    contentStyle: { background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "0.75rem", color: "#e2e8f0" },
    labelStyle: { color: "#94a3b8" },
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard
          label="TLQ — Taxa Lead Qualificado"
          value={kpis.tlq > 0 ? formatPercent(kpis.tlq) : "—"}
          meta={`≥ ${kpis.metaTlq}%`}
          status={tlqStatus}
          icon={<UserCheck size={14} style={{ color: tlqStatus === "good" ? "#10b981" : tlqStatus === "bad" ? "#e94560" : "#94a3b8" }} />}
        />
        <KPICard
          label="TCS — Taxa Comparecimento"
          value={kpis.tcs > 0 ? formatPercent(kpis.tcs) : "—"}
          meta={`≥ ${kpis.metaTcs}%`}
          status={tcsStatus}
          icon={<CalendarCheck size={14} style={{ color: tcsStatus === "good" ? "#10b981" : tcsStatus === "bad" ? "#e94560" : "#94a3b8" }} />}
        />
        <KPICard
          label="SLA Resposta (média)"
          value={kpis.slaMedia > 0 ? kpis.slaMedia.toFixed(1) + " min" : "—"}
          meta={`≤ ${kpis.metaSla} min`}
          status={slaStatus}
          icon={<Clock size={14} style={{ color: slaStatus === "good" ? "#10b981" : slaStatus === "bad" ? "#e94560" : "#94a3b8" }} />}
        />
      </div>

      {hasData ? (
        <>
          <div className="kpi-card">
            <h3 className="text-sm font-bold mb-4" style={{ color: "#94a3b8" }}>TLQ E TCS POR SEMANA</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={weeklyQuality}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 11 }} />
                <YAxis tick={{ fill: "#64748b", fontSize: 11 }} domain={[0, 100]} />
                <Tooltip {...tooltipStyle} formatter={(value) => formatPercent(Number(value ?? 0))} />
                <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
                <ReferenceLine y={data.config.metas.tlq} stroke="#10b981" strokeDasharray="5 5" label={{ value: `Meta TLQ ${data.config.metas.tlq}%`, fill: "#10b981", fontSize: 10 }} />
                <ReferenceLine y={data.config.metas.tcs} stroke="#4285f4" strokeDasharray="5 5" label={{ value: `Meta TCS ${data.config.metas.tcs}%`, fill: "#4285f4", fontSize: 10 }} />
                <Bar dataKey="tlq" name="TLQ (%)" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="tcs" name="TCS (%)" fill="#4285f4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="kpi-card">
            <h3 className="text-sm font-bold mb-4" style={{ color: "#94a3b8" }}>SLA RESPOSTA POR SEMANA (minutos)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={weeklyQuality}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 11 }} />
                <YAxis tick={{ fill: "#64748b", fontSize: 11 }} />
                <Tooltip {...tooltipStyle} formatter={(value) => Number(value ?? 0).toFixed(1) + " min"} />
                <ReferenceLine y={data.config.metas.slaResposta} stroke="#e94560" strokeDasharray="5 5" label={{ value: `Meta ${data.config.metas.slaResposta} min`, fill: "#e94560", fontSize: 10 }} />
                <Bar dataKey="sla" name="SLA (min)" radius={[4, 4, 0, 0]}>
                  {weeklyQuality.map((entry, i) => (
                    <Cell key={i} fill={entry.sla > 0 && entry.sla <= data.config.metas.slaResposta ? "#10b981" : entry.sla > 0 ? "#e94560" : "#334155"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <div className="kpi-card text-center py-12">
          <p className="text-lg font-bold" style={{ color: "#64748b" }}>Nenhum dado de qualidade ainda</p>
          <p className="text-sm mt-2" style={{ color: "#475569" }}>
            Insira dados semanais incluindo leads qualificados, comparecimentos e SLA.
          </p>
        </div>
      )}
    </div>
  );
}
