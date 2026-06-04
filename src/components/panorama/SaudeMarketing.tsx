"use client";

/**
 * Linha 4 do Panorama — investimento de marketing.
 *
 * Fonte ÚNICA do investimento: aba GASTOS do Cenario_Marketing.xlsx
 * (via /api/marketing-offline). O Excel já contém TODOS os gastos
 * (Meta Ads, Google Ads, offline, eventos), então NÃO misturamos APIs aqui
 * — evita dupla contagem e usa o ledger oficial do cliente.
 *
 * Fontes:
 *  - Investido no mês comercial: GASTOS com data no mês comercial atual
 *  - Realizado acumulado / Budget consumido: total de GASTOS ÷ budget (PREMISSAS)
 *  - CAC / ROI (blended, acumulado): marketing total ÷ lotes vendidos e VGV ÷ marketing
 */
import useSWR from "swr";
import { DollarSign, Wallet, FileSpreadsheet } from "lucide-react";
import KpiMedium from "@/components/shared/KpiMedium";
import { SkeletonCard } from "@/components/shared/Skeleton";
import { PROJETO } from "@/lib/constants/projeto";
import { corMetaInversa } from "@/lib/utils/cores";
import { formatBRLCompact, formatPct } from "@/lib/utils/formatters";
import { calcularVgv } from "@/lib/calculations/vgv";
import { getMesComercialAtual, dataNoMesComercial } from "@/lib/utils/mesComercial";

interface GastoMin {
  data: string;
  valor: number;
  natureza?: string;
  canalDashboard?: string;
}
interface MktResp {
  totalRealizado?: number;
  fetchedAt?: string;
  gastos?: GastoMin[];
}
interface CrmContratosResp {
  contratos?: { loteId: string; valor: number; status: string; cancelado: boolean }[];
}

const BUDGET_MENSAL = PROJETO.BUDGET_MKT_TOTAL / PROJETO.PRAZO_COMERCIALIZACAO_MESES;

