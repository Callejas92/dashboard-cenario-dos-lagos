"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from "recharts";
import KPICard from "./KPICard";
import { MetricsData, calcKPIs, formatBRL, formatPercent, formatNumber } from "@/lib/types";
import { DollarSign, Users, ShoppingCart, Target } from "lucide-react";

interface Props {
  data: MetricsData;
}

export default function TabVisaoGeral({ data }: Props) {
  const kpis = calcKPIs(data.semanas, data.config.metas, data.config.vgv);

  const weeklyChart = data.semanas.map((s) => {
    let inv = 0, leads = 0, vendas = 0, valor = 0;
    for (const c of Object.values(s.canais)) {
      inv += c.investimento;
      leads += c.leads;
      vendas += c.vendas;
      valor += c.valorVendas;
    }
    return {
      name: `S${s.semana}`,
      investimento: inv,
      leads,
      vendas,
      valorVendas: valor,
    };
  });

  const cplStatus = kpis.cpl === 0 ? "neutral" : kpis.cpl <= kpis.metaCpl ? "good" : "bad";
  const cacStatus = kpis.cac === 0 ? "neutral" : kpis.cac <= kpis.metaCac ? "good" : "bad";
  const roiStatus = kpis.roi === 0 ? "neutral" : kpis.roi >= kpis.metaRoi ? "good" : "bad";
  const vsoStatus = kpis.vso === 0 ? "neutral" : kpis.vso >= kpis.metaVso ? "good" : "bad";

  const tooltipStyle = {
    contentStyle: { background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "0.75rem", color: "#e2e8f0" },
    labelStyle: { color: "#94a3b8" },
  };

  return (
    <div className="space-y-6">
      {/* KPIs principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Investimento Total"
          value={formatBRL(kpis.totalInvestimento)}
          icon={<DollarSign size={14} style={{ color: "#f4a236" }} />}
        />
        <KPICard
          label="Total de Leads"
          value={formatNumber(kpis.totalLeads)}
          icon={<Users size={14} style={{ color: "#4285f4" }} />}
        />
        <KPICard
          label="Vendas Realizadas"
          value={formatNumber(kpis.totalVendas)}
          icon={<ShoppingCart size={14} style={{ color: "#10b981" }} />}
        />
        <KPICard
          label="Receita Total"
          value={formatBRL(kpis.totalValorVendas)}
          icon={<Target size={14} style={{ color: "#e94560" }} />}
        />
      </div>

      {/* KPIs com metas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="CPL" value={kpis.cpl > 0 ? formatBRL(kpis.cpl) : "—"} meta={`≤ ${formatBRL(kpis.metaCpl)}`} status={cplStatus} />
        <KPICard label="CAC" value={kpis.cac > 0 ? formatBRL(kpis.cac) : "—"} meta={`≤ ${formatBRL(kpis.metaCac)}`} status={cacStatus} />
        <KPICard label="ROI" value={kpis.roi > 0 ? kpis.roi.toFixed(1) + "x" : "—"} meta={`≥ ${kpis.metaRoi}x`} status={roiStatus} />
        <KPICard label="VSO" value={kpis.vso > 0 ? formatPercent(kpis.vso) : "—"} meta={`≥ ${kpis.metaVso}%`} status={vsoStatus} />
      </div>

      {/* Gráficos */}
      {weeklyChart.length > 0 && (
        <>
          <div className="kpi-card">
            <h3 className="text-sm font-bold mb-4" style={{ color: "#94a3b8" }}>INVESTIMENTO x LEADS POR SEMANA</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={weeklyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fill: "#64748b", fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: "#64748b", fontSize: 11 }} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
                <Bar yAxisId="left" dataKey="investimento" name="Investimento (R$)" fill="#e94560" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="right" dataKey="leads" name="Leads" fill="#4285f4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="kpi-card">
            <h3 className="text-sm font-bold mb-4" style={{ color: "#94a3b8" }}>VENDAS E RECEITA ACUMULADA</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={weeklyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 11 }} />
                <YAxis tick={{ fill: "#64748b", fontSize: 11 }} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
                <Line type="monotone" dataKey="vendas" name="Vendas" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="valorVendas" name="Receita (R$)" stroke="#f4a236" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {weeklyChart.length === 0 && (
        <div className="kpi-card text-center py-12">
          <p className="text-lg font-bold" style={{ color: "#64748b" }}>Nenhum dado inserido ainda</p>
          <p className="text-sm mt-2" style={{ color: "#475569" }}>
            Use a aba "Inserir Dados" para adicionar as métricas semanais.
          </p>
        </div>
      )}
    </div>
  );
}
