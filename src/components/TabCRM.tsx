"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Users, UserCheck, UserPlus, TrendingUp, Phone, Mail, Globe } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";
import { formatNumber } from "@/lib/types";
import DateRangeFilter from "@/components/DateRangeFilter";

interface Lead {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  corretor: string;
  fonte: string;
  canal: string;
  status: string;
  statusAlias: string;
  funnelStatus: string;
  convertido: boolean;
  url: string;
  criadoEm: string;
  atualizadoEm: string;
}

interface CRMData {
  configured: boolean;
  message?: string;
  error?: string;
  totalLeads: number;
  novos: number;
  emAtendimento: number;
  convertidos: number;
  taxaConversao: number;
  porFonte: { fonte: string; qtd: number }[];
  porCorretor: { corretor: string; qtd: number }[];
  porStatus: { status: string; qtd: number }[];
  porDia: { data: string; qtd: number }[];
  leads: Lead[];
  fetchedAt: string;
}

const COLORS = ["#1a5c3a", "#10b981", "#f59e0b", "#e94560", "#6366f1", "#8b5cf6", "#06b6d4", "#ec4899"];

function KPICard({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub?: string; icon: typeof Users; color: string }) {
  return (
    <div className="kpi-card">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
          <Icon size={16} style={{ color }} />
        </div>
        <p className="text-xs font-medium" style={{ color: "var(--text-dim)" }}>{label}</p>
      </div>
      <p className="text-2xl font-bold" style={{ color: "var(--text)" }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>{sub}</p>}
    </div>
  );
}

