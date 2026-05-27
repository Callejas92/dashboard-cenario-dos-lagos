"use client";

/**
 * Linha 4 do Panorama — saúde do marketing (4 KPIs médios).
 *
 *  1. CAC do mês comercial vs alvo (R$ 9.874)
 *  2. Investimento do mês vs budget mensal
 *  3. Leads do mês (CRM Eggs)
 *  4. Top campanha do mês (placeholder por enquanto)
 */
import useSWR from "swr";
import { Megaphone, DollarSign, Users, TrendingUp } from "lucide-react";
import KpiMedium from "@/components/shared/KpiMedium";
import { SkeletonCard } from "@/components/shared/Skeleton";
import { buildKey } from "@/lib/cache/tabCache";
import { PROJETO } from "@/lib/constants/projeto";
import { calcularCac } from "@/lib/calculations/cac";
import { corMetaInversa, corMeta } from "@/lib/utils/cores";
import { formatBRLCompact, formatInt } from "@/lib/utils/formatters";
import { getMesComercialAtual } from "@/lib/utils/mesComercial";

interface CanaisResp {
  kpis?: { totalLeads?: number; totalInvestimento?: number; totalVendas?: number };
  canais?: Record<string, { investimento?: number; leads?: number; vendas?: number }>;
}

const BUDGET_MENSAL = PROJETO.BUDGET_MKT_TOTAL / PROJETO.PRAZO_COMERCIALIZACAO_MESES;

export default function SaudeMarketing() {
  const mc = getMesComercialAtual();
  const key = buildKey("/api/canais", { from: mc.inicioISO, to: mc.fimISO });

  const { data, isLoading } = useSWR<CanaisResp>(key);

  if (isLoading) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0.75rem" }}>
        <SkeletonCard height={100} />
        <SkeletonCard height={100} />
        <SkeletonCard height={100} />
        <SkeletonCard height={100} />
      </div>
    );
  }

  const totalInvestimento = data?.kpis?.totalInvestimento ?? 0;
  const totalVendas = data?.kpis?.totalVendas ?? 0;
  const totalLeads = data?.kpis?.totalLeads ?? 0;

  const cac = calcularCac({ investimentoTotal: totalInvestimento, qtdVendas: totalVendas });

  // Top canal por investimento no mês (excluindo Comissão Corretor — que não é canal de aquisição)
  const canais = data?.canais || {};
  const topCanal = Object.entries(canais)
    .filter(([nome]) => nome !== "Comissão Corretor")
    .map(([nome, c]) => ({ nome, inv: c.investimento ?? 0, leads: c.leads ?? 0 }))
    .sort((a, b) => b.inv - a.inv)[0];

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "0.75rem",
        padding: "1rem 1.25rem",
      }}
    >
      <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.875rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <Megaphone size={12} />
        <span>Saúde do Marketing · {mc.labelCurto}</span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: "0.75rem",
        }}
      >
        <KpiMedium
          label="CAC do mês"
          valor={cac.valor > 0 ? formatBRLCompact(cac.valor) : "—"}
          severidade={cac.severidade}
          formula={`${cac.formula}\nMeta máxima: ${formatBRLCompact(cac.meta)}`}
          contexto={`alvo ≤ ${formatBRLCompact(cac.meta)}`}
          icon={<TrendingUp size={11} style={{ color: "var(--text-dim)" }} />}
        />

        <KpiMedium
          label="Investimento do mês"
          valor={formatBRLCompact(totalInvestimento)}
          severidade={corMetaInversa(totalInvestimento, BUDGET_MENSAL * 1.2)}
          formula={`Soma de gastos em todos os canais no período ${mc.label}.\nBudget mensal alvo: ${formatBRLCompact(BUDGET_MENSAL)} (= R$ 1,72M ÷ 15 meses).`}
          contexto={`budget ${formatBRLCompact(BUDGET_MENSAL)}/mês`}
          icon={<DollarSign size={11} style={{ color: "var(--text-dim)" }} />}
        />

        <KpiMedium
          label="Leads do mês"
          valor={formatInt(totalLeads)}
          severidade={corMeta(totalLeads, 100)}
          formula={`Leads registrados no CRM Eggs com created_at dentro de ${mc.label}.`}
          contexto={`${totalVendas} venda${totalVendas === 1 ? "" : "s"} no mesmo período`}
          icon={<Users size={11} style={{ color: "var(--text-dim)" }} />}
        />

        <KpiMedium
          label="Top canal"
          valor={topCanal ? topCanal.nome : "—"}
          severidade="cinza"
          formula={topCanal ? `Canal com maior investimento neste mês comercial.\n${topCanal.nome}: ${formatBRLCompact(topCanal.inv)} investido, ${topCanal.leads} leads.` : "Sem dados ainda neste período."}
          contexto={topCanal ? `${formatBRLCompact(topCanal.inv)} · ${topCanal.leads} leads` : undefined}
          icon={<Megaphone size={11} style={{ color: "var(--text-dim)" }} />}
        />
      </div>
    </div>
  );
}
