"use client";

import { useState, useEffect, useCallback } from "react";
import { BarChart3, ShieldCheck, PlusCircle, RefreshCw, Plug, Globe, Sun, Moon, Home as HomeIcon, DollarSign, Users, Instagram, Megaphone, MessageCircle, Target, FileText, GripVertical, Check, ChevronLeft, ChevronRight, Award } from "lucide-react";
import TabVisaoGeral from "@/components/TabVisaoGeral";
import TabCanais from "@/components/TabCanais";
import TabQualidade from "@/components/TabQualidade";
import TabIntegracoes from "@/components/TabIntegracoes";
import TabAnalytics from "@/components/TabAnalytics";
import TabEstoque from "@/components/TabEstoque";
import TabFinanceiro from "@/components/TabFinanceiro";
import TabMarketing from "@/components/TabMarketing";
import TabCRM from "@/components/TabCRM";
import TabInstagram from "@/components/TabInstagram";
import TabMetaAds from "@/components/TabMetaAds";
import TabGoogleAds from "@/components/TabGoogleAds";
import TabWhatsApp from "@/components/TabWhatsApp";
import TabContratos from "@/components/TabContratos";
import TabBonus from "@/components/TabBonus";
import FormSemanal from "@/components/FormSemanal";
import LoginScreen from "@/components/LoginScreen";
import { MetricsData, FinanceiroResponse } from "@/lib/types";

type Tab = "geral" | "canais" | "qualidade" | "analytics" | "estoque" | "financeiro" | "bonus" | "marketing" | "contratos" | "crm" | "instagram" | "metaads" | "googleads" | "whatsapp" | "integracoes" | "inserir";

const tabs: { id: Tab; label: string; icon: typeof BarChart3 }[] = [
  { id: "geral", label: "Visao Geral", icon: BarChart3 },
  { id: "canais", label: "Canais", icon: BarChart3 },
  { id: "qualidade", label: "Qualidade", icon: ShieldCheck },
  { id: "analytics", label: "Site", icon: Globe },
  { id: "estoque", label: "Estoque", icon: HomeIcon },
  { id: "financeiro", label: "Financeiro", icon: DollarSign },
  { id: "bonus", label: "Bônus", icon: Award },
  { id: "marketing", label: "Marketing MKT", icon: Target },
  { id: "contratos", label: "Contratos", icon: FileText },
  { id: "crm", label: "CRM", icon: Users },
  { id: "instagram", label: "Instagram", icon: Instagram },
  { id: "metaads", label: "Meta Ads", icon: Megaphone },
  { id: "googleads", label: "Google Ads", icon: Target },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { id: "integracoes", label: "APIs", icon: Plug },
  // { id: "inserir", label: "Inserir Dados", icon: PlusCircle }, // oculto por decisão do proprietário
];