export default function TabCRM() {
  const [data, setData] = useState<CRMData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [activeQuick, setActiveQuick] = useState<number | "total" | null>("total");

  const tooltipStyle = {
    contentStyle: { background: "var(--tooltip-bg)", border: "1px solid var(--border)", borderRadius: "0.75rem", color: "var(--text)" },
    labelStyle: { color: "var(--text-muted)" },
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/crm");
      const json = await res.json();
      if (!json.configured) {
        setError(json.message || "CRM não configurado");
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
        <RefreshCw size={24} className="animate-spin mx-auto mb-3" style={{ color: "#1a5c3a" }} />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Carregando leads do CRM...</p>
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

  // Filter leads by date range
  const filteredLeads = data.leads.filter((l) => {
    if (!l.criadoEm) return true;
    const d = l.criadoEm.split("T")[0];
    if (startDate && d < startDate) return false;
    if (endDate && d > endDate) return false;
    return true;
  });

  const filteredTotal = filteredLeads.length;
  const filteredNovos = filteredLeads.filter((l) => l.statusAlias === "new").length;
  const filteredConvertidos = filteredLeads.filter((l) => l.convertido).length;
  const filteredTaxaConversao = filteredTotal > 0 ? (filteredConvertidos / filteredTotal) * 100 : 0;

  // Recalculate porFonte/porCorretor/porDia for filtered data
  const fonteMap = new Map<string, number>();
  const corretorMap = new Map<string, number>();
  const diaMap = new Map<string, number>();
  const statusMap = new Map<string, number>();

  for (const l of filteredLeads) {
    fonteMap.set(l.fonte || "Não identificado", (fonteMap.get(l.fonte || "Não identificado") || 0) + 1);
    corretorMap.set(l.corretor || "Não atribuído", (corretorMap.get(l.corretor || "Não atribuído") || 0) + 1);
    statusMap.set(l.status || "Desconhecido", (statusMap.get(l.status || "Desconhecido") || 0) + 1);
    if (l.criadoEm) {
      const dia = l.criadoEm.split("T")[0];
      diaMap.set(dia, (diaMap.get(dia) || 0) + 1);
    }
  }

  const porFonte = Array.from(fonteMap.entries()).map(([fonte, qtd]) => ({ fonte, qtd })).sort((a, b) => b.qtd - a.qtd);
  const porCorretor = Array.from(corretorMap.entries()).map(([corretor, qtd]) => ({ corretor, qtd })).sort((a, b) => b.qtd - a.qtd);
  const porStatus = Array.from(statusMap.entries()).map(([status, qtd]) => ({ status, qtd })).sort((a, b) => b.qtd - a.qtd);
  const porDia = Array.from(diaMap.entries()).map(([d, qtd]) => ({ data: d, qtd })).sort((a, b) => a.data.localeCompare(b.data));

  return (
    <div className="space-y-6">
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

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KPICard label="Total Leads" value={formatNumber(filteredTotal)} icon={Users} color="#1a5c3a" />
        <KPICard label="Novos" value={formatNumber(filteredNovos)} icon={UserPlus} color="#10b981" />
        <KPICard label="Convertidos" value={formatNumber(filteredConvertidos)} icon={UserCheck} color="#f59e0b" />
        <KPICard label="Taxa Conversão" value={`${filteredTaxaConversao.toFixed(1)}%`} icon={TrendingUp} color="#6366f1" />
      </div>

      {/* Leads por dia */}
      {porDia.length > 0 && (
        <div className="kpi-card">
          <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>LEADS POR DIA</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={porDia}>
              <defs>
                <linearGradient id="gradLeads" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1a5c3a" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#1a5c3a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="data" tick={{ fill: "var(--text-dim)", fontSize: 11 }} tickFormatter={(v) => { const p = v.split("-"); return `${p[2]}/${p[1]}`; }} />
              <YAxis tick={{ fill: "var(--text-dim)", fontSize: 11 }} allowDecimals={false} />
              <Tooltip {...tooltipStyle} labelFormatter={(v) => { const p = String(v).split("-"); return `${p[2]}/${p[1]}/${p[0]}`; }} />
              <Area type="monotone" dataKey="qtd" name="Leads" stroke="#1a5c3a" fill="url(#gradLeads)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Por Fonte */}
        <div className="kpi-card">
          <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>POR FONTE</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={porFonte} dataKey="qtd" nameKey="fonte" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                {porFonte.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip {...tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Por Status */}
        <div className="kpi-card">
          <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>POR STATUS</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={porStatus}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="status" tick={{ fill: "var(--text-dim)", fontSize: 11 }} />
              <YAxis tick={{ fill: "var(--text-dim)", fontSize: 11 }} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="qtd" name="Leads" fill="#1a5c3a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Por Corretor */}
      {porCorretor.length > 0 && (
        <div className="kpi-card">
          <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-muted)" }}>POR CORRETOR</h3>
          <ResponsiveContainer width="100%" height={Math.max(150, porCorretor.length * 40)}>
            <BarChart data={porCorretor} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" tick={{ fill: "var(--text-dim)", fontSize: 11 }} allowDecimals={false} />
              <YAxis dataKey="corretor" type="category" tick={{ fill: "var(--text-muted)", fontSize: 11 }} width={160} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="qtd" name="Leads" fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Leads Table */}
      <div className="kpi-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>LEADS RECENTES</h3>
          <button onClick={fetchData} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
            <RefreshCw size={14} style={{ color: "var(--text-dim)" }} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th className="text-left py-2 px-2 font-medium" style={{ color: "var(--text-dim)" }}>Data</th>
                <th className="text-left py-2 px-2 font-medium" style={{ color: "var(--text-dim)" }}>Nome</th>
                <th className="text-left py-2 px-2 font-medium" style={{ color: "var(--text-dim)" }}>Contato</th>
                <th className="text-left py-2 px-2 font-medium" style={{ color: "var(--text-dim)" }}>Fonte</th>
                <th className="text-left py-2 px-2 font-medium" style={{ color: "var(--text-dim)" }}>Corretor</th>
                <th className="text-left py-2 px-2 font-medium" style={{ color: "var(--text-dim)" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.slice(0, 30).map((l) => (
                <tr key={l.id} style={{ borderBottom: "1px solid var(--border)" }} className="hover:bg-white/5">
                  <td className="py-2 px-2" style={{ color: "var(--text-muted)" }}>
                    {l.criadoEm ? new Date(l.criadoEm).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="py-2 px-2 font-medium" style={{ color: "var(--text)" }}>{l.nome || "—"}</td>
                  <td className="py-2 px-2" style={{ color: "var(--text-muted)" }}>
                    <div className="flex items-center gap-2">
                      {l.telefone && (
                        <span className="flex items-center gap-1" title={l.telefone}>
                          <Phone size={10} /> {l.telefone}
                        </span>
                      )}
                      {l.email && !l.telefone && (
                        <span className="flex items-center gap-1" title={l.email}>
                          <Mail size={10} /> {l.email}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-2" style={{ color: "var(--text-muted)" }}>
                    <span className="flex items-center gap-1">
                      <Globe size={10} /> {l.fonte || "—"}
                    </span>
                  </td>
                  <td className="py-2 px-2" style={{ color: "var(--text-muted)" }}>{l.corretor || "—"}</td>
                  <td className="py-2 px-2">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: l.statusAlias === "new" ? "rgba(16,185,129,0.15)" :
                          l.convertido ? "rgba(245,158,11,0.15)" : "rgba(100,116,139,0.15)",
                        color: l.statusAlias === "new" ? "#10b981" :
                          l.convertido ? "#f59e0b" : "var(--text-dim)",
                      }}
                    >
                      {l.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredLeads.length > 30 && (
          <p className="text-xs mt-3 text-center" style={{ color: "var(--text-dim)" }}>
            Mostrando 30 de {filteredLeads.length} leads
          </p>
        )}
      </div>
    </div>
  );
}
