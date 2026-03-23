"use client";

import { useState, useEffect, useCallback } from "react";
import { BarChart3, ShieldCheck, PlusCircle, RefreshCw, Plug, Globe, Sun, Moon } from "lucide-react";
import TabVisaoGeral from "@/components/TabVisaoGeral";
import TabCanais from "@/components/TabCanais";
import TabQualidade from "@/components/TabQualidade";
import TabIntegracoes from "@/components/TabIntegracoes";
import TabAnalytics from "@/components/TabAnalytics";
import FormSemanal from "@/components/FormSemanal";
import LoginScreen from "@/components/LoginScreen";
import { MetricsData } from "@/lib/types";

type Tab = "geral" | "canais" | "qualidade" | "analytics" | "integracoes" | "inserir";

const tabs: { id: Tab; label: string; icon: typeof BarChart3 }[] = [
  { id: "geral", label: "Visao Geral", icon: BarChart3 },
  { id: "canais", label: "Canais", icon: BarChart3 },
  { id: "qualidade", label: "Qualidade", icon: ShieldCheck },
  { id: "analytics", label: "Site", icon: Globe },
  { id: "integracoes", label: "APIs", icon: Plug },
  { id: "inserir", label: "Inserir Dados", icon: PlusCircle },
];

export default function Home() {
  const [authenticated, setAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("geral");
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dark, setDark] = useState(false);

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

  if (!authenticated) {
    return <LoginScreen onLogin={() => setAuthenticated(true)} dark={dark} onToggleTheme={toggleTheme} />;
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
                {data.semanas.length} semanas
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

      {/* Tabs */}
      <div className="sticky top-16 z-40 backdrop-blur-xl" style={{ background: "var(--bg-tabs)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-2 py-3 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm whitespace-nowrap transition-all ${
                  activeTab === tab.id ? "tab-active" : "tab-inactive"
                }`}
              >
                <tab.icon size={14} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {activeTab === "geral" && <TabVisaoGeral data={data} />}
        {activeTab === "canais" && <TabCanais data={data} />}
        {activeTab === "qualidade" && <TabQualidade data={data} />}
        {activeTab === "analytics" && <TabAnalytics />}
        {activeTab === "integracoes" && <TabIntegracoes />}
        {activeTab === "inserir" && <FormSemanal data={data} onSaved={loadData} />}
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
