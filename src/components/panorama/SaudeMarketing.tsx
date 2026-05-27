"use client";

/**
 * Linha 4 do Panorama — investimento de marketing.
 *
 * Conforme feedback do Felipe: NÃO mostrar CAC nem Leads aqui (atribuição
 * lead→venda não existe na prática). Só foco em INVESTIMENTO vs BUDGET.
 *
 * Detalhamento (canais, campanhas, leads) fica na aba Marketing (Fase 4).
 *
 * Fontes:
 *  - Investimento do mês: /api/canais (offline do Cenario_Marketing.xlsx + Meta/Google APIs)
 *  - Budget total/mensal alvo: constantes derivadas de PROJETO (aba PREMISSAS do Excel)
 *  - Realizado acumulado: /api/marketing-offline (aba GASTOS)
 */
import useSWR from "swr";
import { DollarSign, Wallet } from "lucide-react";
import KpiMedium from "@/components/shared/KpiMedium";
import { SkeletonCard } from "@/components/shared/Skeleton";
import { buildKey } from "@/lib/cache/tabCache";
import { PROJETO } from "@/lib/constants/projeto";
import { corMetaInversa } from "@/lib/utils/cores";
import { formatBRLCompact, formatPct } from "@/lib/utils/formatters";
import { getMesComercialAtual } from "@/lib/utils/mesComercial";

interface CanaisResp {
  kpis?: { totalInvestimento?: number };
}
interface MktResp {
  totalRealizado?: number;
}

const BUDGET_MENSAL = PROJETO.BUDGET_MKT_TOTAL / PROJETO.PRAZO_COMERCIALIZACAO_MESES;

export default function SaudeMarketing() {
  const mc = getMesComercialAtual();
  const keyCanais = buildKey("/api/canais", { from: mc.inicioISO, to: mc.fimISO });

  const { data: canais, isLoading: lC } = useSWR<CanaisResp>(keyCanais);
  const { data: mkt, isLoading: lM } = useSWR<MktResp>("/api/marketing-offline?view=summary");

  if (lC || lM) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
        <SkeletonCard height={100} />
        <SkeletonCard height={100} />
      </div>
    );
  }

  const investimentoMes = canais?.kpis?.totalInvestimento ?? 0;
  const realizadoAcumulado = mkt?.totalRealizado ?? 0;
  const pctBudgetConsumido = realizadoAcumulado / PROJETO.BUDGET_MKT_TOTAL;

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "0.75rem",
        padding: "1rem 1.25rem",
      }}
    >
      <div
        style={{
          fontSize: "0.75rem",
          color: "var(--text-dim)",
          fontWeight: 700,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          marginBottom: "0.875rem",
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
        }}
      >
        <Wallet size={12} />
        <span>Investimento de Marketing</span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: "0.7rem",
            color: "var(--text-dim)",
            fontWeight: 400,
            textTransform: "none",
            letterSpacing: 0,
          }}
        >
          detalhes na aba <a href="/marketing" style={{ color: "var(--text-muted)", textDecoration: "underline" }}>Marketing</a>
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "0.75rem",
        }}
      >
        <KpiMedium
          label={`Investido em ${mc.labelCurto}`}
          valor={formatBRLCompact(investimentoMes)}
          severidade={corMetaInversa(investimentoMes, BUDGET_MENSAL * 1.2)}
          formula={`Soma de gastos em TODOS os canais no período ${mc.label}.\nInclui mídia digital (Meta/Google), offline do Excel (Outdoor/Rádio/etc), comissões e eventos.\nBudget mensal alvo: ${formatBRLCompact(BUDGET_MENSAL)} (R$ 1,72M ÷ 15 meses).`}
          contexto={`alvo ${formatBRLCompact(BUDGET_MENSAL)}/mês`}
          icon={<DollarSign size={11} style={{ color: "var(--text-dim)" }} />}
        />

        <KpiMedium
          label="Budget total consumido"
          valor={formatPct(pctBudgetConsumido)}
          severidade={corMetaInversa(pctBudgetConsumido, 1)}
          formula={`Realizado acumulado desde o lançamento (aba GASTOS do Cenario_Marketing.xlsx) ÷ Budget total.\nRealizado: ${formatBRLCompact(realizadoAcumulado)}\nBudget total: ${formatBRLCompact(PROJETO.BUDGET_MKT_TOTAL)} (2% do VGV inicial)`}
          contexto={`${formatBRLCompact(realizadoAcumulado)} de ${formatBRLCompact(PROJETO.BUDGET_MKT_TOTAL)}`}
          icon={<Wallet size={11} style={{ color: "var(--text-dim)" }} />}
        />
      </div>
    </div>
  );
}
