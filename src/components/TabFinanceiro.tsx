"use client";

import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, AreaChart, Area,
} from "recharts";
import KPICard from "./KPICard";
import { DollarSign, TrendingUp, AlertTriangle, ShoppingCart, BarChart3, Target, Users } from "lucide-react";
import { formatBRL, FinanceiroResponse } from "@/lib/types";

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}K`;
  return formatBRL(value);
}

function formatMonthLabel(mes: string): string {
  const [y, m] = mes.split("-");
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${months[parseInt(m) - 1]}/${y.slice(2)}`;
}

const tooltipStyle = {
  contentStyle: {
    background: "var(--tooltip-bg)",
    border: "1px solid var(--tooltip-border)",
    borderRadius: "0.75rem",
    color: "var(--tooltip-text)",
  },
  labelStyle: { color: "var(--tooltip-label)" },
};

export default function TabFinanceiro({ data }: { data: FinanceiroResponse }) {
  const { inadimplencia, projecoes, vendasMensais, parcelasAReceber } = data;

  const inadimStatus: "good" | "bad" | "neutral" = inadimplencia.percentualInadimplencia > 10 ? "bad" : inadimplencia.percentualInadimplencia > 5 ? "neutral" : "good";

  // Chart data for monthly sales
  const vendasChartData = useMemo(() =>
    vendasMensais.map((m) => ({
      mes: formatMonthLabel(m.mes),
      vendas: m.vendas,
      valorK: Math.round(m.valor / 1000),
    })),
    [vendasMensais]
  );

  // Parcelas by month for inadimplencia chart
  const parcelasChartData = useMemo(() => {
    const map = new Map<string, { vencidas: number; emDia: number }>();
    for (const p of parcelasAReceber) {
      const mes = p.dataVencimento.substring(0, 7);
      if (!mes || mes.length < 7) continue;
      if (!map.has(mes)) map.set(mes, { vencidas: 0, emDia: 0 });
      const entry = map.get(mes)!;
      if (p.status === "vencida") {
        entry.vencidas += p.valor - p.valorPago;
      } else {
        entry.emDia += p.valor;
      }
    }
    return Array.from(map.entries())
      .map(([mes, vals]) => ({
        mes: formatMonthLabel(mes),
        mesKey: mes,
        vencidasK: Math.round(vals.vencidas / 1000),
        emDiaK: Math.round(vals.emDia / 1000),
      }))
      .sort((a, b) => a.mesKey.localeCompare(b.mesKey));
  }, [parcelasAReceber]);

  // Projection chart data
  const projecaoChartData = useMemo(() => {
    const base = vendasMensais.slice(-6).map((m) => ({
      periodo: formatMonthLabel(m.mes),
      valor: Math.round(m.valor / 1000),
      tipo: "real" as string,
    }));

    if (projecoes.length > 0 && vendasMensais.length > 0) {
      const lastMonth = vendasMensais[vendasMensais.length - 1];
      const [y, m] = lastMonth.mes.split("-").map(Number);
      const avgMensal = projecoes.find((p) => p.meses === 1)?.vendasProjetadasValor || 0;

      for (let i = 1; i <= 12; i++) {
        const newMonth = ((m - 1 + i) % 12) + 1;
        const newYear = y + Math.floor((m - 1 + i) / 12);
        const label = formatMonthLabel(`${newYear}-${String(newMonth).padStart(2, "0")}`);
        base.push({
          periodo: label,
          valor: Math.round(avgMensal / 1000),
          tipo: "projecao",
        });
      }
    }

    return base;
  }, [vendasMensais, projecoes]);

  // Top delinquent
  const topInadimplentes = useMemo(() =>
    parcelasAReceber
      .filter((p) => p.status === "vencida")
      .sort((a, b) => b.diasAtraso - a.diasAtraso)
      .slice(0, 20),
    [parcelasAReceber]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <DollarSign size={18} style={{ color: "#10b981" }} />
        <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>Painel Financeiro</h3>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Valor Vendido Total"
          value={formatCompact(data.valorVendidoTotal)}
          icon={<DollarSign size={14} style={{ color: "#10b981" }} />}
          status="good"
        />
        <KPICard
          label="Ticket Medio"
          value={formatCompact(data.ticketMedio)}
          icon={<BarChart3 size={14} style={{ color: "#4285f4" }} />}
        />
        <KPICard
          label="Total Vendas"
          value={String(data.qtdVendas)}
          icon={<ShoppingCart size={14} style={{ color: "#8b5cf6" }} />}
        />
        <KPICard
          label="Inadimplencia"
          value={`${inadimplencia.percentualInadimplencia.toFixed(1)}%`}
          icon={<AlertTriangle size={14} style={{ color: inadimStatus === "bad" ? "#e94560" : inadimStatus === "neutral" ? "#f4a236" : "#10b981" }} />}
          status={inadimStatus}
        />
      </div>

      {/* Projecao de Vendas */}
      <div className="kpi-card">
        <div className="flex items-center gap-2 mb-4">
          <Target size={14} style={{ color: "#8b5cf6" }} />
          <h3 className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>PROJECAO DE VENDAS</h3>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {projecoes.map((p) => (
            <div key={p.meses} style={{
              padding: "0.75rem",
              borderRadius: "0.75rem",
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}>
              <p className="text-xs font-bold mb-2" style={{ color: "#8b5cf6" }}>{p.periodo.toUpperCase()}</p>
              <div className="space-y-1">
                <div>
                  <p className="text-xs" style={{ color: "var(--text-dim)" }}>Valor Projetado</p>
                  <p className="text-base font-bold" style={{ color: "#10b981" }}>{formatCompact(p.vendasProjetadasValor)}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: "var(--text-dim)" }}>Lotes Projetados</p>
                  <p className="text-base font-bold" style={{ color: "var(--text)" }}>{p.lotesProjetados}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Projection chart: real vs projected */}
        {projecaoChartData.length > 0 && (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={projecaoChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="periodo" tick={{ fill: "var(--text-dim)", fontSize: 10 }} interval={Math.max(0, Math.floor(projecaoChartData.length / 10))} />
              <YAxis tick={{ fill: "var(--text-dim)", fontSize: 10 }} tickFormatter={(v) => `${v}K`} />
              <Tooltip {...tooltipStyle} formatter={(value) => [`R$ ${value}K`, "Valor"]} />
              <Area
                type="monotone"
                dataKey="valor"
                fill="#8b5cf6"
                fillOpacity={0.1}
                stroke="#8b5cf6"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Vendas Mensais */}
      {vendasChartData.length > 0 && (
        <div className="kpi-card">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={14} style={{ color: "#10b981" }} />
            <h3 className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>VENDAS MENSAIS</h3>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={vendasChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="mes" tick={{ fill: "var(--text-dim)", fontSize: 10 }} />
              <YAxis yAxisId="left" tick={{ fill: "var(--text-dim)", fontSize: 10 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: "var(--text-dim)", fontSize: 10 }} tickFormatter={(v) => `${v}K`} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: "0.7rem" }} />
              <Bar yAxisId="left" dataKey="vendas" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Qtd Vendas" />
              <Line yAxisId="right" type="monotone" dataKey="valorK" stroke="#10b981" strokeWidth={2} name="Valor (R$ mil)" dot={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Inadimplencia Detail */}
      <div className="kpi-card">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={14} style={{ color: "#e94560" }} />
          <h3 className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>INADIMPLENCIA</h3>
        </div>

        {/* Inadimplencia sub-KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div style={{ padding: "0.5rem 0.75rem", borderRadius: "0.5rem", background: "var(--surface)", border: "1px solid var(--border)" }}>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>Total Vencido</p>
            <p className="text-lg font-bold" style={{ color: "#e94560" }}>{formatCompact(inadimplencia.totalVencido)}</p>
          </div>
          <div style={{ padding: "0.5rem 0.75rem", borderRadius: "0.5rem", background: "var(--surface)", border: "1px solid var(--border)" }}>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>Total em Dia</p>
            <p className="text-lg font-bold" style={{ color: "#10b981" }}>{formatCompact(inadimplencia.totalEmDia)}</p>
          </div>
          <div style={{ padding: "0.5rem 0.75rem", borderRadius: "0.5rem", background: "var(--surface)", border: "1px solid var(--border)" }}>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>Parcelas Vencidas</p>
            <p className="text-lg font-bold" style={{ color: "#e94560" }}>{inadimplencia.qtdParcelasVencidas}</p>
          </div>
          <div style={{ padding: "0.5rem 0.75rem", borderRadius: "0.5rem", background: "var(--surface)", border: "1px solid var(--border)" }}>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>
              <Users size={10} className="inline mr-1" />Clientes Inadimplentes
            </p>
            <p className="text-lg font-bold" style={{ color: "#f4a236" }}>{inadimplencia.qtdClientesInadimplentes}</p>
          </div>
        </div>

        {/* Parcelas chart by month */}
        {parcelasChartData.length > 0 && (
          <div className="mb-4">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={parcelasChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="mes" tick={{ fill: "var(--text-dim)", fontSize: 10 }} />
                <YAxis tick={{ fill: "var(--text-dim)", fontSize: 10 }} tickFormatter={(v) => `${v}K`} />
                <Tooltip {...tooltipStyle} formatter={(value, name) => [`R$ ${value}K`, name === "vencidasK" ? "Vencidas" : "Em Dia"]} />
                <Legend wrapperStyle={{ fontSize: "0.7rem" }} />
                <Bar dataKey="vencidasK" stackId="a" fill="#e94560" name="Vencidas (R$ mil)" />
                <Bar dataKey="emDiaK" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} name="Em Dia (R$ mil)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Top inadimplentes table */}
        {topInadimplentes.length > 0 && (
          <div className="overflow-x-auto">
            <p className="text-xs font-bold mb-2" style={{ color: "var(--text-dim)" }}>TOP PARCELAS VENCIDAS</p>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)" }}>
                  <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>Unidade</th>
                  <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>Cliente</th>
                  <th className="text-center py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>Parcela</th>
                  <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>Vencimento</th>
                  <th className="text-right py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>Valor</th>
                  <th className="text-center py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>Dias Atraso</th>
                </tr>
              </thead>
              <tbody>
                {topInadimplentes.map((p, i) => (
                  <tr key={`${p.chaveVenda}-${p.numeroParcela}-${i}`} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="py-1.5 px-2" style={{ color: "var(--text)", fontWeight: 600 }}>{p.identificadorUnidade || p.chaveVenda}</td>
                    <td className="py-1.5 px-2" style={{ color: "var(--text-muted)" }}>{p.clienteNome || "-"}</td>
                    <td className="text-center py-1.5 px-2" style={{ color: "var(--text-muted)" }}>{p.numeroParcela}</td>
                    <td className="py-1.5 px-2" style={{ color: "var(--text-muted)" }}>
                      {p.dataVencimento ? new Date(p.dataVencimento + "T00:00:00").toLocaleDateString("pt-BR") : "-"}
                    </td>
                    <td className="text-right py-1.5 px-2" style={{ color: "#e94560", fontWeight: 600 }}>{formatBRL(p.valor - p.valorPago)}</td>
                    <td className="text-center py-1.5 px-2">
                      <span style={{
                        padding: "0.1rem 0.4rem",
                        borderRadius: "9999px",
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        color: "#fff",
                        background: p.diasAtraso > 90 ? "#e94560" : p.diasAtraso > 30 ? "#f4a236" : "#6b7280",
                      }}>
                        {p.diasAtraso}d
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {topInadimplentes.length === 0 && (
          <div className="text-center py-4">
            <p className="text-xs" style={{ color: "#10b981" }}>Nenhuma parcela vencida encontrada!</p>
          </div>
        )}
      </div>

      {/* Projecao de Inadimplencia */}
      <div className="kpi-card">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={14} style={{ color: "#f4a236" }} />
          <h3 className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>PROJECAO DE INADIMPLENCIA</h3>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {projecoes.map((p) => (
            <div key={`inad-${p.meses}`} style={{
              padding: "0.5rem 0.75rem",
              borderRadius: "0.5rem",
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}>
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>Projecao {p.periodo}</p>
              <p className="text-lg font-bold" style={{
                color: p.inadimplenciaProjetada > 10 ? "#e94560" : p.inadimplenciaProjetada > 5 ? "#f4a236" : "#10b981"
              }}>
                {p.inadimplenciaProjetada.toFixed(1)}%
              </p>
            </div>
          ))}
        </div>
        <p className="text-xs" style={{ color: "var(--text-dim)" }}>
          * Projecao baseada na taxa atual de inadimplencia. Atualizada automaticamente com novos dados do ERP.
        </p>
      </div>
    </div>
  );
}
