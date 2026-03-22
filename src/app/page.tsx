"use client";

import { useState, useEffect, useCallback } from "react";
import { LayoutDashboard, BarChart3, ShieldCheck, PlusCircle, RefreshCw } from "lucide-react";
import TabVisaoGeral from "@/components/TabVisaoGeral";
import TabCanais from "@/components/TabCanais";
import TabQualidade from "@/components/TabQualidade";
import FormSemanal from "@/components/FormSemanal";
import { MetricsData } from "@/lib/types";

type Tab = "geral" | "canais" | "qualidade" | "inserir";

const tabs: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "geral", label: "Visao Geral", icon: LayoutDashboard },
  { id: "canais", label: "Canais", icon: BarChart3 },
  { id: "qualidade", label: "Qualidade", icon: ShieldCheck },
  { id: "inserir", label: "Inserir Dados", icon: PlusCircle },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("geral");
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);

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
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <RefreshCw size={32} className="animate-spin mx-auto mb-4" style={{ color: "#e94560" }} />
          <p style={{ color: "#94a3b8" }}>Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p style={{ color: "#e94560" }}>Erro ao carregar dados. Verifique o arquivo data/metrics.json.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl" style={{ background: "rgba(10, 10, 20, 0.85)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #e94560, #c23152)" }}>
                <LayoutDashboard size={18} color="white" />
              </div>
              <div>
                <h1 className="text-base font-extrabold" style={{ color: "#f1f5f9" }}>
                  Cenario dos Lagos
                </h1>
                <p className="text-xs" style={{ color: "#64748b" }}>Dashboard Marketing</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.2)" }}>
                {data.semanas.length} semanas
              </span>
              <button
                onClick={loadData}
                className="p-2 rounded-lg transition-colors hover:bg-white/5"
                title="Atualizar dados"
              >
                <RefreshCw size={14} style={{ color: "#64748b" }} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="sticky top-16 z-40 backdrop-blur-xl" style={{ background: "rgba(10, 10, 20, 0.7)" }}>
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
        {activeTab === "inserir" && <FormSemanal data={data} onSaved={loadData} />}
      </main>

      {/* Footer */}
      <footer className="text-center py-6" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <p className="text-xs" style={{ color: "#475569" }}>
          Dashboard Marketing — Cenario dos Lagos — {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}
