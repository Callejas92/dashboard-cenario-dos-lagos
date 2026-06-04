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
import { DollarSign, Wallet, FileSpreadsheet } from "lucide-react";
import KpiMedium from "@/components/shared/KpiMedium";
import { SkeletonCard } from "@/components/shared/Skeleton";
import { buildKey } from "@/lib/cache/tabCache";
import { PROJETO } from "@/lib/constants/projeto";
import { corMetaInversa } from "@/lib/utils/cores";
import { formatBRLCompact, formatPct } from "@/lib/utils/formatters";
import { calcularVgv } from "@/lib/calculations/vgv";
import { getMesComercialAtual } from "@/lib/utils/mesComercial";

interface CanaisResp {
  kpis?: { totalInvestimento?: number };
  canais?: Record<string, { investimento?: number }>;
}
interface MktResp {
  totalRealizado?: number;
  fetchedAt?: string;
}
interface CrmContratosResp {
  contratos?: { loteId: string; valor: number; status: string; cancelado: boolean }[];
}

const BUDGET_MENSAL = PROJETO.BUDGET_MKT_TOTAL / PROJETO.PRAZO_COMERCIALIZACAO_MESES;

export default function SaudeMarketing() {
  const mc = getMesComercialAtual();
  const keyCanais = buildKey("/api/canais", { from: mc.inicioISO, to: mc.fimISO });

  const { data: canais, isLoading: lC } = useSWR<CanaisResp>(keyCanais);
  const { data: mkt, isLoading: lM } = useSWR<MktResp>("/api/marketing-offline?view=summary");
  const { data: crm, isLoading: lCrm } = useSWR<CrmContratosResp>("/api/crm/contratos");

  if (lC || lM || lCrm) {
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

  // Detalhamento de onde vem o investimento do mês — pra tooltip explicativo
  const inv = {
    metaAds:    canais?.canais?.["Meta Ads"]?.investimento ?? 0,
    googleAds:  canais?.canais?.["Google Ads"]?.investimento ?? 0,
    whatsapp:   canais?.canais?.["WhatsApp"]?.investimento ?? 0,
    outdoor:    canais?.canais?.["Outdoor"]?.investimento ?? 0,
    radio:      canais?.canais?.["Rádio"]?.investimento ?? 0,
    jornal:     canais?.canais?.["Jornal"]?.investimento ?? 0,
    evento:    (canais?.canais?.["Evento"]?.investimento ?? 0),
    outros:    (canais?.canais?.["Outros"]?.investimento ?? 0) + (canais?.canais?.["Site"]?.investimento ?? 0),
    comissao:   canais?.canais?.["Comissão Corretor"]?.investimento ?? 0,
  };
  const formulaMes = [
    `Soma de gastos em todos os canais no período ${mc.label}.`,
    "",
    "Fontes:",
    `· APIs em tempo real: Meta Ads (${formatBRLCompact(inv.metaAds)}), Google Ads (${formatBRLCompact(inv.googleAds)}), WhatsApp (${formatBRLCompact(inv.whatsapp)})`,
    `· Cenario_Marketing.xlsx aba GASTOS: Outdoor (${formatBRLCompact(inv.outdoor)}), Rádio (${formatBRLCompact(inv.radio)}), Jornal (${formatBRLCompact(inv.jornal)}), Evento (${formatBRLCompact(inv.evento)}), Outros (${formatBRLCompact(inv.outros)})`,
    `· Bônus pagos (Vercel Blob): ${formatBRLCompact(inv.comissao)}`,
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
