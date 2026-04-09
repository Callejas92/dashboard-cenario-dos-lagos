"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Phone, MessageCircle, CheckCheck, DollarSign, FileText, TrendingUp, ChevronDown, ChevronUp, X, Table, BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { formatNumber } from "@/lib/types";

interface WppData {
  configured: boolean;
  message?: string;
  error?: string;
  numero: {
    telefone: string;
    nome: string;
    qualidade: string;
    plataforma: string;
  };
  mensagens: { sent: number; delivered: number; read: number; received: number };
  conversas: {
    total: number;
    custoUSD?: number;
    custoBRL?: number;
    custo?: number;
    porTipo?: { tipo: string; qtd: number }[];
    porCategoria?: { categoria: string; label: string; qtd: number; custoUSD?: number; custoBRL?: number; custo?: number }[];
    fonte?: "api" | "estimado" | "manual";
    cambio?: number;
  };
  templates: {
    total: number;
    aprovados: number;
    pendentes: number;
    rejeitados: number;
    lista: { nome: string; status: string; categoria: string }[];
  };
  dailyChart?: { data: string; sent: number; delivered: number; read: number; received: number }[];
  webhookAtivo?: boolean;
  webhookUpdatedAt?: string;
  qualityHistory?: { timestamp: string; phone: string; de: string; para: string }[];
  periodo: { dias: number; inicio: string; fim: string };
}

const COLORS = ["#25d366", "#128c7e", "#075e54", "#34b7f1", "#f59e0b"];

const TIPO_LABEL: Record<string, string> = {
  BUSINESS_INITIATED: "Iniciada pela empresa",
  USER_INITIATED: "Iniciada pelo cliente",
  REFERRAL_CONVERSION: "Conversão de anúncio",
  UNKNOWN: "Outros",
};

const QUALIDADE_COLOR: Record<string, string> = {
  GREEN: "#10b981",
  YELLOW: "#f59e0b",
  RED: "#e94560",
};

type WppMetricKey = "sent" | "delivered" | "read" | "received";

const DAYS_SINCE_LAUNCH = Math.max(Math.ceil((Date.now() - new Date("2026-04-14").getTime()) / (24 * 60 * 60 * 1000)), 1);
const PERIODS = [
  { label: "Lançamento", days: DAYS_SINCE_LAUNCH },
  { label: "7 dias", days: 7 },
  { label: "30 dias", days: 30 },
  { label: "60 dias", days: 60 },
  { label: "90 dias", days: 90 },
];

