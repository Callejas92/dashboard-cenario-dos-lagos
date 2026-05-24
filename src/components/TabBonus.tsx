"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Award, CheckCircle2, Clock, AlertCircle, Search, Download, RefreshCw,
  DollarSign, XCircle, ChevronDown, ChevronRight, User, Building2,
} from "lucide-react";
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

const STATUS_INFO: Record<BonusStatus, { label: string; color: string; bg: string; emoji: string; ordem: number; expandedDefault: boolean }> = {
  a_pagar:            { label: "A PAGAR AGORA",       color: "#10b981", bg: "#10b98115", emoji: "🟢", ordem: 0, expandedDefault: true },
  pago_parcial:       { label: "PAGO PARCIAL",        color: "#f59e0b", bg: "#f59e0b15", emoji: "🟡", ordem: 1, expandedDefault: true },
  revisar:            { label: "⚠ REVISAR MANUAL",    color: "#e94560", bg: "#e9456015", emoji: "🔴", ordem: 2, expandedDefault: true },
  aguardando_entrada: { label: "AGUARDANDO ENTRADA",  color: "#4285f4", bg: "#4285f415", emoji: "🔵", ordem: 3, expandedDefault: false },
  pago_total:         { label: "JÁ PAGO",             color: "#6b7280", bg: "#6b728015", emoji: "⚪", ordem: 4, expandedDefault: false },
  cancelado_pago:     { label: "CANCELADO (JÁ PAGO)", color: "#ef4444", bg: "#ef444415", emoji: "❌", ordem: 5, expandedDefault: false },
};

