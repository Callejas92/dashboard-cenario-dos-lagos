"use client";

import { useEffect, useMemo, useState } from "react";
import { Award, CheckCircle2, Clock, AlertCircle, Search, Download, RefreshCw, DollarSign, XCircle } from "lucide-react";
import KPICard from "./KPICard";

type BonusStatus =
  | "aguardando_entrada"
  | "a_pagar"
  | "pago_parcial"
  | "pago_total"
  | "revisar"
  | "cancelado_pago";

interface BonusPagamento {
  pagoCorretora: boolean;
  dataPagoCorretora: string;
  pagoImobiliaria: boolean;
  dataPagoImobiliaria: string;
  observacao?: string;
}

interface BonusEntry {
  chaveVenda: string;
  loteId: string;
  bloco: string;
  unidade: string;
  valorContratado: number;
  corretorNome: string;
  corretorCpf: string;
  corretorCreci: string;
  imobiliariaRazaoSocial: string;
  imobiliariaNomeFantasia: string;
  imobiliariaCnpj: string;
  entradaQtdTotal: number;
  entradaQtdPaga: number;
  entradaValorTotal: number;
  entradaValorPago: number;
  entradaQuitada: boolean;
  valorCorretora: number;
  valorImobiliaria: number;
  valorTotal: number;
  status: BonusStatus;
  pagamento: BonusPagamento;
  cancelado: boolean;
  contratoStatus: string;
  clienteNome: string;
}

interface BonusSummary {
  qtdValidas: number;
  qtdAguardandoEntrada: number;
  qtdAPagar: number;
  qtdPagoTotal: number;
  qtdPagoParcial: number;
  qtdRevisar: number;
  qtdCancelado: number;
  comprometidoTotal: number;
  aPagarAgora: number;
  pagoTotal: number;
  aguardandoEntrada: number;
  pendenteRevisar: number;
}

interface BonusResponse {
  bonus: BonusEntry[];
  summary: BonusSummary;
  fetchedAt: string;
}

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
}

