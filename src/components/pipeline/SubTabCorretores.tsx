"use client";

/**
 * Sub-tab Pipeline > Performance Corretor.
 *
 *  - EXCLUI Eggs Gestão (não é corretor PF)
 *  - Tabela: Corretor, CRECI, Lotes, VGV, Última venda, Status (ativo/parado >30d)
 *  - Gráfico de barras horizontais por VGV (1 cor)
 *  - Alerta visual se algum corretor >40% das vendas
 *  - Ordenado por VGV descendente
 */
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Users, AlertTriangle, ArrowUpDown } from "lucide-react";
import KpiSmall from "@/components/shared/KpiSmall";
import { SkeletonCard } from "@/components/shared/Skeleton";
import LoadingCard from "@/components/shared/LoadingCard";
import { formatBRLCompact, formatInt, formatData, formatTempoRelativo, truncate } from "@/lib/utils/formatters";
import CorretorDrawer from "./CorretorDrawer";

interface Contrato {
  loteId: string; valor: number; cancelado: boolean;
  corretor: { nome: string; creci: string };
  imobiliaria: { razaoSocial: string };
  dataContrato?: string;
}
interface CrmContratosResp { contratos?: Contrato[] }

const NOMES_IMOBILIARIA = ["EGGS", "GESTÃO", "GESTAO", "INTELIGENCIA EM VENDAS"];
function isImobiliaria(nome: string): boolean {
  const upper = (nome || "").toUpperCase();
  return NOMES_IMOBILIARIA.some((n) => upper.includes(n));
}

interface LinhaCorretor {
  nome: string;
  creci: string;
  imobiliaria: string;
  lotes: number;
  vgv: number;
  pctVGV: number;
  ultimaVenda: string;
  ativoUltimos30d: boolean;
}

type SortField = "vgv" | "lotes" | "ultima" | "nome";

