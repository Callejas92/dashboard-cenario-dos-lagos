"use client";

import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { TrendingUp, RefreshCw, Calendar } from "lucide-react";

interface LancamentoOffline {
  canal: string;
  valor: number;
  mes: string;
  data_pgto: string;
  inicio_veic: string;
  fim_veic: string;
  descricao: string;
}

interface TimelineLeadsAcoesProps {
  startDate: string;
  endDate: string;
}

const CANAL_COLORS: Record<string, string> = {
  Outdoor: "#f4a236",
  Rádio: "#8b5cf6",
  Jornal: "#e94560",
  Evento: "#ec4899",
  Outros: "#6b7280",
};

function formatBRL(n: number): string {
  if (n >= 1000) return `R$ ${(n / 1000).toFixed(1)}k`;
  return `R$ ${n.toFixed(0)}`;
}

export default function TimelineLeadsAcoes({ startDate, endDate }: TimelineLeadsAcoesProps) {
  const [leadsPorDia, setLeadsPorDia] = useState<{ data: string; qtd: number }[]>([]);
  const [acoes, setAcoes] = useState<LancamentoOffline[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [crmRes, custosRes] = await Promise.all([
          fetch("/api/crm"),
          fetch("/api/custos-offline"),
        ]);
        const crmData = await crmRes.json();
        const custosData = await custosRes.json();

        // Filtra leads por período
        const porDia: { data: string; qtd: number }[] = (crmData.porDia || [])
          .filter((d: { data: string }) => d.data >= startDate && d.data <= endDate);

        // Filtra ações offline com data_pgto OU inicio_veic dentro do período
        const acoesFiltered: LancamentoOffline[] = (custosData.lancamentos || [])
          .filter((l: LancamentoOffline) => {
            const dataMarker = l.data_pgto || l.inicio_veic;
            return dataMarker && dataMarker >= startDate && dataMarker <= endDate;
          });

        setLeadsPorDia(porDia);
        setAcoes(acoesFiltered);
      } catch (err) {
        console.error("Timeline error:", err);
      }
      setLoading(false);
    };

    fetchAll();
  }, [startDate, endDate]);

  // Construir todos os dias do período (mesmo sem leads)
  const allDays: { data: string; qtd: number; dataLabel: string }[] = [];
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  const leadsMap = new Map(leadsPorDia.map((d) => [d.data, d.qtd]));

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().split("T")[0];
    allDays.push({
      data: key,
      qtd: leadsMap.get(key) ?? 0,
      dataLabel: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    });
  }

  // Agrupar ações por data (pra evitar bandeiras sobrepostas)
  const acoesPorData = new Map<string, LancamentoOffline[]>();
  for (const a of acoes) {
    const key = a.data_pgto || a.inicio_veic;
    if (!key) continue;
    const arr = acoesPorData.get(key) || [];
    arr.push(a);
    acoesPorData.set(key, arr);
  }

  if (loading) {
    return (
      <div className="kpi-card flex items-center gap-2 py-6 justify-center">
        <RefreshCw size={16} className="animate-spin" />
        <span style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Carregando timeline...</span>
      </div>
    );
  }

  const totalLeads = allDays.reduce((s, d) => s + d.qtd, 0);
  const semAcoes = acoes.length === 0;

  return (
    <div className="kpi-card">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} style={{ color: "#10b981" }} />
          <h3 className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>
            TIMELINE — AÇÕES × LEADS
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
            <strong style={{ color: "var(--text)" }}>{totalLeads}</strong> leads
          </span>
          <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
            <strong style={{ color: "var(--text)" }}>{acoes.length}</strong> ações marcadas
          </span>
        </div>
      </div>
      <p className="text-xs mb-4" style={{ color: "var(--text-dim)" }}>
        Linha = leads novos por dia. Bandeiras verticais = quando houve gasto offline (Outdoor, Rádio, etc).
        Veja se leads sobem após cada ação.
      </p>

      {semAcoes && (
        <div style={{
          marginBottom: "0.75rem", padding: "0.5rem 0.75rem",
          background: "var(--surface)", border: "1px dashed var(--border)",
          borderRadius: "0.375rem", fontSize: "0.7rem",
          color: "var(--text-dim)",
          display: "flex", alignItems: "center", gap: "0.5rem",
        }}>
          <Calendar size={12} />
          <span>
            Nenhuma ação offline com data registrada nesse período. Para aparecer no timeline,
            preencha <strong>Data Pgto</strong> ou <strong>Início Veic.</strong> na aba GASTOS do Excel.
          </span>
        </div>
      )}

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={allDays} margin={{ top: 30, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="dataLabel" tick={{ fill: "var(--text-dim)", fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fill: "var(--text-dim)", fontSize: 10 }} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--border)", borderRadius: "0.5rem", fontSize: "0.75rem" }}
            labelFormatter={(_, p) => {
              const payload = p[0]?.payload as { data?: string } | undefined;
              if (!payload?.data) return "";
              const acoesNoDia = acoesPorData.get(payload.data) || [];
              const dataFmt = new Date(payload.data + "T00:00:00").toLocaleDateString("pt-BR");
              if (acoesNoDia.length === 0) return dataFmt;
              return `${dataFmt} 🚩 ${acoesNoDia.map((a) => `${a.canal} ${formatBRL(a.valor)}`).join(", ")}`;
            }}
            formatter={(v) => [v, "Leads"]}
          />

          {/* Bandeiras verticais para cada ação */}
          {Array.from(acoesPorData.entries()).map(([data, acs]) => {
            const totalDia = acs.reduce((s, a) => s + a.valor, 0);
            const canalPrincipal = acs[0].canal;
            const cor = CANAL_COLORS[canalPrincipal] || "#6b7280";
            const dataLabel = new Date(data + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
            const label = acs.length === 1
              ? `${canalPrincipal} ${formatBRL(totalDia)}`
              : `${acs.length} ações ${formatBRL(totalDia)}`;
            return (
              <ReferenceLine
                key={data}
                x={dataLabel}
                stroke={cor}
                strokeDasharray="4 4"
                strokeWidth={2}
                label={{
                  value: label,
                  position: "top",
                  fill: cor,
                  fontSize: 10,
                  fontWeight: 600,
                }}
              />
            );
          })}

          <Line
            type="monotone"
            dataKey="qtd"
            stroke="#10b981"
            strokeWidth={2.5}
            dot={{ fill: "#10b981", r: 3 }}
            activeDot={{ r: 5 }}
            name="Leads"
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Legenda das ações */}
      {acoes.length > 0 && (
        <div className="mt-4">
          <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-dim)", marginBottom: "0.5rem" }}>
            AÇÕES NO PERÍODO ({acoes.length}):
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from(acoesPorData.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([data, acs]) => {
              const cor = CANAL_COLORS[acs[0].canal] || "#6b7280";
              return (
                <div
                  key={data}
                  style={{
                    padding: "0.375rem 0.625rem",
                    background: cor + "15", border: `1px solid ${cor}40`,
                    borderRadius: "0.375rem",
                    fontSize: "0.7rem",
                  }}
                >
                  <span style={{ color: cor, fontWeight: 700 }}>
                    {new Date(data + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                  </span>
                  <span style={{ color: "var(--text)", marginLeft: "0.375rem" }}>
                    {acs.map((a) => `${a.canal} R$ ${a.valor.toLocaleString("pt-BR")}`).join(" + ")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
