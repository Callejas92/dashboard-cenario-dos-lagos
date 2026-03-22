"use client";

import { useState } from "react";
import { Save, CheckCircle, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { MetricsData, emptyCanalData, CanalData } from "@/lib/types";

interface Props {
  data: MetricsData;
  onSaved: () => void;
}

export default function FormSemanal({ data, onSaved }: Props) {
  const [semana, setSemana] = useState(data.semanas.length + 1);
  const [canais, setCanais] = useState<Record<string, CanalData>>(() => {
    const obj: Record<string, CanalData> = {};
    for (const c of data.config.canais) obj[c] = emptyCanalData();
    return obj;
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [expandedCanal, setExpandedCanal] = useState<string | null>(data.config.canais[0] || null);

  const startDate = new Date(data.config.inicio);
  const weekStart = new Date(startDate);
  weekStart.setDate(weekStart.getDate() + (semana - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const formatDate = (d: Date) => d.toLocaleDateString("pt-BR");

  function loadExistingWeek(num: number) {
    const existing = data.semanas.find((s) => s.semana === num);
    if (existing) {
      const loaded: Record<string, CanalData> = {};
      for (const c of data.config.canais) {
        loaded[c] = existing.canais[c] || emptyCanalData();
      }
      setCanais(loaded);
    } else {
      const obj: Record<string, CanalData> = {};
      for (const c of data.config.canais) obj[c] = emptyCanalData();
      setCanais(obj);
    }
  }

  function updateCanal(canal: string, field: keyof CanalData, value: number) {
    setCanais((prev) => ({
      ...prev,
      [canal]: { ...prev[canal], [field]: value },
    }));
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const ws = new Date(startDate);
      ws.setDate(ws.getDate() + (semana - 1) * 7);
      const we = new Date(ws);
      we.setDate(we.getDate() + 6);

      const body = {
        semana,
        inicio: ws.toISOString().split("T")[0],
        fim: we.toISOString().split("T")[0],
        canais,
      };

      const res = await fetch("/api/metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setMessage({ type: "success", text: `Semana ${semana} salva com sucesso!` });
        onSaved();
      } else {
        setMessage({ type: "error", text: "Erro ao salvar. Tente novamente." });
      }
    } catch {
      setMessage({ type: "error", text: "Erro de conexão." });
    }
    setSaving(false);
  }

  const inputClass = "w-full rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#e94560]";
  const inputStyle = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" };

  const fields: { key: keyof CanalData; label: string; prefix?: string; suffix?: string }[] = [
    { key: "investimento", label: "Investimento", prefix: "R$" },
    { key: "leads", label: "Leads" },
    { key: "vendas", label: "Vendas" },
    { key: "valorVendas", label: "Valor das Vendas", prefix: "R$" },
    { key: "leadsQualificados", label: "Leads Qualificados" },
    { key: "comparecimentos", label: "Comparecimentos" },
    { key: "slaRespostaMin", label: "SLA Resposta", suffix: "min" },
  ];

  return (
    <div className="space-y-6">
      {/* Seletor de semana */}
      <div className="kpi-card">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <label className="text-xs font-semibold uppercase tracking-wider block mb-2" style={{ color: "#64748b" }}>
              Semana
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={78}
                value={semana}
                onChange={(e) => {
                  const num = parseInt(e.target.value) || 1;
                  setSemana(num);
                  loadExistingWeek(num);
                }}
                className={inputClass}
                style={{ ...inputStyle, maxWidth: 100 }}
              />
              <span className="text-sm" style={{ color: "#94a3b8" }}>
                {formatDate(weekStart)} — {formatDate(weekEnd)}
              </span>
            </div>
          </div>
          <div>
            {data.semanas.length > 0 && (
              <p className="text-xs" style={{ color: "#64748b" }}>
                {data.semanas.length} semana(s) cadastrada(s)
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Formulário por canal */}
      <div className="space-y-3">
        {data.config.canais.map((canal) => {
          const isExpanded = expandedCanal === canal;
          return (
            <div key={canal} className="kpi-card">
              <button
                onClick={() => setExpandedCanal(isExpanded ? null : canal)}
                className="w-full flex items-center justify-between"
              >
                <span className="text-sm font-bold" style={{ color: "#e2e8f0" }}>{canal}</span>
                {isExpanded ? <ChevronDown size={16} style={{ color: "#64748b" }} /> : <ChevronRight size={16} style={{ color: "#64748b" }} />}
              </button>

              {isExpanded && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-4">
                  {fields.map((f) => (
                    <div key={f.key}>
                      <label className="text-xs block mb-1" style={{ color: "#64748b" }}>
                        {f.label}
                      </label>
                      <div className="relative">
                        {f.prefix && (
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: "#64748b" }}>{f.prefix}</span>
                        )}
                        <input
                          type="number"
                          min={0}
                          step={f.key === "investimento" || f.key === "valorVendas" ? 0.01 : 1}
                          value={canais[canal]?.[f.key] || ""}
                          onChange={(e) => updateCanal(canal, f.key, parseFloat(e.target.value) || 0)}
                          className={inputClass}
                          style={{ ...inputStyle, paddingLeft: f.prefix ? "2.2rem" : undefined, paddingRight: f.suffix ? "2.5rem" : undefined }}
                          placeholder="0"
                        />
                        {f.suffix && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: "#64748b" }}>{f.suffix}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Botão salvar */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all hover:scale-105 disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #e94560, #c23152)", color: "white" }}
        >
          <Save size={16} />
          {saving ? "Salvando..." : `Salvar Semana ${semana}`}
        </button>

        {message && (
          <div className="flex items-center gap-2">
            {message.type === "success" ? (
              <CheckCircle size={16} style={{ color: "#10b981" }} />
            ) : (
              <AlertCircle size={16} style={{ color: "#e94560" }} />
            )}
            <span className="text-sm" style={{ color: message.type === "success" ? "#10b981" : "#e94560" }}>
              {message.text}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
