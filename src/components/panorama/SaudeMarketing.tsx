"use client";

/**
 * Linha 4 do Panorama — investimento de marketing.
 *
 * Fonte ÚNICA: aba GASTOS do Cenario_Marketing.xlsx (via /api/marketing-offline).
 * O Excel já tem TODOS os gastos (Meta, Google, offline, eventos) — não misturamos
 * APIs aqui (evita dupla contagem). Mês = CIVIL (igual à VISÃO GASTOS do Excel),
 * usando o mês civil mais recente com lançamentos.
 *
 *  - Investido no mês: total de GASTOS do mês + quebra Mídia/Produção/Eventos/Outros
 *  - Budget consumido: total de GASTOS ÷ budget (PREMISSAS)
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

interface GastoMin {
  data: string;
  mes?: string;
  valor: number;
  grupoPlano?: string;
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

type Categoria = "Mídia" | "Produção" | "Eventos" | "Outros";
const CATEGORIAS: Categoria[] = ["Mídia", "Produção", "Eventos", "Outros"];

// Mapeia o grupoPlano do Excel nas 4 categorias da VISÃO GASTOS.
// (Influência/PR conta como Mídia; Reserva/Imprevistos como Outros — bate com a planilha.)
function categoria(grupoPlano?: string): Categoria {
  const s = (grupoPlano || "").toLowerCase();
  if (s.includes("mídia") || s.includes("midia") || s.includes("influ")) return "Mídia";
  if (s.includes("produção") || s.includes("producao")) return "Produção";
  if (s.includes("evento")) return "Eventos";
  return "Outros";
}

export default function SaudeMarketing() {
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

  const gastos = mkt?.gastos ?? [];

  // Mês civil mais recente COM lançamentos (avança sozinho quando entrar o próximo mês).
  const gastoRecente = gastos.reduce<GastoMin | null>(
    (a, b) => (a && a.data >= b.data ? a : b),
    null,
  );
  const mesLabel = gastoRecente?.mes ?? "—";
  const gastosMes = gastos.filter((g) => g.mes === mesLabel);
  const investimentoMes = gastosMes.reduce((s, g) => s + (Number(g.valor) || 0), 0);

  const realizadoAcumulado = mkt?.totalRealizado ?? gastos.reduce((s, g) => s + (Number(g.valor) || 0), 0);
  const pctBudgetConsumido = realizadoAcumulado / PROJETO.BUDGET_MKT_TOTAL;

  // Quebra por categoria (Mídia/Produção/Eventos/Outros) do mês — igual à VISÃO GASTOS.
  const porCategoria: Record<Categoria, number> = { "Mídia": 0, "Produção": 0, "Eventos": 0, "Outros": 0 };
  for (const g of gastosMes) porCategoria[categoria(g.grupoPlano)] += Number(g.valor) || 0;

  // CAC / ROI blended acumulados — sem depender de atribuição lead->venda.
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

  // Visão "mais real": inclui contratos ENVIADO PARA ASSINATURA (pipeline quente,
  // ainda não assinados). Mostrado como valor secundário (*) no CAC e no ROI.
  const emAssinatura = (crm?.contratos || []).filter(
    (c) => !c.cancelado && c.status === "ENVIADO PARA ASSINATURA",
  );
  const qtdComAssinatura = vgv.lotesVendidos + emAssinatura.length;
  const vgvComAssinatura = vgv.vgvVendido + emAssinatura.reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const cacComAssinatura = qtdComAssinatura > 0 ? realizadoAcumulado / qtdComAssinatura : 0;
  const roiComAssinatura = realizadoAcumulado > 0 ? vgvComAssinatura / realizadoAcumulado : 0;

  const formulaMes = [
    `Total de GASTOS (aba GASTOS do Cenario_Marketing.xlsx) do mês civil ${mesLabel}.`,
    "",
    "Fonte ÚNICA: o Excel já inclui TUDO (Meta Ads, Google Ads, offline, eventos) — sem misturar APIs.",
    "",
    "Por categoria:",
    ...CATEGORIAS.map((c) => `· ${c}: ${formatBRLCompact(porCategoria[c])}`),
    "",
    `Budget mensal alvo: ${formatBRLCompact(BUDGET_MENSAL)} (R$ 1,72M ÷ ${PROJETO.PRAZO_COMERCIALIZACAO_MESES} meses).`,
  ].join("\n");
  const formulaBudget = [
    `Realizado acumulado desde o lançamento ÷ Budget total.`,
    "",
    `Fonte: aba GASTOS do Cenario_Marketing.xlsx (todos os tipos).`,
    `Realizado: ${formatBRLCompact(realizadoAcumulado)}`,
    `Budget total: ${formatBRLCompact(PROJETO.BUDGET_MKT_TOTAL)} (2% do VGV inicial)`,
    `${mkt?.fetchedAt ? `\nÚltima sincronização Excel: ${new Date(mkt.fetchedAt).toLocaleString("pt-BR")}` : ""}`,
  ].join("\n");

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
      <div
        style={{
          fontSize: "0.75rem", color: "var(--text-dim)", fontWeight: 700, letterSpacing: "0.05em",
          textTransform: "uppercase", marginBottom: "0.875rem", display: "flex", alignItems: "center", gap: "0.4rem",
        }}
      >
        <Wallet size={12} />
        <span>Investimento de Marketing</span>
        <span style={{ marginLeft: "auto", fontSize: "0.7rem", color: "var(--text-dim)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
          detalhes na aba <a href="/marketing" style={{ color: "var(--text-muted)", textDecoration: "underline" }}>Marketing</a>
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
        <KpiMedium
          label={`Investido em ${mesLabel}`}
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
            `* Incluindo ${emAssinatura.length} contrato(s) em assinatura (enviados, ainda não assinados):`,
            `${formatBRLCompact(realizadoAcumulado)} / ${qtdComAssinatura} lotes = ${formatBRLCompact(cacComAssinatura)} por lote.`,
            "",
            "Marketing: aba GASTOS do Cenario_Marketing.xlsx (acumulado).",
            "Lotes vendidos: contratos ASSINADO/FATURADO/ENTREGUE (Eggs).",
          ].join("\n")}
          contexto={`${formatBRLCompact(realizadoAcumulado)} / ${vgv.lotesVendidos} lotes`}
          secundario={emAssinatura.length > 0 ? `* ${formatBRLCompact(cacComAssinatura)} c/ ${qtdComAssinatura} (inclui ${emAssinatura.length} em assinatura)` : undefined}
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
            `* Incluindo ${emAssinatura.length} em assinatura: ${formatBRLCompact(vgvComAssinatura)} / ${formatBRLCompact(realizadoAcumulado)} = ${roiComAssinatura.toFixed(1)}x.`,
            "",
            "VGV vendido: mesmo cálculo do KPI do topo (contratos vendidos).",
          ].join("\n")}
          contexto={`${formatBRLCompact(vgv.vgvVendido)} vendido`}
          secundario={emAssinatura.length > 0 ? `* ${roiComAssinatura.toFixed(1)}x c/ assinatura` : undefined}
          icon={<DollarSign size={11} style={{ color: "var(--text-dim)" }} />}
        />
      </div>

      {/* Quebra por categoria (igual à VISÃO GASTOS do Excel) */}
      <div style={{ marginTop: "0.875rem" }}>
        <div style={{ fontSize: "0.62rem", color: "var(--text-dim)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "0.4rem" }}>
          Gastos de {mesLabel} por categoria (Excel)
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "0.5rem" }}>
          {CATEGORIAS.map((c) => (
            <div key={c} style={{ padding: "0.45rem 0.6rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.375rem" }}>
              <div style={{ fontSize: "0.6rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.03em" }}>{c}</div>
              <div className="tnum" style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text)" }}>{formatBRLCompact(porCategoria[c])}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