export default function TabWhatsApp() {
  const [data, setData] = useState<WppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Default: days since launch (14/04/2026)
  const [days, setDays] = useState(() => {
    const launch = new Date("2026-04-14");
    const diff = Math.ceil((Date.now() - launch.getTime()) / (24 * 60 * 60 * 1000));
    return Math.max(diff, 1);
  });
  const [expandedKPI, setExpandedKPI] = useState<WppMetricKey | null>(null);
  const [detailView, setDetailView] = useState<"tabela" | "grafico">("tabela");

  const tooltipStyle = {
    contentStyle: { background: "var(--tooltip-bg)", border: "1px solid var(--border)", borderRadius: "0.75rem", color: "var(--text)" },
    labelStyle: { color: "var(--text-muted)" },
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/whatsapp?days=${days}`);
      const json = await res.json();
      if (!json.configured) setError(json.message || "WhatsApp não configurado");
      else if (json.error) setError(json.error);
      else setData(json);
    } catch (err) {
      setError(String(err));
    }
    setLoading(false);
  }, [days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="text-center py-12">
        <RefreshCw size={24} className="animate-spin mx-auto mb-3" style={{ color: "#25d366" }} />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Carregando dados do WhatsApp...</p>
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

  const deliveryRate = data.mensagens.sent > 0 ? (data.mensagens.delivered / data.mensagens.sent) * 100 : 0;
  const readRate = data.mensagens.delivered > 0 ? (data.mensagens.read / data.mensagens.delivered) * 100 : 0;

  const dailyChart = data.dailyChart || [];

  const wppMetricConfig: Record<WppMetricKey, { label: string; color: string }> = {
    sent:      { label: "Enviadas",  color: "#25d366" },
    delivered: { label: "Entregues", color: "#128c7e" },
    read:      { label: "Lidas",     color: "#075e54" },
    received:  { label: "Recebidas", color: "#34b7f1" },
  };

  function toggleWppKPI(key: WppMetricKey) {
    setExpandedKPI((prev) => (prev === key ? null : key));
    setDetailView("tabela");
  }

  function renderWppDailyPanel(key: WppMetricKey) {
    if (expandedKPI !== key) return null;
    const cfg = wppMetricConfig[key];
    const dailyValues = dailyChart.filter((d) => d[key] > 0).map((d) => ({
      date: d.data,
      dateLabel: new Date(d.data + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      value: d[key],
    }));
    const total = dailyValues.reduce((s, d) => s + d.value, 0);

    return (
      <div
        className="col-span-2 sm:col-span-4"
        style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: "1rem", padding: "1.25rem", animation: "fadeIn 0.2s ease" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>
            {cfg.label.toUpperCase()} — POR DIA
          </h4>
          <div className="flex items-center gap-2">
            {(["tabela", "grafico"] as const).map((v) => (
              <button key={v} onClick={() => setDetailView(v)} style={{ padding: "0.25rem 0.75rem", fontSize: "0.7rem", fontWeight: 600, borderRadius: "0.375rem", background: detailView === v ? cfg.color : "var(--surface)", color: detailView === v ? "#fff" : "var(--text-muted)", border: "1px solid var(--border)", cursor: "pointer" }}>
                <span className="flex items-center gap-1">
                  {v === "tabela" ? <Table size={12} /> : <BarChart3 size={12} />}
                  {v === "tabela" ? "Tabela" : "Gráfico"}
                </span>
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
                      <td style={{ padding: "0.5rem 0.75rem", color: "var(--text)", fontWeight: 500 }}>
                        {new Date(d.date + "T00:00:00").toLocaleDateString("pt-BR")}
                      </td>
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
              <BarChart data={dailyValues}>
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
  }

  return (
    <div className="space-y-6">
      {/* Número info */}
      <div className="kpi-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "#25d36620" }}>
              <Phone size={24} style={{ color: "#25d366" }} />
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ color: "var(--text)" }}>{data.numero.nome}</h2>
              <p className="text-sm" style={{ color: "var(--text-dim)" }}>{data.numero.telefone}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${QUALIDADE_COLOR[data.numero.qualidade] || "#6b7280"}20`, color: QUALIDADE_COLOR[data.numero.qualidade] || "#6b7280" }}>
                  Qualidade: {data.numero.qualidade === "GREEN" ? "Alta 🟢" : data.numero.qualidade === "YELLOW" ? "Média 🟡" : "Baixa 🔴"}
                </span>
                <span className="text-xs" style={{ color: "var(--text-dim)" }}>{data.numero.plataforma}</span>
              </div>
            </div>
          </div>
          <button onClick={fetchData} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
            <RefreshCw size={14} style={{ color: "var(--text-dim)" }} />
          </button>
        </div>
      </div>

      {/* Period filter */}
      <div className="flex gap-2 flex-wrap">
        {PERIODS.map((p) => (
          <button
            key={p.days}
            onClick={() => setDays(p.days)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: days === p.days ? "#25d366" : "var(--surface)",
              color: days === p.days ? "#fff" : "var(--text-dim)",
              border: `1px solid ${days === p.days ? "#25d366" : "var(--border)"}`,
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* KPIs - Expandable */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {([
          { key: "sent" as WppMetricKey, label: "Mensagens Enviadas", value: formatNumber(data.mensagens.sent), sub: undefined as string | undefined, icon: MessageCircle, color: "#25d366" },
          { key: "delivered" as WppMetricKey, label: "Entregues", value: formatNumber(data.mensagens.delivered), sub: `${deliveryRate.toFixed(1)}% de entrega` as string | undefined, icon: CheckCheck, color: "#128c7e" },
          { key: "read" as WppMetricKey, label: "Lidas", value: formatNumber(data.mensagens.read), sub: `${readRate.toFixed(1)}% de leitura` as string | undefined, icon: TrendingUp, color: "#075e54" },
          { key: "received" as WppMetricKey, label: "Recebidas", value: formatNumber(data.mensagens.received), sub: undefined as string | undefined, icon: MessageCircle, color: "#34b7f1" },
        ]).map(({ key, label, value, sub, icon: Icon, color }) => (
          <div key={key} onClick={() => toggleWppKPI(key)} style={{ cursor: "pointer" }}>
            <div className="kpi-card">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
                  <Icon size={16} style={{ color }} />
                </div>
                <p className="text-xs font-medium" style={{ color: "var(--text-dim)" }}>{label}</p>
                {expandedKPI === key ? <ChevronUp size={12} style={{ color: "var(--text-dim)", marginLeft: "auto" }} /> : <ChevronDown size={12} style={{ color: "var(--text-dim)", marginLeft: "auto" }} />}
              </div>
              <p className="text-2xl font-bold" style={{ color: "var(--text)" }}>{value}</p>
              {sub && <p className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>{sub}</p>}
            </div>
          </div>
        ))}

        {expandedKPI && renderWppDailyPanel(expandedKPI)}
      </div>

      {/* Conversas & Custo */}
      <div className="kpi-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#f59e0b20" }}>
              <DollarSign size={16} style={{ color: "#f59e0b" }} />
            </div>
            <div>
              <p className="text-xs font-medium" style={{ color: "var(--text-dim)" }}>CONVERSAS & CUSTO</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>últimos {days} dias</p>
            </div>
          </div>
          {data.conversas.fonte && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{
              background: data.conversas.fonte === "api" ? "#10b98120" : "#f59e0b20",
              color: data.conversas.fonte === "api" ? "#10b981" : "#f59e0b",
            }}>
              {data.conversas.fonte === "api" ? "Dados reais" : "Custo estimado"}
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <p className="text-2xl font-bold" style={{ color: "var(--text)" }}>{formatNumber(data.conversas.total)}</p>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>conversas</p>
          </div>
          <div>
            <p className="text-2xl font-bold" style={{ color: "#10b981" }}>
              {(data.conversas.custoBRL ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>custo em R$</p>
          </div>
          <div>
            <p className="text-2xl font-bold" style={{ color: "var(--text-muted)" }}>
              ${(data.conversas.custoUSD ?? data.conversas.custo ?? 0).toFixed(2)}
            </p>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>custo em USD</p>
          </div>
        </div>

        {data.conversas.porCategoria && data.conversas.porCategoria.length > 0 && (
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-dim)" }}>POR CATEGORIA</p>
            <div className="space-y-1">
              {data.conversas.porCategoria.map((c, i) => (
                <div key={i} className="flex items-center justify-between text-xs" style={{ padding: "0.375rem 0.5rem", borderRadius: "0.375rem", background: "var(--surface)" }}>
                  <span style={{ color: "var(--text)", fontWeight: 600 }}>{c.label}</span>
                  <div className="flex gap-4">
                    <span style={{ color: "var(--text-dim)" }}>{formatNumber(c.qtd)} conv.</span>
                    <span style={{ color: "#10b981", fontWeight: 600 }}>
                      {(c.custoBRL ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </span>
                    <span style={{ color: "var(--text-muted)" }}>${(c.custoUSD ?? c.custo ?? 0).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.conversas.cambio && (
          <p className="text-xs mt-3" style={{ color: "var(--text-dim)" }}>
            Câmbio: 1 USD = R$ {data.conversas.cambio.toFixed(2)}
            {data.conversas.fonte === "estimado" && " · Preço base: $0,0625/conversa marketing (Meta Brasil)"}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Por tipo de conversa */}
        {(data.conversas.porTipo?.length ?? 0) > 0 && (
          <div className="kpi-card">
            <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>POR TIPO DE CONVERSA</h3>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={(data.conversas.porTipo ?? []).map(t => ({ name: TIPO_LABEL[t.tipo] || t.tipo, value: t.qtd }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} label={({ value }) => `${value}`}>
                  {(data.conversas.porTipo ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Templates */}
      <div className="kpi-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#6366f120" }}>
            <FileText size={16} style={{ color: "#6366f1" }} />
          </div>
          <h3 className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>TEMPLATES DE MENSAGEM</h3>
        </div>

        {/* Resumo templates */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <p className="text-2xl font-bold" style={{ color: "#10b981" }}>{data.templates.aprovados}</p>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>Aprovados</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold" style={{ color: "#f59e0b" }}>{data.templates.pendentes}</p>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>Pendentes</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold" style={{ color: "#e94560" }}>{data.templates.rejeitados}</p>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>Rejeitados</p>
          </div>
        </div>

        {/* Lista templates */}
        {data.templates.lista.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="text-left py-2 px-2 font-medium" style={{ color: "var(--text-dim)" }}>Template</th>
                  <th className="text-left py-2 px-2 font-medium" style={{ color: "var(--text-dim)" }}>Categoria</th>
                  <th className="text-left py-2 px-2 font-medium" style={{ color: "var(--text-dim)" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.templates.lista.map((t, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }} className="hover:bg-white/5">
                    <td className="py-2 px-2 font-medium" style={{ color: "var(--text)" }}>{t.nome}</td>
                    <td className="py-2 px-2" style={{ color: "var(--text-muted)" }}>{t.categoria}</td>
                    <td className="py-2 px-2">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{
                        background: t.status === "APPROVED" ? "#10b98120" : t.status === "PENDING" ? "#f59e0b20" : "#e9456020",
                        color: t.status === "APPROVED" ? "#10b981" : t.status === "PENDING" ? "#f59e0b" : "#e94560",
                      }}>
                        {t.status === "APPROVED" ? "Aprovado" : t.status === "PENDING" ? "Pendente" : "Rejeitado"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quality history */}
      {data.qualityHistory && data.qualityHistory.length > 0 && (
        <div className="kpi-card" style={{ border: "1px solid #f59e0b40" }}>
          <h3 className="text-sm font-bold mb-3" style={{ color: "var(--text-muted)" }}>HISTÓRICO DE QUALIDADE DO NÚMERO</h3>
          <div className="space-y-2">
            {[...data.qualityHistory].reverse().map((ev, i) => {
              const corDe   = QUALIDADE_COLOR[ev.de]   ?? "#6b7280";
              const corPara = QUALIDADE_COLOR[ev.para]  ?? "#6b7280";
              return (
                <div key={i} className="flex items-center gap-3 text-xs" style={{ padding: "0.5rem", borderRadius: "0.5rem", background: "var(--surface)" }}>
                  <span style={{ color: "var(--text-dim)" }}>
                    {new Date(ev.timestamp).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span style={{ color: corDe, fontWeight: 700 }}>{ev.de}</span>
                  <span style={{ color: "var(--text-dim)" }}>→</span>
                  <span style={{ color: corPara, fontWeight: 700 }}>{ev.para}</span>
                  {ev.para === "RED" && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: "#e9456020", color: "#e94560" }}>⚠️ Atenção</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Webhook status banner */}
      {!data.webhookAtivo && (
        <div className="kpi-card" style={{ border: "1px solid #f59e0b40", background: "#f59e0b08" }}>
          <div className="flex items-start gap-3">
            <span style={{ fontSize: "1.25rem" }}>⚠️</span>
            <div>
              <p className="text-sm font-semibold" style={{ color: "#f59e0b" }}>Webhook não recebeu dados ainda</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>
                Após configurar o webhook na Meta, as mensagens enviadas/recebidas serão contabilizadas automaticamente aqui.
                Os dados acumulam a partir da ativação.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Daily chart */}
      {data.dailyChart && data.dailyChart.some(d => d.sent > 0 || d.received > 0) && (
        <div className="kpi-card">
          <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>
            MENSAGENS POR DIA — últimos {days} dias
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.dailyChart.map(d => ({
              ...d,
              data: new Date(d.data + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
            }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="data" tick={{ fill: "var(--text-dim)", fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: "var(--text-dim)", fontSize: 11 }} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="sent" name="Enviadas" stackId="a" fill="#25d366" />
              <Bar dataKey="delivered" name="Entregues" stackId="b" fill="#128c7e" />
              <Bar dataKey="received" name="Recebidas" stackId="c" fill="#34b7f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Summary bar chart (when webhook has data) */}
      {data.webhookAtivo && (data.mensagens.sent > 0 || data.mensagens.received > 0) && (
        <div className="kpi-card">
          <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>RESUMO DO PERÍODO</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={[
              { nome: "Enviadas",  valor: data.mensagens.sent,       fill: "#25d366" },
              { nome: "Entregues", valor: data.mensagens.delivered,  fill: "#128c7e" },
              { nome: "Lidas",     valor: data.mensagens.read,       fill: "#075e54" },
              { nome: "Recebidas", valor: data.mensagens.received,   fill: "#34b7f1" },
            ]}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="nome" tick={{ fill: "var(--text-dim)", fontSize: 12 }} />
              <YAxis tick={{ fill: "var(--text-dim)", fontSize: 11 }} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="valor" name="Quantidade" radius={[4, 4, 0, 0]}>
                {[{ fill: "#25d366" }, { fill: "#128c7e" }, { fill: "#075e54" }, { fill: "#34b7f1" }].map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