export default function SaudeMarketing() {
  const mc = getMesComercialAtual();

  // Fonte ÚNICA do investimento: aba GASTOS do Excel (já tem Meta/Google/offline/eventos).
  const { data: mkt, isLoading: lM } = useSWR<MktResp>("/api/marketing-offline");
  const { data: crm, isLoading: lCrm } = useSWR<CrmContratosResp>("/api/crm/contratos");

  if (lM || lCrm) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
        <SkeletonCard height={100} />
        <SkeletonCard height={100} />
      </div>
    );
  }

  // Investido no mês = soma dos GASTOS do Excel com data no mês comercial atual.
  const gastos = mkt?.gastos ?? [];
  const gastosMes = gastos.filter((g) => g.data && dataNoMesComercial(g.data, mc));
  const investimentoMes = gastosMes.reduce((s, g) => s + (Number(g.valor) || 0), 0);
  const realizadoAcumulado = mkt?.totalRealizado ?? gastos.reduce((s, g) => s + (Number(g.valor) || 0), 0);
  const pctBudgetConsumido = realizadoAcumulado / PROJETO.BUDGET_MKT_TOTAL;

  // CAC e ROI acumulados (desde o lançamento), "blended" — sem depender de
  // atribuição lead->venda: CAC = marketing total / lotes vendidos;
  // ROI = VGV vendido / marketing total. Usa o mesmo calcularVgv da Linha 1
  // (consistente com o "VGV vendido" do topo do Panorama).
  const vgv = calcularVgv({
    contratos: (crm?.contratos || []).map((c) => ({
      loteId: c.loteId,
      valorContratado: c.valor,
      status: c.status,
      cancelado: c.cancelado,
    })),
  });
  const cac = vgv.lotesVendidos > 0 ? realizadoAcumulado / vgv.lotesVendidos : 0;
  const roi = realizadoAcumulado > 0 ? vgv.vgvVendido / realizadoAcumulado : 0;

  // Detalhamento por natureza (do Excel) — pra tooltip explicativo
  const porNatureza = new Map<string, number>();
  for (const g of gastosMes) {
    const n = g.natureza || g.canalDashboard || "Outros";
    porNatureza.set(n, (porNatureza.get(n) || 0) + (Number(g.valor) || 0));
  }
  const breakdownLinhas = Array.from(porNatureza.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([n, v]) => `· ${n}: ${formatBRLCompact(v)}`);
  const formulaMes = [
    `Soma dos GASTOS (aba GASTOS do Cenario_Marketing.xlsx) com data no mês comercial ${mc.label}.`,
    "",
    "Fonte ÚNICA: o Excel já inclui TUDO (Meta Ads, Google Ads, offline, eventos) — sem misturar APIs (evita dupla contagem).",
    "",
    `Por natureza (${gastosMes.length} lançamentos):`,
    ...breakdownLinhas,
    "",
    `Budget mensal alvo: ${formatBRLCompact(BUDGET_MENSAL)} (R$ 1,72M ÷ ${PROJETO.PRAZO_COMERCIALIZACAO_MESES} meses).`,
  ].join("\n");
  const formulaBudget = [
    `Realizado acumulado desde o lançamento ÷ Budget total.`,
    "",
    `Fonte do realizado: aba GASTOS do Cenario_Marketing.xlsx (todos os tipos).`,
    `Realizado: ${formatBRLCompact(realizadoAcumulado)}`,
    `Budget total: ${formatBRLCompact(PROJETO.BUDGET_MKT_TOTAL)} (2% do VGV inicial)`,
    `${mkt?.fetchedAt ? `\nÚltima sincronização Excel: ${new Date(mkt.fetchedAt).toLocaleString("pt-BR")}` : ""}`,
  ].join("\n");

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
          formula={formulaMes}
          contexto={`alvo ${formatBRLCompact(BUDGET_MENSAL)}/mês`}
          icon={<DollarSign size={11} style={{ color: "var(--text-dim)" }} />}
        />

        <KpiMedium
          label="Budget total consumido"
          valor={formatPct(pctBudgetConsumido)}
          severidade={corMetaInversa(pctBudgetConsumido, 1)}
          formula={formulaBudget}
          contexto={`${formatBRLCompact(realizadoAcumulado)} de ${formatBRLCompact(PROJETO.BUDGET_MKT_TOTAL)}`}
          icon={<FileSpreadsheet size={11} style={{ color: "var(--text-dim)" }} />}
        />

        <KpiMedium
          label="CAC (acumulado)"
          valor={vgv.lotesVendidos > 0 ? formatBRLCompact(cac) : "—"}
          formula={[
            "CAC blended = investimento total de marketing / lotes vendidos.",
            "Não depende de atribuição lead→venda (usa o total gasto e o total vendido).",
            "",
            `${formatBRLCompact(realizadoAcumulado)} / ${vgv.lotesVendidos} lotes = ${formatBRLCompact(cac)} por lote.`,
            "",
            "Marketing: aba GASTOS do Cenario_Marketing.xlsx (acumulado).",
            "Lotes vendidos: contratos ASSINADO/FATURADO/ENTREGUE (Eggs).",
          ].join("\n")}
          contexto={`${formatBRLCompact(realizadoAcumulado)} / ${vgv.lotesVendidos} lotes`}
          icon={<DollarSign size={11} style={{ color: "var(--text-dim)" }} />}
        />

        <KpiMedium
          label="ROI marketing (acumulado)"
          valor={realizadoAcumulado > 0 ? `${roi.toFixed(1)}x` : "—"}
          formula={[
            "ROI = VGV vendido / investimento total de marketing.",
            `${formatBRLCompact(vgv.vgvVendido)} / ${formatBRLCompact(realizadoAcumulado)} = ${roi.toFixed(1)}x.`,
            "",
            `Cada R$ 1 investido em marketing corresponde a ~R$ ${roi.toFixed(0)} em vendas (VGV).`,
            "",
            "VGV vendido: mesmo cálculo do KPI do topo (contratos vendidos).",
          ].join("\n")}
          contexto={`${formatBRLCompact(vgv.vgvVendido)} vendido`}
          icon={<DollarSign size={11} style={{ color: "var(--text-dim)" }} />}
        />
      </div>
    </div>
  );
}
