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
  if (!configured) return <span className="text-xs px-2 py-1 rounded-full" style={{ background: "rgba(100,116,139,0.15)", color: "#94a3b8" }}>Nao configurado</span>;
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
    contentStyle: { background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "0.75rem", color: "#e2e8f0" },
    labelStyle: { color: "#94a3b8" },
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
            <h3 className="text-sm font-bold" style={{ color: "#e2e8f0" }}>{name}</h3>
            {data?.fetchedAt && (
              <p className="text-xs" style={{ color: "#64748b" }}>
                Atualizado: {new Date(data.fetchedAt).toLocaleString("pt-BR")}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge configured={data?.configured ?? false} error={data?.error} />
          <button onClick={onRefresh} disabled={loading} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} style={{ color: "#64748b" }} />
          </button>
        </div>
      </div>

      {!data?.configured && (
        <div className="p-4 rounded-xl text-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
          <XCircle size={24} className="mx-auto mb-2" style={{ color: "#64748b" }} />
          <p className="text-sm" style={{ color: "#94a3b8" }}>{data?.message || "Aguardando configuração das credenciais."}</p>
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
              <div className="p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)" }}>
                <p className="text-xs" style={{ color: "#64748b" }}>Impressoes</p>
                <p className="text-lg font-bold" style={{ color: "#e2e8f0" }}>{formatNumber(totals.impressions)}</p>
              </div>
            )}
            {totals.clicks !== undefined && (
              <div className="p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)" }}>
                <p className="text-xs" style={{ color: "#64748b" }}>Cliques</p>
                <p className="text-lg font-bold" style={{ color: "#e2e8f0" }}>{formatNumber(totals.clicks)}</p>
              </div>
            )}
            {(totals.cost !== undefined || totals.spend !== undefined) && (
              <div className="p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)" }}>
                <p className="text-xs" style={{ color: "#64748b" }}>Investimento</p>
                <p className="text-lg font-bold" style={{ color: "#e2e8f0" }}>{formatBRL(totals.cost ?? totals.spend ?? 0)}</p>
              </div>
            )}
            {(totals.conversions !== undefined || totals.leads !== undefined) && (
              <div className="p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)" }}>
                <p className="text-xs" style={{ color: "#64748b" }}>{totals.leads !== undefined ? "Leads" : "Conversoes"}</p>
                <p className="text-lg font-bold" style={{ color: "#e2e8f0" }}>{formatNumber(totals.leads ?? totals.conversions ?? 0)}</p>
              </div>
            )}
          </div>

          {campaigns.length > 0 && (
            <div>
              <h4 className="text-xs font-bold mb-3" style={{ color: "#64748b" }}>POR CAMPANHA</h4>
              <ResponsiveContainer width="100%" height={Math.max(200, campaigns.length * 40)}>
                <BarChart data={campaigns.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis type="number" tick={{ fill: "#64748b", fontSize: 11 }} />
                  <YAxis
                    dataKey="campaignName"
                    type="category"
                    tick={{ fill: "#94a3b8", fontSize: 10 }}
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

export default function TabIntegracoes() {
  const [googleData, setGoogleData] = useState<APIResponse | null>(null);
  const [metaData, setMetaData] = useState<APIResponse | null>(null);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(false);

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

  useEffect(() => {
    fetchGoogle();
    fetchMeta();
  }, []);

  return (
    <div className="space-y-6">
      {/* Status geral */}
      <div className="kpi-card">
        <h3 className="text-sm font-bold mb-3" style={{ color: "#94a3b8" }}>STATUS DAS INTEGRACOES</h3>
        <p className="text-xs mb-4" style={{ color: "#64748b" }}>
          As APIs puxam dados em tempo real das plataformas. Configure as credenciais nas variaveis de ambiente da Vercel.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)" }}>
            {googleData?.configured && !googleData.error ? (
              <CheckCircle size={16} style={{ color: "#10b981" }} />
            ) : (
              <XCircle size={16} style={{ color: "#64748b" }} />
            )}
            <div>
              <p className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>Google Ads</p>
              <p className="text-xs" style={{ color: "#64748b" }}>
                {googleData?.configured ? (googleData.error ? "Erro na conexão" : "Conectado") : "Aguardando credenciais"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)" }}>
            {metaData?.configured && !metaData.error ? (
              <CheckCircle size={16} style={{ color: "#10b981" }} />
            ) : (
              <XCircle size={16} style={{ color: "#64748b" }} />
            )}
            <div>
              <p className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>Meta Ads</p>
              <p className="text-xs" style={{ color: "#64748b" }}>
                {metaData?.configured ? (metaData.error ? "Erro na conexão" : "Conectado") : "Aguardando credenciais"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Cards das plataformas */}
      <PlatformCard name="Google Ads" color="#4285f4" data={googleData} loading={loadingGoogle} onRefresh={fetchGoogle} />
      <PlatformCard name="Meta Ads" color="#e94560" data={metaData} loading={loadingMeta} onRefresh={fetchMeta} />
    </div>
  );
}
