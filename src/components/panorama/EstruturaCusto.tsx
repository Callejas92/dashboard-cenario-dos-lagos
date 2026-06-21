"use client";

/**
 * Estrutura de custo — o que se gasta, SEM fingir atribuição.
 *
 * Separa o que o dashboard hoje mistura num "ROI 60x" enganoso:
 *  - CAC de marketing (RISCO): queima tendo venda ou não (a planilha GASTOS).
 *  - Custo de canal (SUCESSO): comissão 6,5% + bônus — só paga na venda.
 *  - ROI 60x: aposentado (credita todas as vendas ao marketing → não atribuível no modelo de canal).
 * Não há "CAC por canal": o corretor não reporta origem (ver Visibilidade digital).
 */
import useSWR from "swr";
import { Wallet } from "lucide-react";
import LoadingCard from "@/components/shared/LoadingCard";
import TooltipDefinicao from "@/components/shared/TooltipDefinicao";
import { formatBRLCompact } from "@/lib/utils/formatters";
import { COMISSAO_TOTAL_PCT } from "@/lib/constants/negocio";
import { isVenda } from "@/lib/constants/projeto";

interface MktResp {
  resumoPorGrupo?: { grupo: string; totalGasto: number; pctOrcamento: number }[];
  totalRealizado?: number;
  premissas?: { budgetMarketing?: number };
}
interface CrmResp { contratos?: { valor: number; status: string; cancelado: boolean }[] }
interface BonusResp { summary?: { comprometidoTotal?: number } }

const fmt = (v: number | null | undefined) => (v == null ? "…" : formatBRLCompact(v));

export default function EstruturaCusto() {
  const { data: mkt } = useSWR<MktResp>("/api/marketing-offline");
  const { data: crm } = useSWR<CrmResp>("/api/crm/contratos");
  const { data: bonus } = useSWR<BonusResp>("/api/bonus");

  if (!crm) return <LoadingCard height={220} label="Estrutura de custo" hint="lendo contratos + gastos..." />;

  const vendas = (crm.contratos || []).filter((c) => !c.cancelado && isVenda(c.status));
  const n = vendas.length;
  const vgv = vendas.reduce((s, c) => s + (c.valor || 0), 0);
  const comissao = vgv * COMISSAO_TOTAL_PCT;
  const bonusComp = bonus?.summary?.comprometidoTotal;
  const custoCanal = bonusComp != null ? comissao + bonusComp : null;

  const marketingRisco = mkt?.totalRealizado;
  const budget = mkt?.premissas?.budgetMarketing;
  const cacRiscoLote = marketingRisco != null && n > 0 ? marketingRisco / n : null;
  const custoCanalLote = custoCanal != null && n > 0 ? custoCanal / n : null;

  const grupos = mkt?.resumoPorGrupo || [];
  const maxGasto = Math.max(...grupos.map((g) => g.totalGasto), 1);

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
      <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.875rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <Wallet size={12} />
        <TooltipDefinicao texto={"Separa custo de RISCO (marketing, queima sempre) de custo de SUCESSO (canal: comissão 6,5% + bônus, só na venda). O 'ROI 60x' do dashboard credita todas as vendas ao marketing — no modelo de canal isso não é atribuível, então fica aposentado."}>
          <span>Estrutura de custo</span>
        </TooltipDefinicao>
        <span style={{ marginLeft: "auto", fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
          gasto real, sem atribuição inventada
        </span>
      </div>

      {/* 3 números honestos */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.6rem", marginBottom: "1rem" }}>
        <div style={{ background: "var(--bg-secondary, rgba(127,127,127,0.04))", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.7rem 0.85rem" }}>
          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>CAC marketing (risco)</div>
          <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--text)", lineHeight: 1.1 }}>{fmt(cacRiscoLote)}<span style={{ fontSize: "0.7rem", color: "var(--text-dim)", fontWeight: 400 }}>/lote</span></div>
          <div style={{ fontSize: "0.66rem", color: "var(--text-dim)" }}>queima com venda ou não · média (não por canal)</div>
        </div>
        <div style={{ background: "var(--bg-secondary, rgba(127,127,127,0.04))", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.7rem 0.85rem" }}>
          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Custo de canal</div>
          <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--text)", lineHeight: 1.1 }}>{fmt(custoCanalLote)}<span style={{ fontSize: "0.7rem", color: "var(--text-dim)", fontWeight: 400 }}>/lote</span></div>
          <div style={{ fontSize: "0.66rem", color: "var(--text-dim)" }}>comissão 6,5% + bônus · só paga na venda</div>
        </div>
        <div style={{ background: "var(--bg-secondary, rgba(127,127,127,0.04))", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.7rem 0.85rem", opacity: 0.75 }}>
          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>ROI 60x</div>
          <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--text-dim)", lineHeight: 1.1, textDecoration: "line-through" }}>60x</div>
          <div style={{ fontSize: "0.66rem", color: "#dc2626" }}>aposentado — não atribuível</div>
        </div>
      </div>

      {/* Composição do investido */}
      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.4rem" }}>
        Investido em marketing: <strong style={{ color: "var(--text)" }}>{fmt(marketingRisco)}</strong>
        {budget != null && <> de {fmt(budget)} ({Math.round((marketingRisco ?? 0) / budget * 100)}% do budget)</>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
        {grupos.length === 0 && <div style={{ fontSize: "0.74rem", color: "var(--text-dim)", fontStyle: "italic" }}>carregando gastos…</div>}
        {grupos.slice(0, 8).map((g) => {
          const pctReal = marketingRisco ? g.totalGasto / marketingRisco : 0;
          return (
            <div key={g.grupo} style={{ display: "grid", gridTemplateColumns: "minmax(120px,1.4fr) 2fr auto", gap: "0.5rem", alignItems: "center", fontSize: "0.72rem" }}>
              <span style={{ color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.grupo.replace(/^\d+\.\s*/, "")}</span>
              <div style={{ background: "var(--bg-secondary, rgba(127,127,127,0.06))", borderRadius: "0.25rem", overflow: "hidden", height: 13 }}>
                <div style={{ width: `${(g.totalGasto / maxGasto) * 100}%`, height: "100%", background: "#3b82f6" }} />
              </div>
              <span style={{ color: "var(--text)", fontWeight: 600, whiteSpace: "nowrap" }}>{formatBRLCompact(g.totalGasto)} <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>{Math.round(pctReal * 100)}%</span></span>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: "0.75rem", padding: "0.5rem 0.75rem", background: "var(--bg-secondary, rgba(127,127,127,0.05))", borderRadius: "0.375rem", fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
        O canal (comissão + bônus) é o maior custo, mas <strong style={{ color: "var(--text)" }}>só paga quando vende</strong>. O marketing de risco é menor e queima sempre — e <strong style={{ color: "var(--text)" }}>não dá pra dizer qual canal vendeu</strong> (o corretor não reporta origem).
      </div>
    </div>
  );
}