export default function Home() {
  const [authenticated, setAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("geral");
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dark, setDark] = useState(false);

  // Tabs reorderable (persistido em localStorage, setas pra mover)
  const [tabOrder, setTabOrder] = useState<Tab[]>(() => tabs.map((t) => t.id));
  const [tabsEditMode, setTabsEditMode] = useState(false);

  // Carrega ordem salva do localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem("dashboard.tabOrder");
      if (saved) {
        const parsed = JSON.parse(saved) as Tab[];
        // Garante que todas as abas atuais estejam presentes (lida com adições futuras)
        const validIds = new Set(tabs.map((t) => t.id));
        const filtered = parsed.filter((id) => validIds.has(id));
        const missing = tabs.map((t) => t.id).filter((id) => !filtered.includes(id));
        setTabOrder([...filtered, ...missing]);
      }
    } catch { /* ignore */ }
  }, []);

  // Mapeia ordem persistida → array de tabs
  const tabsMap = new Map(tabs.map((t) => [t.id, t] as const));
  const orderedTabs = tabOrder.map((id) => tabsMap.get(id)).filter((t): t is typeof tabs[number] => Boolean(t));

  // Estoque state
  interface EstoqueData {
    status: string;
    uauStatus?: string;
    summary: { total: number; disponivel: number; vendido: number; emVenda: number; foraDeVenda: number; vgvTotal: number; vgvVendido: number; areaTotal: number; areaVendida: number };
    quadras: Array<{ quadra: string; total: number; disponivel: number; vendido: number; emVenda: number; foraDeVenda: number; vgvTotal: number; vgvVendido: number }>;
    unidades: Array<{ identificador: string; quadra: string; lote: string; loteNum: number; status: string; area: number; valorTotal: number; valorM2: number; classificacao: string; rua: string }>;
    classificacoes: Array<{ nome: string; total: number; disponivel: number; vendido: number; foraDeVenda: number }>;
  }
  const [estoqueData, setEstoqueData] = useState<EstoqueData | null>(null);
  const [estoqueLoading, setEstoqueLoading] = useState(false);
  const [estoqueError, setEstoqueError] = useState<string | null>(null);
  const [estoqueFetched, setEstoqueFetched] = useState(false);

  // Financeiro state
  const [financeiroData, setFinanceiroData] = useState<FinanceiroResponse | null>(null);
  const [financeiroLoading, setFinanceiroLoading] = useState(false);
  const [financeiroError, setFinanceiroError] = useState<string | null>(null);
  const [financeiroFetched, setFinanceiroFetched] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    setDark(saved === "dark");
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    localStorage.setItem("theme", next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
  }

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/metrics");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authenticated) loadData();
  }, [loadData, authenticated]);

  // Fetch estoque data when tab is selected
  useEffect(() => {
    if (activeTab === "estoque" && !estoqueFetched && !estoqueLoading) {
      setEstoqueLoading(true);
      setEstoqueError(null);
      fetch("/api/uau")
        .then((res) => res.json())
        .then((json) => {
          if (json.status === "connected") {
            setEstoqueData(json);
          } else {
            setEstoqueError(json.error || json.message || "Erro ao conectar com o ERP UAU.");
          }
          setEstoqueFetched(true);
        })
        .catch((err) => {
          setEstoqueError(String(err));
          setEstoqueFetched(true);
        })
        .finally(() => setEstoqueLoading(false));
    }
  }, [activeTab, estoqueFetched, estoqueLoading]);

  // Fetch financeiro data when tab is selected
  useEffect(() => {
    if (activeTab === "financeiro" && !financeiroFetched && !financeiroLoading) {
      setFinanceiroLoading(true);
      setFinanceiroError(null);
      fetch("/api/uau/financeiro")
        .then((res) => res.json())
        .then((json) => {
          if (json.error) {
            setFinanceiroError(json.error);
          } else {
            setFinanceiroData(json);
          }
          setFinanceiroFetched(true);
        })
        .catch((err) => {
          setFinanceiroError(String(err));
          setFinanceiroFetched(true);
        })
        .finally(() => setFinanceiroLoading(false));
    }
  }, [activeTab, financeiroFetched, financeiroLoading]);

  if (!authenticated) {
    return <LoginScreen onLogin={(pwd) => { setAuthToken(pwd); setAuthenticated(true); }} dark={dark} onToggleTheme={toggleTheme} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <RefreshCw size={32} className="animate-spin mx-auto mb-4" style={{ color: "#1a5c3a" }} />
          <p style={{ color: "var(--text-muted)" }}>Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p style={{ color: "var(--red)" }}>Erro ao carregar dados. Verifique o arquivo data/metrics.json.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl" style={{ background: "var(--bg-header)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img
                src={dark ? "/logo-cenario-negativa.png" : "/logo-cenario.png"}
                alt="Cenário dos Lagos"
                className="h-10 object-contain"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.2)" }}>
                {(() => {
                  const launch = new Date("2026-04-14");
                  const now = new Date();
                  const diff = now.getTime() - launch.getTime();
                  if (diff < 0) {
                    const dias = Math.ceil(Math.abs(diff) / (24 * 60 * 60 * 1000));
                    return `Lançamento em ${dias} dias`;
                  }
                  const semanas = Math.floor(diff / (7 * 24 * 60 * 60 * 1000));
                  return semanas === 0 ? "Semana 1" : `${semanas} semana${semanas > 1 ? "s" : ""}`;
                })()}
              </span>
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg transition-colors"
                style={{ color: "var(--text-dim)" }}
                title={dark ? "Modo claro" : "Modo escuro"}
              >
                {dark ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button
                onClick={loadData}
                className="p-2 rounded-lg transition-colors"
                title="Atualizar dados"
                style={{ color: "var(--text-dim)" }}
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs (reordenáveis via setas no modo edição) */}
      <div className="sticky top-16 z-40 backdrop-blur-xl" style={{ background: "var(--bg-tabs)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-2 py-3 overflow-x-auto items-center">
            {orderedTabs.map((tab, idx) => {
              const isActive = activeTab === tab.id && !tabsEditMode;
              const canMoveLeft = idx > 0;
              const canMoveRight = idx < orderedTabs.length - 1;

              function moveTab(direction: "left" | "right") {
                const newOrder = [...tabOrder];
                const swapWith = direction === "left" ? idx - 1 : idx + 1;
                [newOrder[idx], newOrder[swapWith]] = [newOrder[swapWith], newOrder[idx]];
                setTabOrder(newOrder);
                try { localStorage.setItem("dashboard.tabOrder", JSON.stringify(newOrder)); } catch { /* ignore */ }
              }

              return (
                <div
                  key={tab.id}
                  className={`flex items-center gap-1 rounded-xl whitespace-nowrap transition-all ${
                    isActive ? "tab-active" : "tab-inactive"
                  }`}
                  style={{
                    padding: tabsEditMode ? "0.125rem 0.5rem" : "0.5rem 1rem",
                  }}
                >
                  {tabsEditMode && (
                    <button
                      onClick={() => canMoveLeft && moveTab("left")}
                      disabled={!canMoveLeft}
                      style={{
                        padding: "0.25rem",
                        borderRadius: "0.25rem",
                        background: "transparent",
                        border: "none",
                        cursor: canMoveLeft ? "pointer" : "not-allowed",
                        color: canMoveLeft ? "var(--text)" : "var(--text-dim)",
                        opacity: canMoveLeft ? 1 : 0.3,
                      }}
                      title="Mover pra esquerda"
                    >
                      <ChevronLeft size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => { if (!tabsEditMode) setActiveTab(tab.id); }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: tabsEditMode ? "0.25rem 0.5rem" : "0",
                      background: "transparent",
                      border: "none",
                      color: "inherit",
                      cursor: tabsEditMode ? "default" : "pointer",
                      fontSize: "0.875rem",
                    }}
                  >
                    <tab.icon size={14} />
                    {tab.label}
                  </button>
                  {tabsEditMode && (
                    <button
                      onClick={() => canMoveRight && moveTab("right")}
                      disabled={!canMoveRight}
                      style={{
                        padding: "0.25rem",
                        borderRadius: "0.25rem",
                        background: "transparent",
                        border: "none",
                        cursor: canMoveRight ? "pointer" : "not-allowed",
                        color: canMoveRight ? "var(--text)" : "var(--text-dim)",
                        opacity: canMoveRight ? 1 : 0.3,
                      }}
                      title="Mover pra direita"
                    >
                      <ChevronRight size={14} />
                    </button>
                  )}
                </div>
              );
            })}
            {/* Botão pra ativar/desativar modo edição */}
            <button
              onClick={() => setTabsEditMode((v) => !v)}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs whitespace-nowrap ml-auto flex-shrink-0"
              style={{
                background: tabsEditMode ? "#4285f4" : "var(--surface)",
                color: tabsEditMode ? "#fff" : "var(--text-dim)",
                border: "1px solid var(--border)",
                cursor: "pointer",
              }}
              title={tabsEditMode ? "Concluir reordenação" : "Reordenar abas"}
            >
              {tabsEditMode ? <><Check size={12} /> OK</> : <><GripVertical size={12} /> Ordenar</>}
            </button>
            {tabsEditMode && (
              <button
                onClick={() => {
                  const defaultOrder = tabs.map((t) => t.id);
                  setTabOrder(defaultOrder);
                  try { localStorage.setItem("dashboard.tabOrder", JSON.stringify(defaultOrder)); } catch { /* ignore */ }
                }}
                className="px-3 py-2 rounded-xl text-xs whitespace-nowrap flex-shrink-0"
                style={{ background: "var(--surface)", color: "var(--text-dim)", border: "1px solid var(--border)", cursor: "pointer" }}
                title="Voltar à ordem padrão"
              >
                Resetar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {activeTab === "geral" && <TabVisaoGeral data={data} />}
        {activeTab === "canais" && <TabCanais data={data} />}
        {activeTab === "qualidade" && <TabQualidade data={data} />}
        {activeTab === "analytics" && <TabAnalytics />}
        {activeTab === "estoque" && (
          estoqueLoading ? (
            <div className="text-center py-12">
              <RefreshCw size={24} className="animate-spin mx-auto mb-3" style={{ color: "#1a5c3a" }} />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Carregando estoque do ERP UAU...</p>
            </div>
          ) : estoqueError ? (
            <div className="kpi-card text-center py-12">
              <p className="text-sm" style={{ color: "#e94560" }}>{estoqueError}</p>
              <button
                onClick={() => { setEstoqueFetched(false); }}
                className="mt-3 px-4 py-2 rounded-lg text-sm"
                style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" }}
              >
                Tentar novamente
              </button>
            </div>
          ) : estoqueData ? (
            <TabEstoque data={estoqueData} />
          ) : null
        )}
        {activeTab === "financeiro" && (
          financeiroLoading ? (
            <div className="text-center py-12">
              <RefreshCw size={24} className="animate-spin mx-auto mb-3" style={{ color: "#1a5c3a" }} />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Carregando dados financeiros...</p>
            </div>
          ) : financeiroError ? (
            <div className="kpi-card text-center py-12">
              <p className="text-sm" style={{ color: "#e94560" }}>{financeiroError}</p>
              <button
                onClick={() => { setFinanceiroFetched(false); }}
                className="mt-3 px-4 py-2 rounded-lg text-sm"
                style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" }}
              >
                Tentar novamente
              </button>
            </div>
          ) : financeiroData ? (
            <TabFinanceiro data={financeiroData} />
          ) : null
        )}
        {activeTab === "marketing" && <TabMarketing />}
        {activeTab === "crm" && <TabCRM />}
        {activeTab === "instagram" && <TabInstagram />}
        {activeTab === "metaads" && <TabMetaAds />}
        {activeTab === "googleads" && <TabGoogleAds />}
        {activeTab === "contratos" && <TabContratos />}
        {activeTab === "bonus" && <TabBonus />}
        {activeTab === "whatsapp" && <TabWhatsApp />}
        {activeTab === "integracoes" && <TabIntegracoes />}
        {activeTab === "inserir" && <FormSemanal data={data} onSaved={loadData} authToken={authToken} />}
      </main>

      {/* Footer */}
      <footer className="text-center py-6" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="flex items-center justify-center gap-3">
          <img src={dark ? "/logo-mangaba-negativa.png" : "/logo-mangaba.png"} alt="Mangaba Urbanismo" className="h-6 object-contain" />
          <span className="text-xs" style={{ color: "var(--text-dim)" }}>|</span>
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>
            Dashboard Marketing — {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  );
}
