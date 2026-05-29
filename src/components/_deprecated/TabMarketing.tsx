"use client";

import { useEffect, useState, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import { Target, DollarSign, TrendingUp, Calendar, Award, AlertCircle, RefreshCw } from "lucide-react";

interface Premissas {
  vgv: number;
  totalLotes: number;
  valorMedioLote: number;
  prazoComercializacaoMeses: number;
  pctMarketing: number;
  budgetMarketing: number;
  velocidadeAlvo: number;
  cacMaximo: number;
}

interface MesPlanoRealizado {
  mes: string;
  mesIdx: number;
  planoEfetivo: number;
  realizado: number;
  saldo: number;
  pctConsumido: number;
}

interface ResumoPorGrupo {
  grupo: string;
  totalGasto: number;
  pctOrcamento: number;
}

interface Evento {
  centroCusto: string;
  tipo: string;
  data: string;
  status: string;
  totalGasto: number;
}

interface NaoEvento {
  centroCusto: string;
  totalGasto: number;
}

interface Gasto {
  data: string;
  mes: string;
  natureza: string;
  centroCusto: string;
  descricao: string;
  valor: number;
  grupoPlano: string;
}

interface MarketingData {
  premissas: Premissas;
  planoMensal: MesPlanoRealizado[];
  resumoPorGrupo: ResumoPorGrupo[];
  eventos: Evento[];
  naoEventos: NaoEvento[];
  gastos: Gasto[];
  totalRealizado: number;
  pctBudgetConsumido: number;
  fetchedAt: string;
  error?: string;
}

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function formatCompact(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}K`;
  return formatBRL(v);
}

const GRUPO_COLORS: Record<string, string> = {
  "1. Mídia Digital Performance": "#4285f4",
  "2. Mídia Offline Local": "#f59e0b",
  "3. Mídia Tradicional": "#ec4899",
  "4. Produção Criativa": "#8b5cf6",
  "5. Eventos e Ações": "#10b981",
  "6. Influência e PR": "#06b6d4",
  "7. Tecnologia e Operação": "#6b7280",
  "8. Reserva / Imprevistos": "#dc2626",
};

const STATUS_COLORS: Record<string, string> = {
  "Realizado": "#10b981",
  "Em Execução": "#f59e0b",
  "Planejado": "#4285f4",
  "Cancelado": "#dc2626",
};

const tooltipStyle = {
  contentStyle: {
    background: "var(--tooltip-bg)",
    border: "1px solid var(--tooltip-border)",
    borderRadius: "0.75rem",
    color: "var(--tooltip-text)",
  },
  labelStyle: { color: "var(--tooltip-label)" },
};

export default function TabMarketing() {
  const [data, setData] = useState<MarketingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Carrega sempre fresco do OneDrive ao montar a aba.
  // POST clear-cache + GET = força reler o Excel.
  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // Limpa cache silenciosamente (não bloqueia se falhar)
      await fetch("/api/marketing-offline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear-cache" }),
      }).catch(() => { /* ignore */ });

      const res = await fetch("/api/marketing-offline");
      const j = await res.json();
      if (j.error) setError(j.error);
      else setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Chart data: Plano vs Realizado
  const planoChartData = useMemo(() => {
    if (!data) return [];
    return data.planoMensal.map((m) => ({
      mes: m.mes,
      Plano: Math.round(m.planoEfetivo),
      Realizado: Math.round(m.realizado),
      acumPlano: 0, // será preenchido
      acumRealizado: 0,
    }));
  }, [data]);

  const planoChartDataAcum = useMemo(() => {
    let accP = 0, accR = 0;
    return planoChartData.map((p) => {
      accP += p.Plano;
      accR += p.Realizado;
      return { ...p, acumPlano: accP, acumRealizado: accR };
    });
  }, [planoChartData]);

  // Mês atual (primeiro mês com realizado=0 dentro da janela ativa, ou último ativo)
  const mesAtualIdx = useMemo(() => {
    if (!data) return 0;
    const idx = data.planoMensal.findIndex((m) => m.realizado === 0);
    return idx > 0 ? idx - 1 : data.planoMensal.length - 1;
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: "20rem" }}>
        <div className="text-center">
          <RefreshCw className="animate-spin mx-auto mb-3" size={32} style={{ color: "var(--text-dim)" }} />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Carregando dados de marketing do OneDrive...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="kpi-card">
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle size={18} style={{ color: "#dc2626" }} />
          <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>Erro ao carregar marketing</h3>
        </div>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>{error || "Sem dados"}</p>
        <button onClick={load} className="mt-3 px-3 py-1.5 text-xs rounded-md" style={{ background: "var(--primary)", color: "white" }}>
          Tentar novamente
        </button>
      </div>
    );
  }

  const { premissas, totalRealizado, pctBudgetConsumido } = data;
  const saldo = premissas.budgetMarketing - totalRealizado;
  const pctConsumido = pctBudgetConsumido * 100;
  const consumoStatus: "good" | "neutral" | "bad" =
    pctConsumido < 30 ? "good" : pctConsumido < 80 ? "neutral" : "bad";
  const consumoColor = consumoStatus === "bad" ? "#dc2626" : consumoStatus === "neutral" ? "#f59e0b" : "#10b981";

  const totalEventos = data.eventos.reduce((s, e) => s + e.totalGasto, 0);
  const totalNaoEventos = data.naoEventos.reduce((s, e) => s + e.totalGasto, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Target size={18} style={{ color: "#10b981" }} />
        <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>Painel de Marketing</h3>
        <span className="text-xs flex items-center gap-1" style={{ color: "var(--text-dim)", marginLeft: "auto" }}>
          <RefreshCw size={11} style={{ color: "#10b981" }} />
          sync automático · atualizado às {new Date(data.fetchedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      {/* Premissas */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="kpi-card" style={{ padding: "0.875rem" }}>
          <p className="text-xs mb-1" style={{ color: "var(--text-dim)" }}>VGV INICIAL</p>
          <p className="text-lg font-bold" style={{ color: "#10b981" }}>{formatCompact(premissas.vgv)}</p>
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>{premissas.totalLotes} lotes × {formatCompact(premissas.valorMedioLote)}</p>
        </div>
        <div className="kpi-card" style={{ padding: "0.875rem" }}>
          <p className="text-xs mb-1" style={{ color: "var(--text-dim)" }}>BUDGET MKT</p>
          <p className="text-lg font-bold" style={{ color: "#4285f4" }}>{formatCompact(premissas.budgetMarketing)}</p>
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>{(premissas.pctMarketing * 100).toFixed(1)}% do VGV</p>
        </div>
        <div className="kpi-card" style={{ padding: "0.875rem" }}>
          <p className="text-xs mb-1" style={{ color: "var(--text-dim)" }}>CAC ALVO</p>
          <p className="text-lg font-bold" style={{ color: "#f59e0b" }}>{formatBRL(premissas.cacMaximo)}</p>
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>máx por lote</p>
        </div>
        <div className="kpi-card" style={{ padding: "0.875rem" }}>
          <p className="text-xs mb-1" style={{ color: "var(--text-dim)" }}>VELOCIDADE ALVO</p>
          <p className="text-lg font-bold" style={{ color: "#8b5cf6" }}>{premissas.velocidadeAlvo.toFixed(1)}</p>
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>lotes/mês</p>
        </div>
        <div className="kpi-card" style={{ padding: "0.875rem" }}>
          <p className="text-xs mb-1" style={{ color: "var(--text-dim)" }}>PRAZO</p>
          <p className="text-lg font-bold" style={{ color: "var(--text)" }}>{premissas.prazoComercializacaoMeses}</p>
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>meses</p>
        </div>
      </div>

      {/* Budget vs Realizado */}
      <div className="kpi-card">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign size={14} style={{ color: consumoColor }} />
          <h3 className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>ORÇAMENTO vs REALIZADO</h3>
          <span style={{ fontSize: "0.7rem", color: consumoColor, marginLeft: "auto", fontWeight: 700 }}>
            {pctConsumido.toFixed(1)}% consumido
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div style={{ padding: "0.875rem", borderRadius: "0.625rem", background: "var(--surface)", border: "1px solid var(--border)" }}>
            <p className="text-xs mb-1" style={{ color: "var(--text-dim)" }}>BUDGET TOTAL</p>
            <p className="text-xl font-bold" style={{ color: "#4285f4" }}>{formatCompact(premissas.budgetMarketing)}</p>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>18 meses</p>
          </div>
          <div style={{ padding: "0.875rem", borderRadius: "0.625rem", background: "var(--surface)", border: "1px solid var(--border)" }}>
            <p className="text-xs mb-1" style={{ color: "var(--text-dim)" }}>REALIZADO</p>
            <p className="text-xl font-bold" style={{ color: consumoColor }}>{formatCompact(totalRealizado)}</p>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>{data.gastos.length} lançamentos</p>
          </div>
          <div style={{ padding: "0.875rem", borderRadius: "0.625rem", background: "var(--surface)", border: "1px solid var(--border)" }}>
            <p className="text-xs mb-1" style={{ color: "var(--text-dim)" }}>SALDO</p>
            <p className="text-xl font-bold" style={{ color: saldo > 0 ? "#10b981" : "#dc2626" }}>{formatCompact(saldo)}</p>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>{saldo > 0 ? "disponível" : "estourado"}</p>
          </div>
          <div style={{ padding: "0.875rem", borderRadius: "0.625rem", background: "#10b98115", border: "1px solid #10b98140" }}>
            <p className="text-xs mb-1" style={{ color: "#10b981", fontWeight: 700 }}>EVENTOS</p>
            <p className="text-base font-bold" style={{ color: "#10b981" }}>{formatCompact(totalEventos)}</p>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>{data.eventos.length} eventos</p>
          </div>
        </div>

        {/* Barra de progresso */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.375rem", fontSize: "0.7rem", color: "var(--text-dim)" }}>
            <span>Consumo do budget</span>
            <span style={{ fontWeight: 700, color: consumoColor }}>{formatBRL(totalRealizado)} / {formatBRL(premissas.budgetMarketing)}</span>
          </div>
          <div style={{ height: "10px", background: "var(--surface)", borderRadius: "5px", overflow: "hidden", border: "1px solid var(--border)" }}>
            <div style={{
              height: "100%",
              background: consumoColor,
              width: `${Math.min(pctConsumido, 100)}%`,
              transition: "width 0.5s",
            }} />
          </div>
        </div>
      </div>

      {/* Plano vs Realizado Mensal */}
      <div className="kpi-card">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={14} style={{ color: "#4285f4" }} />
          <h3 className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>PLANO vs REALIZADO MENSAL</h3>
          <span style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginLeft: "auto" }}>
            18 meses · Abr/26 → Set/27
          </span>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={planoChartDataAcum}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="mes" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
            <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickFormatter={(v) => formatCompact(v)} />
            <Tooltip {...tooltipStyle} formatter={(v) => formatBRL(Number(v))} />
            <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
            <Bar dataKey="Plano" fill="#4285f4" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Realizado" fill="#10b981" radius={[4, 4, 0, 0]} />
            <ReferenceLine x={planoChartDataAcum[mesAtualIdx]?.mes} stroke="#dc2626" strokeDasharray="3 3" label={{ value: "hoje", position: "top", fill: "#dc2626", fontSize: 10 }} />
          </BarChart>
        </ResponsiveContainer>

        <h4 className="text-xs font-bold mt-6 mb-2" style={{ color: "var(--text-muted)" }}>ACUMULADO</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={planoChartDataAcum}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="mes" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
            <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickFormatter={(v) => formatCompact(v)} />
            <Tooltip {...tooltipStyle} formatter={(v) => formatBRL(Number(v))} />
            <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
            <Line type="monotone" dataKey="acumPlano" name="Plano Acumulado" stroke="#4285f4" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="acumRealizado" name="Realizado Acumulado" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Por Grupo */}
      <div className="kpi-card">
        <div className="flex items-center gap-2 mb-4">
          <Award size={14} style={{ color: "#8b5cf6" }} />
          <h3 className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>GASTOS POR GRUPO DO PLANO MKT</h3>
        </div>
        <div className="space-y-2">
          {data.resumoPorGrupo.map((g) => {
            const color = GRUPO_COLORS[g.grupo] || "#6b7280";
            const pct = g.pctOrcamento * 100;
            return (
              <div key={g.grupo}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem", fontSize: "0.75rem" }}>
                  <span style={{ color: "var(--text)", fontWeight: 500 }}>{g.grupo}</span>
                  <span style={{ color: "var(--text-muted)" }}>
                    {formatBRL(g.totalGasto)} <span style={{ color: color, fontWeight: 700, marginLeft: "0.5rem" }}>{pct.toFixed(1)}%</span>
                  </span>
                </div>
                <div style={{ height: "6px", background: "var(--surface)", borderRadius: "3px", overflow: "hidden", border: "1px solid var(--border)" }}>
                  <div style={{ height: "100%", background: color, width: `${Math.min(pct * 5, 100)}%`, transition: "width 0.5s" }} />
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs mt-3" style={{ color: "var(--text-dim)" }}>
          Barra mostra % consumido do budget total (R$ {(premissas.budgetMarketing / 1000).toFixed(0)}k) — escala ×5 para visibilidade
        </p>
      </div>

      {/* Eventos */}
      <div className="kpi-card">
        <div className="flex items-center gap-2 mb-4">
          <Calendar size={14} style={{ color: "#10b981" }} />
          <h3 className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>EVENTOS</h3>
          <span style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginLeft: "auto" }}>
            Total: {formatBRL(totalEventos)} · {data.eventos.length} eventos
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-dim)" }}>
                <th className="text-left py-2 px-2 font-medium">Centro de Custo</th>
                <th className="text-left py-2 px-2 font-medium">Tipo</th>
                <th className="text-left py-2 px-2 font-medium">Data</th>
                <th className="text-left py-2 px-2 font-medium">Status</th>
                <th className="text-right py-2 px-2 font-medium">Valor</th>
                <th className="text-right py-2 px-2 font-medium">% Budget</th>
              </tr>
            </thead>
            <tbody>
              {data.eventos
                .slice()
                .sort((a, b) => b.totalGasto - a.totalGasto)
                .map((e) => {
                  const statusColor = STATUS_COLORS[e.status] || "#6b7280";
                  const pct = premissas.budgetMarketing > 0 ? (e.totalGasto / premissas.budgetMarketing) * 100 : 0;
                  return (
                    <tr key={e.centroCusto} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="py-2 px-2" style={{ color: "var(--text)", fontWeight: 500 }}>{e.centroCusto}</td>
                      <td className="py-2 px-2" style={{ color: "var(--text-muted)" }}>{e.tipo}</td>
                      <td className="py-2 px-2" style={{ color: "var(--text-dim)" }}>{e.data ? new Date(e.data).toLocaleDateString("pt-BR") : "—"}</td>
                      <td className="py-2 px-2">
                        <span style={{
                          background: statusColor + "20",
                          color: statusColor,
                          padding: "0.125rem 0.5rem",
                          borderRadius: "0.375rem",
                          fontSize: "0.7rem",
                          fontWeight: 600,
                        }}>{e.status}</span>
                      </td>
                      <td className="py-2 px-2 text-right" style={{ color: "var(--text)", fontWeight: 600 }}>{formatBRL(e.totalGasto)}</td>
                      <td className="py-2 px-2 text-right" style={{ color: "var(--text-dim)" }}>{pct.toFixed(2)}%</td>
                    </tr>
                  );
                })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--border)", color: "var(--text)", fontWeight: 700 }}>
                <td className="py-2 px-2" colSpan={4}>TOTAL EVENTOS</td>
                <td className="py-2 px-2 text-right">{formatBRL(totalEventos)}</td>
                <td className="py-2 px-2 text-right">{(totalEventos / premissas.budgetMarketing * 100).toFixed(2)}%</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {data.naoEventos.length > 0 && (
          <>
            <h4 className="text-xs font-bold mt-6 mb-2" style={{ color: "var(--text-muted)" }}>NÃO-EVENTOS (mídia/operacional)</h4>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              {data.naoEventos.map((ne) => (
                <div key={ne.centroCusto} style={{ padding: "0.625rem 0.875rem", borderRadius: "0.5rem", background: "var(--surface)", border: "1px solid var(--border)", minWidth: "10rem" }}>
                  <p className="text-xs" style={{ color: "var(--text-dim)" }}>{ne.centroCusto}</p>
                  <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{formatBRL(ne.totalGasto)}</p>
                </div>
              ))}
              <div style={{ padding: "0.625rem 0.875rem", borderRadius: "0.5rem", background: "var(--surface)", border: "1px solid var(--border)", minWidth: "10rem" }}>
                <p className="text-xs" style={{ color: "var(--text-dim)" }}>TOTAL NÃO-EVENTOS</p>
                <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{formatBRL(totalNaoEventos)}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
