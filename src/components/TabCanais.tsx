"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, PieChart, Pie, Cell } from "recharts";
import { MetricsData, calcKPIsPorCanal, formatBRL, formatNumber } from "@/lib/types";

interface Props {
  data: MetricsData;
}

const COLORS = ["#e94560", "#4285f4", "#10b981", "#f4a236", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316"];

export default function TabCanais({ data }: Props) {
  const canalStats = data.config.canais.map((canal, i) => {
    const stats = calcKPIsPorCanal(data.semanas, canal);
    return { canal, ...stats, color: COLORS[i % COLORS.length] };
  });

  const hasData = canalStats.some((c) => c.investimento > 0 || c.leads > 0);

  const pieLeads = canalStats.filter((c) => c.leads > 0).map((c) => ({
    name: c.canal,
    value: c.leads,
    color: c.color,
  }));

  const pieInvestimento = canalStats.filter((c) => c.investimento > 0).map((c) => ({
    name: c.canal,
    value: c.investimento,
    color: c.color,
  }));

  const tooltipStyle = {
    contentStyle: { background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "0.75rem", color: "#e2e8f0" },
    labelStyle: { color: "#94a3b8" },
  };

  if (!hasData) {
    return (
      <div className="kpi-card text-center py-12">
        <p className="text-lg font-bold" style={{ color: "#64748b" }}>Nenhum dado por canal ainda</p>
        <p className="text-sm mt-2" style={{ color: "#475569" }}>
          Insira dados semanais para ver a performance por canal.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tabela de canais */}
      <div className="kpi-card overflow-x-auto">
        <h3 className="text-sm font-bold mb-4" style={{ color: "#94a3b8" }}>PERFORMANCE POR CANAL</h3>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <th className="text-left py-3 px-2 font-semibold" style={{ color: "#64748b" }}>Canal</th>
              <th className="text-right py-3 px-2 font-semibold" style={{ color: "#64748b" }}>Investimento</th>
              <th className="text-right py-3 px-2 font-semibold" style={{ color: "#64748b" }}>Leads</th>
              <th className="text-right py-3 px-2 font-semibold" style={{ color: "#64748b" }}>CPL</th>
              <th className="text-right py-3 px-2 font-semibold" style={{ color: "#64748b" }}>Vendas</th>
              <th className="text-right py-3 px-2 font-semibold" style={{ color: "#64748b" }}>CAC</th>
              <th className="text-right py-3 px-2 font-semibold" style={{ color: "#64748b" }}>ROI</th>
            </tr>
          </thead>
          <tbody>
            {canalStats.map((c) => (
              <tr key={c.canal} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }} className="hover:bg-white/[0.02]">
                <td className="py-3 px-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
                    <span style={{ color: "#e2e8f0" }}>{c.canal}</span>
                  </div>
                </td>
                <td className="text-right py-3 px-2" style={{ color: "#cbd5e1" }}>{formatBRL(c.investimento)}</td>
                <td className="text-right py-3 px-2" style={{ color: "#cbd5e1" }}>{formatNumber(c.leads)}</td>
                <td className="text-right py-3 px-2" style={{ color: c.cpl > 0 && c.cpl <= 50 ? "#10b981" : c.cpl > 50 ? "#e94560" : "#64748b" }}>
                  {c.cpl > 0 ? formatBRL(c.cpl) : "—"}
                </td>
                <td className="text-right py-3 px-2" style={{ color: "#cbd5e1" }}>{formatNumber(c.vendas)}</td>
                <td className="text-right py-3 px-2" style={{ color: c.cac > 0 && c.cac <= 11250 ? "#10b981" : c.cac > 11250 ? "#e94560" : "#64748b" }}>
                  {c.cac > 0 ? formatBRL(c.cac) : "—"}
                </td>
                <td className="text-right py-3 px-2" style={{ color: c.roi >= 3.5 ? "#10b981" : c.roi > 0 ? "#f4a236" : "#64748b" }}>
                  {c.roi > 0 ? c.roi.toFixed(1) + "x" : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Gráficos de pizza */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {pieLeads.length > 0 && (
          <div className="kpi-card">
            <h3 className="text-sm font-bold mb-4" style={{ color: "#94a3b8" }}>LEADS POR CANAL</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieLeads} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                  {pieLeads.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {pieInvestimento.length > 0 && (
          <div className="kpi-card">
            <h3 className="text-sm font-bold mb-4" style={{ color: "#94a3b8" }}>INVESTIMENTO POR CANAL</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={canalStats.filter((c) => c.investimento > 0)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" tick={{ fill: "#64748b", fontSize: 11 }} />
                <YAxis dataKey="canal" type="category" tick={{ fill: "#94a3b8", fontSize: 11 }} width={110} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="investimento" name="Investimento (R$)" radius={[0, 4, 4, 0]}>
                  {canalStats.filter((c) => c.investimento > 0).map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