export default function TabBonus() {
  const [data, setData] = useState<BonusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<BonusStatus>>(new Set());

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/bonus");
      const j = await res.json();
      if (j.error) setError(j.error);
      else {
        setData(j);
        // Inicializa colapsados conforme expandedDefault
        const initial = new Set<BonusStatus>();
        for (const [status, info] of Object.entries(STATUS_INFO)) {
          if (!info.expandedDefault) initial.add(status as BonusStatus);
        }
        setCollapsedGroups(initial);
      }
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
      await load();
    } catch (e) {
      console.error(e);
    } finally {
      setUpdating(null);
    }
  };

  const toggleGroup = (status: BonusStatus) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  // Filtra por busca textual
  const filtered = useMemo(() => {
    if (!data) return [];
    const term = searchTerm.toLowerCase().trim();
    return data.bonus.filter((b) => {
      if (!term) return true;
      const hay = `${b.loteId} ${b.corretorNome} ${b.imobiliariaRazaoSocial} ${b.imobiliariaNomeFantasia} ${b.clienteNome}`.toLowerCase();
      return hay.includes(term);
    });
  }, [data, searchTerm]);

  // Agrupa por status
  const grouped = useMemo(() => {
    const groups = new Map<BonusStatus, BonusEntry[]>();
    for (const b of filtered) {
      const arr = groups.get(b.status) || [];
      arr.push(b);
      groups.set(b.status, arr);
    }
    return Array.from(groups.entries()).sort(
      ([a], [b]) => STATUS_INFO[a].ordem - STATUS_INFO[b].ordem
    );
  }, [filtered]);

  const exportCSV = () => {
    if (!data) return;
    const headers = [
      "Lote", "Cliente", "Corretor", "CRECI", "Imobiliária", "CNPJ",
      "Valor Contrato", "Entrada Paga (qtd)", "Entrada Total (qtd)",
      "Entrada Valor Pago", "Entrada Valor Total", "% Entrada Pago",
      "Status", "Bônus Corretora (R$)", "Pago Corret.", "Data Corret.",
      "Bônus Imob. (R$)", "Pago Imob.", "Data Imob.",
    ];
    const rows = filtered.map((b) => [
      b.loteId, b.clienteNome, b.corretorNome, b.corretorCreci,
      b.imobiliariaRazaoSocial, b.imobiliariaCnpj,
      b.valorContratado.toFixed(2),
      b.entradaQtdPaga, b.entradaQtdTotal,
      b.entradaValorPago.toFixed(2), b.entradaValorTotal.toFixed(2),
      b.entradaValorTotal > 0 ? ((b.entradaValorPago / b.entradaValorTotal) * 100).toFixed(1) + "%" : "—",
      STATUS_INFO[b.status].label,
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
      <div className="flex items-center gap-3 flex-wrap">
        <Award size={18} style={{ color: "#10b981" }} />
        <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>Bônus de Corretores e Imobiliárias</h3>
        <span className="text-xs" style={{ color: "var(--text-dim)", marginLeft: "auto" }}>
          R$ 3k corretora + R$ 1k imobiliária por venda · libera após entrada quitada
        </span>
        <button onClick={load} className="text-xs flex items-center gap-1 px-2 py-1 rounded" style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}>
          <RefreshCw size={12} /> atualizar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard label="A Pagar Agora" value={formatCompact(s.aPagarAgora)} icon={<DollarSign size={14} style={{ color: "#10b981" }} />} status="good" />
        <KPICard label="Pago" value={formatCompact(s.pagoTotal)} icon={<CheckCircle2 size={14} style={{ color: "#6b7280" }} />} />
        <KPICard label="Aguardando Entrada" value={formatCompact(s.aguardandoEntrada)} icon={<Clock size={14} style={{ color: "#4285f4" }} />} />
        <KPICard label="Revisar Manual" value={String(s.qtdRevisar)} icon={<AlertCircle size={14} style={{ color: "#e94560" }} />} status={s.qtdRevisar > 0 ? "neutral" : undefined} />
        <KPICard label="Comprometido Total" value={formatCompact(s.comprometidoTotal)} icon={<Award size={14} style={{ color: "#8b5cf6" }} />} />
      </div>

      {/* Filtro de busca + export */}
      <div className="kpi-card">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <Search size={14} style={{ color: "var(--text-dim)" }} />
            <input
              type="text"
              placeholder="Buscar por lote, cliente, corretor, imobiliária..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 bg-transparent border-0 outline-none text-sm"
              style={{ color: "var(--text)" }}
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} style={{ color: "var(--text-dim)" }}>×</button>
            )}
          </div>
          <button onClick={exportCSV} className="text-xs flex items-center gap-1 px-3 py-1.5 rounded" style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}>
            <Download size={12} /> Exportar CSV
          </button>
        </div>
        {searchTerm && (
          <div className="text-xs mt-2" style={{ color: "var(--text-dim)" }}>
            {filtered.length} resultado{filtered.length !== 1 ? "s" : ""} para "{searchTerm}"
          </div>
        )}
      </div>

      {/* Grupos por status */}
      {grouped.length === 0 && (
        <div className="kpi-card py-8 text-center" style={{ color: "var(--text-dim)" }}>
          Nenhum bônus encontrado com esse filtro
        </div>
      )}

      {grouped.map(([status, items]) => {
        const info = STATUS_INFO[status];
        const collapsed = collapsedGroups.has(status);
        return (
          <div key={status} className="kpi-card" style={{ padding: 0, overflow: "hidden" }}>
            {/* Header colapsável */}
            <button
              onClick={() => toggleGroup(status)}
              className="w-full flex items-center gap-3 px-4 py-3"
              style={{
                background: info.bg,
                borderLeft: `4px solid ${info.color}`,
                borderBottom: collapsed ? "none" : `1px solid var(--border)`,
              }}
            >
              {collapsed ? <ChevronRight size={16} style={{ color: info.color }} /> : <ChevronDown size={16} style={{ color: info.color }} />}
              <span style={{ fontSize: "0.8rem", fontWeight: 700, color: info.color, letterSpacing: "0.05em" }}>
                {info.label}
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: "auto" }}>
                {items.length} venda{items.length > 1 ? "s" : ""} · R$ {items.reduce((sum, it) => sum + it.valorTotal, 0).toLocaleString("pt-BR")}
              </span>
            </button>

            {/* Lista de cards */}
            {!collapsed && (
              <div className="space-y-2 p-3">
                {items.map((b) => (
                  <BonusRow
                    key={b.chaveVenda}
                    bonus={b}
                    updating={updating === b.chaveVenda}
                    onToggle={markPagamento}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Linha (card) de bônus ────────────────────────────────────────────────
function BonusRow({
  bonus, updating, onToggle,
}: {
  bonus: BonusEntry;
  updating: boolean;
  onToggle: (chaveVenda: string, patch: Partial<BonusPagamento>) => void;
}) {
  const pctEntrada = bonus.entradaValorTotal > 0
    ? Math.min(100, (bonus.entradaValorPago / bonus.entradaValorTotal) * 100)
    : (bonus.entradaQtdTotal === 0 ? 100 : 0); // sem parcelas configuradas = 100% (nada a pagar)
  const semDadosUAU = bonus.entradaQtdTotal === 0 && bonus.entradaValorTotal === 0;
  const podePagar = bonus.entradaQuitada && !!bonus.corretorNome;

  return (
    <div
      style={{
        padding: "0.75rem 1rem",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "0.5rem",
        display: "grid",
        gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1.5fr) minmax(0,2fr) minmax(0,2.4fr)",
        gap: "1rem",
        alignItems: "center",
      }}
    >
      {/* Coluna 1: Lote + valor contrato */}
      <div>
        <div className="flex items-center gap-2">
          <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text)" }}>{bonus.loteId}</span>
          {bonus.cancelado && (
            <span style={{ fontSize: "0.6rem", color: "#ef4444", padding: "0.1rem 0.3rem", background: "#ef444415", borderRadius: "0.25rem", fontWeight: 600 }}>
              cancelado
            </span>
          )}
        </div>
        <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginTop: "0.125rem" }}>
          contrato {formatCompact(bonus.valorContratado)}
        </div>
      </div>

      {/* Coluna 2: Cliente */}
      <div>
        <div className="flex items-start gap-1" style={{ minWidth: 0 }}>
          <User size={11} style={{ color: "#10b981", flexShrink: 0, marginTop: "0.15rem" }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "0.8rem", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {bonus.clienteNome || <span style={{ color: "var(--text-dim)", fontStyle: "italic" }}>(sem nome)</span>}
            </div>
            <div style={{ fontSize: "0.65rem", color: "var(--text-dim)" }}>
              {bonus.contratoStatus}
            </div>
          </div>
        </div>
      </div>

      {/* Coluna 3: Corretor + Imobiliária */}
      <div style={{ minWidth: 0 }}>
        <div className="flex items-center gap-1" style={{ minWidth: 0 }}>
          <Award size={11} style={{ color: "#8b5cf6", flexShrink: 0 }} />
          <span style={{ fontSize: "0.75rem", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {bonus.corretorNome || <span style={{ color: "#e94560", fontStyle: "italic" }}>(sem corretor)</span>}
          </span>
          {bonus.corretorCreci && (
            <span style={{ fontSize: "0.6rem", color: "var(--text-dim)", flexShrink: 0 }}>CRECI {bonus.corretorCreci}</span>
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5" style={{ minWidth: 0 }}>
          <Building2 size={10} style={{ color: "var(--text-dim)", flexShrink: 0 }} />
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {bonus.imobiliariaNomeFantasia || bonus.imobiliariaRazaoSocial || "—"}
          </span>
        </div>
      </div>

      {/* Coluna 4: Entrada + ações */}
      <div>
        {/* Barra de progresso */}
        <div style={{ marginBottom: "0.5rem" }}>
          <div className="flex justify-between items-center" style={{ fontSize: "0.65rem", marginBottom: "0.2rem" }}>
            <span style={{ color: "var(--text-dim)", fontWeight: 600 }}>
              ENTRADA {semDadosUAU ? "(sem dados UAU)" : ""}
            </span>
            {!semDadosUAU && (
              <span style={{ color: bonus.entradaQuitada ? "#10b981" : "var(--text-muted)", fontWeight: 700 }}>
                {pctEntrada.toFixed(0)}%
              </span>
            )}
          </div>
          {semDadosUAU ? (
            <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", fontStyle: "italic" }}>
              venda Eggs sem parcelas no UAU
            </div>
          ) : (
            <>
              <div style={{ height: "6px", background: "var(--border)", borderRadius: "9999px", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${pctEntrada}%`,
                    background: bonus.entradaQuitada ? "#10b981" : "#4285f4",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", marginTop: "0.2rem" }}>
                {bonus.entradaQtdPaga}/{bonus.entradaQtdTotal} pagas · {formatCompact(bonus.entradaValorPago)} de {formatCompact(bonus.entradaValorTotal)}
                {bonus.entradaQuitada
                  ? <span style={{ color: "#10b981", fontWeight: 600, marginLeft: "0.3rem" }}>✓ quitada</span>
                  : <span style={{ color: "#f59e0b", fontWeight: 600, marginLeft: "0.3rem" }}>falta {formatCompact(bonus.entradaValorTotal - bonus.entradaValorPago)}</span>}
              </div>
            </>
          )}
        </div>

        {/* Botões de pagamento */}
        <div className="flex gap-2">
          <PagamentoButton
            label="Corretora"
            valor={bonus.valorCorretora}
            pago={bonus.pagamento.pagoCorretora}
            data={bonus.pagamento.dataPagoCorretora}
            podePagar={podePagar || bonus.pagamento.pagoCorretora}
            updating={updating}
            onConfirm={(pago, data) => onToggle(bonus.chaveVenda, { pagoCorretora: pago, dataPagoCorretora: data })}
          />
          <PagamentoButton
            label="Imobiliária"
            valor={bonus.valorImobiliaria}
            pago={bonus.pagamento.pagoImobiliaria}
            data={bonus.pagamento.dataPagoImobiliaria}
            podePagar={(podePagar && !!bonus.imobiliariaRazaoSocial) || bonus.pagamento.pagoImobiliaria}
            updating={updating}
            onConfirm={(pago, data) => onToggle(bonus.chaveVenda, { pagoImobiliaria: pago, dataPagoImobiliaria: data })}
          />
        </div>
      </div>
    </div>
  );
}

// ── Botão grande de pagamento ────────────────────────────────────────────
function PagamentoButton({
  label, valor, pago, data, podePagar, updating, onConfirm,
}: {
  label: string;
  valor: number;
  pago: boolean;
  data: string;
  podePagar: boolean;
  updating: boolean;
  onConfirm: (pago: boolean, data: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [tempDate, setTempDate] = useState(data || new Date().toISOString().split("T")[0]);

  if (updating) {
    return (
      <div className="flex items-center justify-center" style={{ flex: 1, padding: "0.5rem", border: "1px solid var(--border)", borderRadius: "0.375rem" }}>
        <RefreshCw size={12} className="animate-spin" style={{ color: "var(--text-dim)" }} />
      </div>
    );
  }

  // Estado: PAGO
  if (pago) {
    return (
      <div
        style={{
          flex: 1,
          padding: "0.4rem 0.6rem",
          border: "1px solid #10b98140",
          background: "#10b98110",
          borderRadius: "0.375rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.3rem",
          minWidth: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", minWidth: 0 }}>
          <CheckCircle2 size={12} style={{ color: "#10b981", flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "0.65rem", color: "#10b981", fontWeight: 700, lineHeight: 1.1 }}>
              {label} PAGO
            </div>
            {data && <div style={{ fontSize: "0.6rem", color: "var(--text-dim)" }}>em {data}</div>}
          </div>
        </div>
        <button
          onClick={() => onConfirm(false, "")}
          title="Desmarcar pagamento"
          style={{ padding: "0.1rem", color: "var(--text-dim)", flexShrink: 0 }}
        >
          <XCircle size={12} />
        </button>
      </div>
    );
  }

  // Estado: NÃO PODE PAGAR (aguardando entrada)
  if (!podePagar) {
    return (
      <div
        style={{
          flex: 1,
          padding: "0.4rem 0.6rem",
          border: "1px dashed var(--border)",
          borderRadius: "0.375rem",
          textAlign: "center",
          fontSize: "0.65rem",
          color: "var(--text-dim)",
          fontStyle: "italic",
        }}
      >
        {label} · aguardando
      </div>
    );
  }

  // Estado: EDITANDO DATA
  if (editing) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          gap: "0.3rem",
          padding: "0.25rem 0.4rem",
          border: "2px solid #10b981",
          borderRadius: "0.375rem",
          background: "var(--surface)",
        }}
      >
        <input
          type="date"
          value={tempDate}
          onChange={(e) => setTempDate(e.target.value)}
          className="text-xs"
          style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, outline: "none", color: "var(--text)" }}
          autoFocus
        />
        <button
          onClick={() => { onConfirm(true, tempDate); setEditing(false); }}
          style={{
            padding: "0.2rem 0.5rem", background: "#10b981", color: "white",
            fontSize: "0.65rem", fontWeight: 700, borderRadius: "0.25rem", flexShrink: 0,
          }}
        >
          OK
        </button>
        <button onClick={() => setEditing(false)} style={{ color: "var(--text-dim)", padding: "0.1rem", flexShrink: 0 }}>
          ×
        </button>
      </div>
    );
  }

  // Estado: BOTÃO GRANDE VERDE PRA PAGAR
  return (
    <button
      onClick={() => setEditing(true)}
      style={{
        flex: 1,
        padding: "0.5rem 0.6rem",
        background: "#10b981",
        color: "white",
        borderRadius: "0.375rem",
        fontSize: "0.7rem",
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.3rem",
        boxShadow: "0 2px 6px rgba(16,185,129,0.25)",
        transition: "transform 0.1s ease, box-shadow 0.1s ease",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.boxShadow = "0 4px 10px rgba(16,185,129,0.35)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 2px 6px rgba(16,185,129,0.25)";
      }}
    >
      <DollarSign size={12} />
      PAGAR {formatCompact(valor)} {label.toUpperCase()}
    </button>
  );
}
