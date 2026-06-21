"use client";

/**
 * Estrutura de custo — o que se gasta, em português claro, sem fingir atribuição.
 *
 * Duas caixas: marketing (queima tendo venda ou não) vs canal (comissão 6,5% + bônus, só
 * paga na venda). Sem "ROI 60x": no modelo de canal não dá pra saber qual canal vendeu.
 */
import useSWR from "swr";
import { Wallet } from "lucide-react";
import LoadingCard from "@/components/shared/LoadingCard";
import { formatBRLCompact } from "@/lib/utils/formatters";
import { COMISSAO_TOTAL_PCT } from "@/lib/constants/negocio";
import { isVenda } from "@/lib/constants/projeto";

interface MktResp {
  resumoPorGrupo?: { grupo: string; totalGasto: number }[];
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

  const caixa = (titulo: string, sub: string, valor: number | null) => (
    <div style={{ background: "var(--bg-secondary, rgba(127,127,127,0.04))", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.8rem 0.9rem" }}>
      <div style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>{titulo}</div>
      <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text)", lineHeight: 1.1, marginTop: "0.1rem" }}>{fmt(valor)}<span style={{ fontSize: "0.72rem", color: "var(--text-dim)", fontWeight: 400 }}>/lote</span></div>
      <div style={{ fontSize: "0.66rem", color: "var(--text-dim)", marginTop: "0.1rem" }}>{sub}</div>
    </div>
  );

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
      <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.875rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <Wallet size={12} />
        <span>Custo por lote vendido</span>
        <span style={{ marginLeft: "auto", fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>o que gasta, sem inventar atribuição</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem", marginBottom: "1rem" }}>
        {caixa("Marketing", "queima tendo venda ou não", cacRiscoLote)}
        {caixa("Canal", "comissão 6,5% + bônus · só paga na venda", custoCanalLote)}
      </div>

      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.4rem" }}>
        Onde foi o marketing: <strong style={{ color: "var(--text)" }}>{fmt(marketingRisco)}</strong>
        {budget != null && <> de {fmt(budget)} ({Math.round((marketingRisco ?? 0) / budget * 100)}% do orçamento)</>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
        {grupos.length === 0 && <div style={{ fontSize: "0.74rem", color: "var(--text-dim)", fontStyle: "italic" }}>carregando gastos…</div>}
        {grupos.slice(0, 7).map((g) => (
          <div key={g.grupo} style={{ display: "grid", gridTemplateColumns: "minmax(110px,1.3fr) 2fr auto", gap: "0.5rem", alignItems: "center", fontSize: "0.72rem" }}>
            <span style={{ color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.grupo.replace(/^\d+\.\s*/, "")}</span>
            <div style={{ background: "var(--bg-secondary, rgba(127,127,127,0.06))", borderRadius: "0.25rem", overflow: "hidden", height: 13 }}>
              <div style={{ width: `${(g.totalGasto / maxGasto) * 100}%`, height: "100%", background: "#3b82f6" }} />
            </div>
            <span style={{ color: "var(--text)", fontWeight: 600, whiteSpace: "nowrap" }}>{formatBRLCompact(g.totalGasto)}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: "0.75rem", padding: "0.5rem 0.75rem", background: "var(--bg-secondary, rgba(127,127,127,0.05))", borderRadius: "0.375rem", fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
        O <strong style={{ color: "var(--text)" }}>canal</strong> é o maior custo, mas só sai do bolso <strong style={{ color: "var(--text)" }}>quando vende</strong>. Não mostro &quot;ROI&quot;: no modelo de canal <strong style={{ color: "var(--text)" }}>não dá pra saber qual canal vendeu</strong> (o corretor não reporta origem), então um número de ROI enganaria.
      </div>
    </div>
  );
}