function formatCompact(v: number) {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(1)}k`;
  return formatBRL(v);
}

const STATUS_LABELS: Record<BonusStatus, { label: string; color: string; bg: string }> = {
  a_pagar:           { label: "A pagar agora",      color: "#10b981", bg: "#10b98115" },
  pago_parcial:      { label: "Pago parcial",       color: "#f59e0b", bg: "#f59e0b15" },
  pago_total:        { label: "Pago total",         color: "#6b7280", bg: "#6b728015" },
  aguardando_entrada:{ label: "Aguardando entrada", color: "#4285f4", bg: "#4285f415" },
  revisar:           { label: "⚠ Revisar",          color: "#e94560", bg: "#e9456015" },
  cancelado_pago:    { label: "Cancelado (já pago)",color: "#ef4444", bg: "#ef444415" },
};

export default function TabBonus() {
  const [data, setData] = useState<BonusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<BonusStatus | "all">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/bonus");
      const j = await res.json();
      if (j.error) setError(j.error);
      else setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const markPagamento = async (chaveVenda: string, patch: Partial<BonusPagamento>) => {
    setUpdating(chaveVenda);
    try {
      await fetch("/api/bonus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark", chaveVenda, patch }),
      });
      // Recarrega tudo pra refletir nova classificação de status
      await load();
    } catch (e) {
      console.error(e);
    } finally {
      setUpdating(null);
    }
  };

  const filtered = useMemo(() => {
    if (!data) return [];
    const term = searchTerm.toLowerCase().trim();
    return data.bonus.filter((b) => {
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (term) {
        const hay = `${b.loteId} ${b.corretorNome} ${b.imobiliariaRazaoSocial} ${b.imobiliariaNomeFantasia} ${b.clienteNome}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [data, statusFilter, searchTerm]);

  const exportCSV = () => {
    if (!data) return;
    const headers = [
      "Lote", "Cliente", "Corretor", "CRECI", "Imobiliária", "CNPJ",
      "Valor Contrato", "Entrada Paga", "Entrada Total",
      "Status", "Bônus Corretora (R$)", "Pago Corret.", "Data Corret.",
      "Bônus Imob. (R$)", "Pago Imob.", "Data Imob.",
    ];
    const rows = filtered.map((b) => [
      b.loteId, b.clienteNome, b.corretorNome, b.corretorCreci,
      b.imobiliariaRazaoSocial, b.imobiliariaCnpj,
      b.valorContratado.toFixed(2),
      `${b.entradaQtdPaga}/${b.entradaQtdTotal}`,
      b.entradaValorTotal.toFixed(2),
      STATUS_LABELS[b.status].label,
      b.valorCorretora.toFixed(2),
      b.pagamento.pagoCorretora ? "SIM" : "NAO",
      b.pagamento.dataPagoCorretora,
      b.valorImobiliaria.toFixed(2),
      b.pagamento.pagoImobiliaria ? "SIM" : "NAO",
      b.pagamento.dataPagoImobiliaria,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bonus-corretores-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !data) {
    return (
      <div className="kpi-card flex items-center gap-2 py-12 justify-center">
        <RefreshCw size={16} className="animate-spin" />
        <span style={{ color: "var(--text-dim)" }}>Carregando bônus...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="kpi-card">
        <p style={{ color: "#e94560" }}>Erro: {error}</p>
        <button onClick={load} className="mt-3 px-3 py-1.5 text-xs rounded-md" style={{ background: "var(--primary)", color: "white" }}>
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!data) return null;

  const s = data.summary;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Award size={18} style={{ color: "#10b981" }} />
        <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>Bônus de Corretores e Imobiliárias</h3>
        <span className="text-xs" style={{ color: "var(--text-dim)", marginLeft: "auto" }}>
          R$ {3000} corretora + R$ {1000} imobiliária por venda · libera após entrada quitada
        </span>
        <button onClick={load} className="text-xs flex items-center gap-1 px-2 py-1 rounded" style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}>
          <RefreshCw size={12} /> atualizar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard
          label="A Pagar Agora"
          value={formatCompact(s.aPagarAgora)}
          icon={<DollarSign size={14} style={{ color: "#10b981" }} />}
          status="good"
        />
        <KPICard
          label="Pago"
          value={formatCompact(s.pagoTotal)}
          icon={<CheckCircle2 size={14} style={{ color: "#6b7280" }} />}
        />
        <KPICard
          label="Aguardando Entrada"
          value={formatCompact(s.aguardandoEntrada)}
          icon={<Clock size={14} style={{ color: "#4285f4" }} />}
        />
        <KPICard
          label="Revisar Manual"
          value={String(s.qtdRevisar)}
          icon={<AlertCircle size={14} style={{ color: "#e94560" }} />}
          status={s.qtdRevisar > 0 ? "neutral" : undefined}
        />
        <KPICard
          label="Comprometido Total"
          value={formatCompact(s.comprometidoTotal)}
          icon={<Award size={14} style={{ color: "#8b5cf6" }} />}
        />
      </div>

      {/* Filtros */}
      <div className="kpi-card">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <Search size={14} style={{ color: "var(--text-dim)" }} />
            <input
              type="text"
              placeholder="Buscar por lote, corretor, imobiliária, cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 bg-transparent border-0 outline-none text-sm"
              style={{ color: "var(--text)" }}
            />
          </div>

          <div className="flex flex-wrap gap-1">
            <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")} label={`Todos (${data.bonus.length})`} />
            <FilterChip active={statusFilter === "a_pagar"} onClick={() => setStatusFilter("a_pagar")} label={`A pagar (${s.qtdAPagar})`} color="#10b981" />
            <FilterChip active={statusFilter === "pago_parcial"} onClick={() => setStatusFilter("pago_parcial")} label={`Parcial (${s.qtdPagoParcial})`} color="#f59e0b" />
            <FilterChip active={statusFilter === "pago_total"} onClick={() => setStatusFilter("pago_total")} label={`Pago (${s.qtdPagoTotal})`} color="#6b7280" />
            <FilterChip active={statusFilter === "aguardando_entrada"} onClick={() => setStatusFilter("aguardando_entrada")} label={`Aguardando (${s.qtdAguardandoEntrada})`} color="#4285f4" />
            <FilterChip active={statusFilter === "revisar"} onClick={() => setStatusFilter("revisar")} label={`Revisar (${s.qtdRevisar})`} color="#e94560" />
          </div>

          <button onClick={exportCSV} className="text-xs flex items-center gap-1 px-2 py-1 rounded" style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}>
            <Download size={12} /> CSV
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="kpi-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>Lote</th>
              <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>Corretor</th>
              <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>Imobiliária</th>
              <th className="text-right py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>Contrato</th>
              <th className="text-center py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>Entrada</th>
              <th className="text-center py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>Status</th>
              <th className="text-center py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>Corretora R$3k</th>
              <th className="text-center py-2 px-2 font-semibold" style={{ color: "var(--text-dim)" }}>Imobiliária R$1k</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="py-6 text-center" style={{ color: "var(--text-dim)" }}>Nenhum bônus com esses filtros</td></tr>
            )}
            {filtered.map((b) => {
              const stColor = STATUS_LABELS[b.status];
              const podePagar = b.entradaQuitada && !!b.corretorNome;
              return (
                <tr key={b.chaveVenda} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="py-2 px-2 font-semibold" style={{ color: "var(--text)" }}>
                    {b.loteId}
                    {b.cancelado && (
                      <div style={{ fontSize: "0.65rem", color: "#ef4444", marginTop: "0.125rem" }}>cancelado</div>
                    )}
                  </td>
                  <td className="py-2 px-2" style={{ color: "var(--text)" }}>
                    {b.corretorNome ? (
                      <>
                        <div className="text-xs">{b.corretorNome.slice(0, 30)}</div>
                        {b.corretorCreci && <div style={{ fontSize: "0.65rem", color: "var(--text-dim)" }}>CRECI {b.corretorCreci}</div>}
                      </>
                    ) : (
                      <span style={{ color: "#e94560", fontStyle: "italic" }}>(sem corretor)</span>
                    )}
                  </td>
                  <td className="py-2 px-2" style={{ color: "var(--text-muted)" }}>
                    <div className="text-xs">{(b.imobiliariaNomeFantasia || b.imobiliariaRazaoSocial).slice(0, 25)}</div>
                  </td>
                  <td className="py-2 px-2 text-right" style={{ color: "var(--text)" }}>
                    {formatCompact(b.valorContratado)}
                  </td>
                  <td className="py-2 px-2 text-center" style={{ color: "var(--text)" }}>
                    {b.entradaQtdTotal === 0 ? (
                      <span style={{ fontSize: "0.7rem", color: "var(--text-dim)", fontStyle: "italic" }}>sem dados UAU</span>
                    ) : (
                      <>
                        <div className="font-semibold">{b.entradaQtdPaga}/{b.entradaQtdTotal}</div>
                        <div style={{ fontSize: "0.65rem", color: "var(--text-dim)" }}>
                          {formatCompact(b.entradaValorPago)} / {formatCompact(b.entradaValorTotal)}
                        </div>
                      </>
                    )}
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span style={{
                      fontSize: "0.65rem", fontWeight: 700,
                      padding: "0.15rem 0.5rem", borderRadius: "9999px",
                      background: stColor.bg, color: stColor.color,
                    }}>
                      {stColor.label}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-center">
                    <PagamentoToggle
                      pago={b.pagamento.pagoCorretora}
                      data={b.pagamento.dataPagoCorretora}
                      podeMarcar={podePagar || b.pagamento.pagoCorretora}
                      updating={updating === b.chaveVenda}
                      onToggle={(novoPago, novaData) => markPagamento(b.chaveVenda, { pagoCorretora: novoPago, dataPagoCorretora: novaData })}
                    />
                  </td>
                  <td className="py-2 px-2 text-center">
                    <PagamentoToggle
                      pago={b.pagamento.pagoImobiliaria}
                      data={b.pagamento.dataPagoImobiliaria}
                      podeMarcar={(podePagar && !!b.imobiliariaRazaoSocial) || b.pagamento.pagoImobiliaria}
                      updating={updating === b.chaveVenda}
                      onToggle={(novoPago, novaData) => markPagamento(b.chaveVenda, { pagoImobiliaria: novoPago, dataPagoImobiliaria: novaData })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────
function FilterChip({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color?: string }) {
  const c = color || "var(--text-muted)";
  return (
    <button
      onClick={onClick}
      className="text-xs px-2 py-1 rounded transition-colors"
      style={{
        background: active ? `${c}25` : "transparent",
        border: `1px solid ${active ? c : "var(--border)"}`,
        color: active ? c : "var(--text-muted)",
        fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </button>
  );
}

function PagamentoToggle({
  pago, data, podeMarcar, updating, onToggle,
}: {
  pago: boolean;
  data: string;
  podeMarcar: boolean;
  updating: boolean;
  onToggle: (pago: boolean, data: string) => void;
}) {
  const [editingDate, setEditingDate] = useState(false);
  const [tempDate, setTempDate] = useState(data || new Date().toISOString().split("T")[0]);

  if (updating) {
    return <RefreshCw size={12} className="animate-spin inline" style={{ color: "var(--text-dim)" }} />;
  }

  if (pago) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <div className="flex items-center gap-1">
          <CheckCircle2 size={14} style={{ color: "#10b981" }} />
          <span style={{ fontSize: "0.7rem", color: "#10b981", fontWeight: 600 }}>Pago</span>
          <button
            onClick={() => onToggle(false, "")}
            title="Desmarcar"
            style={{ color: "var(--text-dim)", padding: "0.125rem" }}
          >
            <XCircle size={11} />
          </button>
        </div>
        {data && <span style={{ fontSize: "0.65rem", color: "var(--text-dim)" }}>{data}</span>}
      </div>
    );
  }

  if (!podeMarcar) {
    return <span style={{ fontSize: "0.65rem", color: "var(--text-dim)" }}>—</span>;
  }

  if (editingDate) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="date"
          value={tempDate}
          onChange={(e) => setTempDate(e.target.value)}
          className="text-xs px-1 py-0.5 rounded"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
        <button
          onClick={() => { onToggle(true, tempDate); setEditingDate(false); }}
          className="text-xs px-2 py-0.5 rounded"
          style={{ background: "#10b981", color: "white", fontWeight: 600 }}
        >
          OK
        </button>
        <button
          onClick={() => setEditingDate(false)}
          className="text-xs px-1 py-0.5"
          style={{ color: "var(--text-dim)" }}
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditingDate(true)}
      className="text-xs px-2 py-1 rounded"
      style={{
        background: "transparent",
        border: "1px dashed var(--border)",
        color: "var(--text-muted)",
      }}
    >
      Marcar pago
    </button>
  );
}
