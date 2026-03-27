"use client";

import { useState, useEffect } from "react";
import { RefreshCw, CheckCircle, XCircle, ExternalLink, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { formatBRL, formatNumber } from "@/lib/types";

interface CampaignData {
  campaignName: string;
  impressions: number;
  clicks: number;
  cost?: number;
  spend?: number;
  conversions?: number;
  leads?: number;
  reach?: number;
}

interface APIResponse {
  configured: boolean;
  message?: string;
  error?: string;
  campaigns?: CampaignData[];
  totals?: Record<string, number>;
  fetchedAt?: string;
}

function StatusBadge({ configured, error }: { configured: boolean; error?: string }) {
  if (!configured) return <span className="text-xs px-2 py-1 rounded-full" style={{ background: "rgba(100,116,139,0.15)", color: "var(--text-muted)" }}>Nao configurado</span>;
  if (error) return <span className="text-xs px-2 py-1 rounded-full" style={{ background: "rgba(233,69,96,0.15)", color: "#e94560" }}>Erro</span>;
  return <span className="text-xs px-2 py-1 rounded-full" style={{ background: "rgba(16,185,129,0.15)", color: "#10b981" }}>Conectado</span>;
}

function PlatformCard({
  name,
  color,
  data,
  loading,
  onRefresh,
}: {
  name: string;
  color: string;
  data: APIResponse | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const tooltipStyle = {
    contentStyle: { background: "var(--tooltip-bg)", border: "1px solid var(--border)", borderRadius: "0.75rem", color: "var(--text)" },
    labelStyle: { color: "var(--text-muted)" },
  };

  const campaigns = data?.campaigns || [];
  const totals = data?.totals;

  return (
    <div className="kpi-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
            <TrendingUp size={16} style={{ color }} />
          </div>
          <div>
            <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>{name}</h3>
            {data?.fetchedAt && (
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                Atualizado: {new Date(data.fetchedAt).toLocaleString("pt-BR")}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge configured={data?.configured ?? false} error={data?.error} />
          <button onClick={onRefresh} disabled={loading} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} style={{ color: "var(--text-dim)" }} />
          </button>
        </div>
      </div>

      {!data?.configured && (
        <div className="p-4 rounded-xl text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <XCircle size={24} className="mx-auto mb-2" style={{ color: "var(--text-dim)" }} />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>{data?.message || "Aguardando configuração das credenciais."}</p>
        </div>
      )}

      {data?.error && (
        <div className="p-3 rounded-xl" style={{ background: "rgba(233,69,96,0.08)", border: "1px solid rgba(233,69,96,0.15)" }}>
          <p className="text-xs" style={{ color: "#f87171" }}>{data.error}</p>
        </div>
      )}

      {data?.configured && !data?.error && totals && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {totals.impressions !== undefined && (
              <div className="p-3 rounded-xl" style={{ background: "var(--surface)" }}>
                <p className="text-xs" style={{ color: "var(--text-dim)" }}>Impressoes</p>
                <p className="text-lg font-bold" style={{ color: "var(--text)" }}>{formatNumber(totals.impressions)}</p>
              </div>
            )}
            {totals.clicks !== undefined && (
              <div className="p-3 rounded-xl" style={{ background: "var(--surface)" }}>
                <p className="text-xs" style={{ color: "var(--text-dim)" }}>Cliques</p>
                <p className="text-lg font-bold" style={{ color: "var(--text)" }}>{formatNumber(totals.clicks)}</p>
              </div>
            )}
            {(totals.cost !== undefined || totals.spend !== undefined) && (
              <div className="p-3 rounded-xl" style={{ background: "var(--surface)" }}>
                <p className="text-xs" style={{ color: "var(--text-dim)" }}>Investimento</p>
                <p className="text-lg font-bold" style={{ color: "var(--text)" }}>{formatBRL(totals.cost ?? totals.spend ?? 0)}</p>
              </div>
            )}
            {(totals.conversions !== undefined || totals.leads !== undefined) && (
              <div className="p-3 rounded-xl" style={{ background: "var(--surface)" }}>
                <p className="text-xs" style={{ color: "var(--text-dim)" }}>{totals.leads !== undefined ? "Leads" : "Conversoes"}</p>
                <p className="text-lg font-bold" style={{ color: "var(--text)" }}>{formatNumber(totals.leads ?? totals.conversions ?? 0)}</p>
              </div>
            )}
          </div>

          {campaigns.length > 0 && (
            <div>
              <h4 className="text-xs font-bold mb-3" style={{ color: "var(--text-dim)" }}>POR CAMPANHA</h4>
              <ResponsiveContainer width="100%" height={Math.max(200, campaigns.length * 40)}>
                <BarChart data={campaigns.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" tick={{ fill: "var(--text-dim)", fontSize: 11 }} />
                  <YAxis
                    dataKey="campaignName"
                    type="category"
                    tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                    width={180}
                  />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey={name.includes("Google") ? "cost" : "spend"} name="Investimento (R$)" fill={color} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface UauResponse {
  configured: boolean;
  status?: string;
  uauStatus?: string;
  uauError?: string;
  message?: string;
  error?: string;
  fetchedAt?: string;
  summary?: {
    totalObras?: number;
    totalProspects?: number;
    totalVendas?: number;
    total?: number;
    disponivel?: number;
    vendido?: number;
    emVenda?: number;
    vgvTotal?: number;
    vgvVendido?: number;
  };
}

function UauCard({ data, loading, onRefresh }: { data: UauResponse | null; loading: boolean; onRefresh: () => void }) {
  const color = "#f59e0b";
  return (
    <div className="kpi-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
            <TrendingUp size={16} style={{ color }} />
          </div>
          <div>
            <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>ERP UAU (Senior)</h3>
            {data?.fetchedAt && (
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                Atualizado: {new Date(data.fetchedAt).toLocaleString("pt-BR")}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge configured={data?.configured ?? false} error={data?.error} />
          <button onClick={onRefresh} disabled={loading} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} style={{ color: "var(--text-dim)" }} />
          </button>
        </div>
      </div>

      {!data?.configured && (
        <div className="p-4 rounded-xl text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <XCircle size={24} className="mx-auto mb-2" style={{ color: "var(--text-dim)" }} />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>{data?.message || "Aguardando configuração das credenciais."}</p>
        </div>
      )}

      {data?.error && (
        <div className="p-3 rounded-xl" style={{ background: "rgba(233,69,96,0.08)", border: "1px solid rgba(233,69,96,0.15)" }}>
          <p className="text-xs" style={{ color: "#f87171" }}>{data.error}</p>
        </div>
      )}

      {data?.configured && !data?.error && data?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl" style={{ background: "var(--surface)" }}>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>Total Lotes</p>
            <p className="text-lg font-bold" style={{ color: "var(--text)" }}>{formatNumber(data.summary.total ?? 0)}</p>
          </div>
          <div className="p-3 rounded-xl" style={{ background: "var(--surface)" }}>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>Disponíveis</p>
            <p className="text-lg font-bold" style={{ color: "#10b981" }}>{formatNumber(data.summary.disponivel ?? 0)}</p>
          </div>
          <div className="p-3 rounded-xl" style={{ background: "var(--surface)" }}>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>Vendidos</p>
            <p className="text-lg font-bold" style={{ color: "#e94560" }}>{formatNumber(data.summary.vendido ?? 0)}</p>
          </div>
          <div className="p-3 rounded-xl" style={{ background: "var(--surface)" }}>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>VGV Total</p>
            <p className="text-lg font-bold" style={{ color: "var(--text)" }}>{formatBRL(data.summary.vgvTotal ?? 0)}</p>
          </div>
        </div>
      )}
      {data?.uauStatus === "offline" && (
        <p className="text-xs mt-2" style={{ color: "#f59e0b" }}>Usando dados estáticos (UAU offline). Status em tempo real indisponível.</p>
      )}
    </div>
  );
}

export default function TabIntegracoes() {
  const [googleData, setGoogleData] = useState<APIResponse | null>(null);
  const [metaData, setMetaData] = useState<APIResponse | null>(null);
  const [uauData, setUauData] = useState<UauResponse | null>(null);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingUau, setLoadingUau] = useState(false);

  async function fetchGoogle() {
    setLoadingGoogle(true);
    try {
      const res = await fetch("/api/google-ads");
      setGoogleData(await res.json());
    } catch {
      setGoogleData({ configured: false, message: "Erro de conexão" });
    }
    setLoadingGoogle(false);
  }

  async function fetchMeta() {
    setLoadingMeta(true);
    try {
      const res = await fetch("/api/meta-ads");
      setMetaData(await res.json());
    } catch {
      setMetaData({ configured: false, message: "Erro de conexão" });
    }
    setLoadingMeta(false);
  }

  async function fetchUau() {
    setLoadingUau(true);
    try {
      const res = await fetch("/api/uau");
      const json = await res.json();
      // Map new API format to expected format
      if (json.status === "connected") {
        setUauData({
          configured: true,
          status: json.status,
          uauStatus: json.uauStatus,
          uauError: json.uauError,
          summary: json.summary,
          fetchedAt: new Date().toISOString(),
          error: json.uauError || undefined,
        });
      } else {
        setUauData({ configured: json.status === "connected", message: json.message || json.uauError || "Erro ao conectar" });
      }
    } catch {
      setUauData({ configured: false, message: "Erro de conexão" });
    }
    setLoadingUau(false);
  }

  useEffect(() => {
    fetchGoogle();
    fetchMeta();
    fetchUau();
  }, []);

  return (
    <div className="space-y-6">
      {/* Status geral */}
      <div className="kpi-card">
        <h3 className="text-sm font-bold mb-3" style={{ color: "var(--text-muted)" }}>STATUS DAS INTEGRACOES</h3>
        <p className="text-xs mb-4" style={{ color: "var(--text-dim)" }}>
          As APIs puxam dados em tempo real das plataformas. Configure as credenciais nas variaveis de ambiente da Vercel.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "var(--surface)" }}>
            {googleData?.configured && !googleData.error ? (
              <CheckCircle size={16} style={{ color: "#10b981" }} />
            ) : (
              <XCircle size={16} style={{ color: "var(--text-dim)" }} />
            )}
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Google Ads</p>
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                {googleData?.configured ? (googleData.error ? "Erro na conexão" : "Conectado") : "Aguardando credenciais"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "var(--surface)" }}>
            {metaData?.configured && !metaData.error ? (
              <CheckCircle size={16} style={{ color: "#10b981" }} />
            ) : (
              <XCircle size={16} style={{ color: "var(--text-dim)" }} />
            )}
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Meta Ads</p>
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                {metaData?.configured ? (metaData.error ? "Erro na conexão" : "Conectado") : "Aguardando credenciais"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "var(--surface)" }}>
            {uauData?.configured && !uauData.error ? (
              <CheckCircle size={16} style={{ color: "#10b981" }} />
            ) : (
              <XCircle size={16} style={{ color: "var(--text-dim)" }} />
            )}
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>ERP UAU</p>
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                {uauData?.configured ? (uauData.error ? "Erro na conexão" : "Conectado") : "Aguardando credenciais"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Cards das plataformas */}
      <PlatformCard name="Google Ads" color="#4285f4" data={googleData} loading={loadingGoogle} onRefresh={fetchGoogle} />
      <PlatformCard name="Meta Ads" color="#e94560" data={metaData} loading={loadingMeta} onRefresh={fetchMeta} />
      <UauCard data={uauData} loading={loadingUau} onRefresh={fetchUau} />
    </div>
  );
}
