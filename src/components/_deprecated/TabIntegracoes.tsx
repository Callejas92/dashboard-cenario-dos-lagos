"use client";

import { useState, useEffect } from "react";
import { RefreshCw, CheckCircle, XCircle, ExternalLink, TrendingUp, CloudUpload, FileSpreadsheet, Link2 } from "lucide-react";
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

interface SimpleStatus {
  configured: boolean;
  message?: string;
  error?: string;
  fetchedAt?: string;
  [key: string]: unknown;
}

function SimpleCard({ name, color, data, loading, onRefresh }: { name: string; color: string; data: SimpleStatus | null; loading: boolean; onRefresh: () => void }) {
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
      {data?.configured && !data?.error && (
        <div className="p-3 rounded-xl" style={{ background: "var(--surface)" }}>
          <p className="text-xs" style={{ color: "#10b981" }}>Integração ativa e funcionando.</p>
        </div>
      )}
    </div>
  );
}

interface OneDriveStatus {
  connected: boolean;
  owner?: string;
  driveType?: string;
  connected_at?: string;
  message?: string;
}

function OneDriveCard({ data, loading, onRefresh }: { data: OneDriveStatus | null; loading: boolean; onRefresh: () => void }) {
  const color = "#0078d4";
  const [connecting, setConnecting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  async function handleConnect() {
    setConnecting(true);
    try {
      const res = await fetch("/api/onedrive/auth");
      const json = await res.json();
      if (json.authUrl) {
        window.open(json.authUrl, "_blank");
      } else if (json.error) {
        alert(json.error);
      }
    } catch {
      alert("Erro ao iniciar conexão com OneDrive");
    }
    setConnecting(false);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/custos-offline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test" }) });
      const json = await res.json();
      if (json.success) {
        setTestResult(`Planilha lida com sucesso! ${json.custosMensais} meses. Total offline: R$ ${(json.total_offline || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
      } else {
        setTestResult(`Erro: ${json.error}`);
      }
    } catch (err) {
      setTestResult(`Erro: ${err}`);
    }
    setTesting(false);
  }

  return (
    <div className="kpi-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
            <FileSpreadsheet size={16} style={{ color }} />
          </div>
          <div>
            <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>OneDrive - Custos Offline</h3>
            {data?.connected_at && (
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                Conectado em: {new Date(data.connected_at).toLocaleString("pt-BR")}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge configured={data?.connected ?? false} error={!data?.connected ? data?.message : undefined} />
          <button onClick={onRefresh} disabled={loading} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} style={{ color: "var(--text-dim)" }} />
          </button>
        </div>
      </div>

      {!data?.connected ? (
        <div className="space-y-3">
          <div className="p-4 rounded-xl text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <CloudUpload size={24} className="mx-auto mb-2" style={{ color: "var(--text-dim)" }} />
            <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>
              {data?.message || "Conecte seu OneDrive para ler a planilha de custos offline automaticamente."}
            </p>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              style={{ background: color, color: "white" }}
            >
              {connecting ? "Abrindo..." : "Conectar OneDrive"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl" style={{ background: "var(--surface)" }}>
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>Conta</p>
              <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{data.owner || "Conectado"}</p>
            </div>
            <div className="p-3 rounded-xl" style={{ background: "var(--surface)" }}>
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>Tipo</p>
              <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{data.driveType === "personal" ? "Pessoal" : data.driveType || "-"}</p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleTest}
              disabled={testing}
              className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
            >
              <FileSpreadsheet size={14} />
              {testing ? "Testando..." : "Testar Leitura"}
            </button>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
            >
              <Link2 size={14} />
              Reconectar
            </button>
          </div>

          {testResult && (
            <div className="p-3 rounded-xl text-xs" style={{
              background: testResult.includes("sucesso") ? "rgba(16,185,129,0.08)" : "rgba(233,69,96,0.08)",
              border: `1px solid ${testResult.includes("sucesso") ? "rgba(16,185,129,0.15)" : "rgba(233,69,96,0.15)"}`,
              color: testResult.includes("sucesso") ? "#10b981" : "#f87171",
            }}>
              {testResult}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TabIntegracoes() {
  const [googleData, setGoogleData] = useState<APIResponse | null>(null);
  const [metaData, setMetaData] = useState<APIResponse | null>(null);
  const [uauData, setUauData] = useState<UauResponse | null>(null);
  const [crmData, setCrmData] = useState<SimpleStatus | null>(null);
  const [igData, setIgData] = useState<SimpleStatus | null>(null);
  const [onedriveData, setOnedriveData] = useState<OneDriveStatus | null>(null);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingUau, setLoadingUau] = useState(false);
  const [loadingCrm, setLoadingCrm] = useState(false);
  const [loadingIg, setLoadingIg] = useState(false);
  const [loadingOnedrive, setLoadingOnedrive] = useState(false);

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

  async function fetchCrm() {
    setLoadingCrm(true);
    try {
      const res = await fetch("/api/crm");
      const json = await res.json();
      setCrmData({ ...json, fetchedAt: json.fetchedAt || new Date().toISOString() });
    } catch {
      setCrmData({ configured: false, message: "Erro de conexão" });
    }
    setLoadingCrm(false);
  }

  async function fetchIg() {
    setLoadingIg(true);
    try {
      const res = await fetch("/api/instagram");
      const json = await res.json();
      setIgData({ ...json, fetchedAt: json.fetchedAt || new Date().toISOString() });
    } catch {
      setIgData({ configured: false, message: "Erro de conexão" });
    }
    setLoadingIg(false);
  }

  async function fetchOnedrive() {
    setLoadingOnedrive(true);
    try {
      const res = await fetch("/api/onedrive/status");
      const json = await res.json();
      setOnedriveData(json);
    } catch {
      setOnedriveData({ connected: false, message: "Erro de conexão" });
    }
    setLoadingOnedrive(false);
  }

  useEffect(() => {
    fetchGoogle();
    fetchMeta();
    fetchUau();
    fetchCrm();
    fetchIg();
    fetchOnedrive();
  }, []);

  return (
    <div className="space-y-6">
      {/* Status geral */}
      <div className="kpi-card">
        <h3 className="text-sm font-bold mb-3" style={{ color: "var(--text-muted)" }}>STATUS DAS INTEGRACOES</h3>
        <p className="text-xs mb-4" style={{ color: "var(--text-dim)" }}>
          As APIs puxam dados em tempo real das plataformas. Configure as credenciais nas variaveis de ambiente da Vercel.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
          {[
            { name: "Google Ads", data: googleData },
            { name: "Meta Ads", data: metaData },
            { name: "ERP UAU", data: uauData },
            { name: "CRM Eggs", data: crmData },
            { name: "Instagram", data: igData },
            { name: "OneDrive", data: onedriveData ? { configured: onedriveData.connected } : null },
          ].map(({ name, data: d }) => (
            <div key={name} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "var(--surface)" }}>
              {d?.configured && !d.error ? (
                <CheckCircle size={16} style={{ color: "#10b981" }} />
              ) : (
                <XCircle size={16} style={{ color: "var(--text-dim)" }} />
              )}
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{name}</p>
                <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                  {d?.configured ? (d.error ? "Erro" : "Conectado") : "Aguardando"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cards das plataformas */}
      <PlatformCard name="Google Ads" color="#4285f4" data={googleData} loading={loadingGoogle} onRefresh={fetchGoogle} />
      <PlatformCard name="Meta Ads" color="#e94560" data={metaData} loading={loadingMeta} onRefresh={fetchMeta} />
      <UauCard data={uauData} loading={loadingUau} onRefresh={fetchUau} />
      <SimpleCard name="CRM Eggs" color="#8b5cf6" data={crmData} loading={loadingCrm} onRefresh={fetchCrm} />
      <SimpleCard name="Instagram" color="#ec4899" data={igData} loading={loadingIg} onRefresh={fetchIg} />
      <OneDriveCard data={onedriveData} loading={loadingOnedrive} onRefresh={fetchOnedrive} />
    </div>
  );
}