export default function SubTabCorretores() {
  const { data, isLoading } = useSWR<CrmContratosResp>("/api/crm/contratos");
  const { data: bonusData } = useSWR<{ bonus?: { loteId: string; entradaQuitada: boolean; valorTotal: number }[] }>("/api/bonus");
  const [sortField, setSortField] = useState<SortField>("vgv");
  const [sortAsc, setSortAsc] = useState(false);
  const [drawerCorretor, setDrawerCorretor] = useState<string | null>(null);

  const linhas = useMemo(() => {
    const contratos = (data?.contratos || []).filter((c) => !c.cancelado);
    const corretoresPF = contratos.filter((c) => c.corretor?.nome && !isImobiliaria(c.corretor.nome));

    const totalVGV = corretoresPF.reduce((s, c) => s + (c.valor || 0), 0);

    const map = new Map<string, LinhaCorretor>();
    for (const c of corretoresPF) {
      const nome = c.corretor.nome;
      let l = map.get(nome);
      if (!l) {
        l = {
          nome,
          creci: c.corretor.creci || "",
          imobiliaria: c.imobiliaria?.razaoSocial || "",
          lotes: 0, vgv: 0, pctVGV: 0,
          ultimaVenda: "",
          ativoUltimos30d: false,
        };
        map.set(nome, l);
      }
      l.lotes++;
      l.vgv += c.valor || 0;
      if (c.dataContrato && c.dataContrato > l.ultimaVenda) {
        l.ultimaVenda = c.dataContrato;
      }
    }

    // Calcula pct VGV + ativo
    const hoje = Date.now();
    const trinta = 30 * 24 * 60 * 60 * 1000;
    for (const l of map.values()) {
      l.pctVGV = totalVGV > 0 ? l.vgv / totalVGV : 0;
      if (l.ultimaVenda) {
        const t = new Date(l.ultimaVenda + "T12:00:00").getTime();
        l.ativoUltimos30d = Number.isFinite(t) && (hoje - t) <= trinta;
      }
    }

    return Array.from(map.values());
  }, [data]);

  const linhasOrdenadas = useMemo(() => {
    const arr = [...linhas];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "vgv":    cmp = a.vgv - b.vgv; break;
        case "lotes":  cmp = a.lotes - b.lotes; break;
        case "ultima": cmp = a.ultimaVenda.localeCompare(b.ultimaVenda); break;
        case "nome":   cmp = a.nome.localeCompare(b.nome); break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return arr;
  }, [linhas, sortField, sortAsc]);

  // Alerta concentração
  const top = linhasOrdenadas[0];
  const totalLotes = linhas.reduce((s, l) => s + l.lotes, 0);
  const concentracao = top && totalLotes > 0 ? top.lotes / totalLotes : 0;
  const ativos = linhas.filter((l) => l.ativoUltimos30d).length;

  function toggleSort(field: SortField) {
    if (sortField === field) setSortAsc((v) => !v);
    else { setSortField(field); setSortAsc(false); }
  }

  if (isLoading || !data) return <LoadingCard height={400} label="Carregando corretores" hint="CRM Eggs pode demorar até 15s" />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* KPIs topo */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.625rem" }}>
        <KpiSmall
          label="Corretores PF"
          valor={String(linhas.length)}
          contexto={`${ativos} ativos últimos 30d`}
          icon={<Users size={11} style={{ color: "var(--text-dim)" }} />}
          formula="Total de corretores PF únicos com pelo menos 1 contrato. Eggs Gestão (imobiliária) excluída."
        />
        <KpiSmall
          label="Total lotes vendidos"
          valor={formatInt(totalLotes)}
          contexto={`por ${linhas.length} corretor${linhas.length === 1 ? "" : "es"}`}
          formula="Soma de contratos não-cancelados de corretores PF."
        />
        <KpiSmall
          label="VGV gerado (PF)"
          valor={formatBRLCompact(linhas.reduce((s, l) => s + l.vgv, 0))}
          formula="Soma do valor contratado de todos os contratos de corretores PF."
        />
        {top && (
          <KpiSmall
            label="Top corretor"
            valor={truncate(top.nome, 18)}
            severidade={concentracao >= 0.4 ? "vermelho" : concentracao >= 0.3 ? "amarelo" : "cinza"}
            contexto={`${(concentracao * 100).toFixed(0)}% das vendas`}
            formula="Corretor com mais lotes vendidos. Alerta se ≥40% (concentração de risco)."
          />
        )}
      </div>

      {/* Alerta concentração */}
      {top && concentracao >= 0.4 && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: "0.75rem",
          padding: "0.75rem 1rem",
          background: concentracao >= 0.6 ? "#dc262615" : "#f59e0b15",
          borderLeft: `4px solid ${concentracao >= 0.6 ? "#dc2626" : "#f59e0b"}`,
          borderRadius: "0.5rem",
        }}>
          <AlertTriangle size={16} style={{ color: concentracao >= 0.6 ? "#dc2626" : "#f59e0b", flexShrink: 0, marginTop: "0.125rem" }} />
          <div style={{ fontSize: "0.825rem" }}>
            <strong style={{ color: concentracao >= 0.6 ? "#dc2626" : "#f59e0b" }}>
              {top.nome}
            </strong>{" "}
            concentra <strong>{(concentracao * 100).toFixed(0)}%</strong> das vendas
            ({top.lotes} de {totalLotes} lotes).
            {concentracao >= 0.6 ? " Risco alto — diversificar urgente." : " Considere diversificar a carteira."}
          </div>
        </div>
      )}

      {/* Gráfico de barras horizontais */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
        <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.75rem" }}>
          VGV gerado por corretor
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {linhasOrdenadas.slice(0, 12).map((l) => {
            const max = linhasOrdenadas[0]?.vgv || 1;
            const pct = (l.vgv / max) * 100;
            return (
              <div key={l.nome} style={{ display: "grid", gridTemplateColumns: "minmax(160px, 200px) 1fr 80px", gap: "0.625rem", alignItems: "center" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text)", textAlign: "right" }}>
                  {truncate(l.nome, 22)}
                </div>
                <div aria-hidden style={{ height: "16px", background: "var(--border)", borderRadius: "0.25rem", overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${pct}%`,
                    background: "#10b981",
                    transition: "width 0.3s ease",
                  }} />
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>
                  {formatBRLCompact(l.vgv)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabela completa */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem", overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: "0.8rem", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--text-dim)", fontSize: "0.7rem", textTransform: "uppercase", fontWeight: 600 }}>
              <SortableTh field="nome" current={sortField} asc={sortAsc} onClick={toggleSort}>Corretor</SortableTh>
              <th style={{ padding: "0.5rem 0.25rem" }}>CRECI</th>
              <th style={{ padding: "0.5rem 0.25rem" }}>Imobiliária</th>
              <SortableTh field="lotes" current={sortField} asc={sortAsc} onClick={toggleSort} align="right">Lotes</SortableTh>
              <SortableTh field="vgv" current={sortField} asc={sortAsc} onClick={toggleSort} align="right">VGV</SortableTh>
              <SortableTh field="ultima" current={sortField} asc={sortAsc} onClick={toggleSort}>Última venda</SortableTh>
              <th style={{ padding: "0.5rem 0.25rem", textAlign: "center" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {linhasOrdenadas.map((l) => (
              <tr key={l.nome} onClick={() => setDrawerCorretor(l.nome)} title="Ver scorecard / LTV do corretor" style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}>
                <td style={{ padding: "0.5rem 0.25rem", color: "var(--text)", fontWeight: 600 }}>{l.nome} <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>›</span></td>
                <td style={{ padding: "0.5rem 0.25rem", color: "var(--text-muted)", fontSize: "0.75rem" }}>{l.creci || "—"}</td>
                <td style={{ padding: "0.5rem 0.25rem", color: "var(--text-muted)", fontSize: "0.75rem" }}>{truncate(l.imobiliaria || "—", 22)}</td>
                <td style={{ padding: "0.5rem 0.25rem", textAlign: "right", color: "var(--text)" }}>{l.lotes}</td>
                <td style={{ padding: "0.5rem 0.25rem", textAlign: "right", color: "var(--text)", fontWeight: 600 }}>{formatBRLCompact(l.vgv)}</td>
                <td style={{ padding: "0.5rem 0.25rem", color: "var(--text-muted)", fontSize: "0.75rem" }}>
                  {l.ultimaVenda ? (
                    <span title={formatData(l.ultimaVenda)}>{formatTempoRelativo(l.ultimaVenda)}</span>
                  ) : "—"}
                </td>
                <td style={{ padding: "0.5rem 0.25rem", textAlign: "center" }}>
                  <span style={{
                    fontSize: "0.65rem", fontWeight: 700, padding: "0.15rem 0.5rem", borderRadius: "9999px",
                    background: l.ativoUltimos30d ? "#10b98115" : "#6b728015",
                    color: l.ativoUltimos30d ? "#10b981" : "#6b7280",
                  }}>
                    {l.ativoUltimos30d ? "ativo" : "parado"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {drawerCorretor ? (
        <CorretorDrawer
          corretorNome={drawerCorretor}
          contratos={data?.contratos || []}
          bonus={bonusData?.bonus || []}
          onClose={() => setDrawerCorretor(null)}
        />
      ) : null}
    </div>
  );
}

function SortableTh({
  field, current, asc, onClick, children, align,
}: {
  field: SortField;
  current: SortField;
  asc: boolean;
  onClick: (f: SortField) => void;
  children: React.ReactNode;
  align?: "right";
}) {
  const ativo = field === current;
  return (
    <th
      onClick={() => onClick(field)}
      style={{
        padding: "0.5rem 0.25rem",
        cursor: "pointer",
        textAlign: align || "left",
        color: ativo ? "var(--text)" : "var(--text-dim)",
        userSelect: "none",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
        {children}
        <ArrowUpDown size={9} style={{ opacity: ativo ? 1 : 0.4 }} />
        {ativo && <span style={{ fontSize: "0.6rem" }}>{asc ? "↑" : "↓"}</span>}
      </span>
    </th>
  );
}
