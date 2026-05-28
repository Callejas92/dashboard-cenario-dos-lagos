"use client";

/**
 * Linha 3 do Panorama — velocidade em 4 janelas temporais.
 *
 *  7 dias / 30 dias / mês comercial atual / acumulado lançamento
 *
 * Fonte: /api/crm/contratos (Eggs.dataContrato é autoridade).
 * NÃO usa /api/uau/vendas (lento, 20s cold start).
 */
import useSWR from "swr";
import { Zap } from "lucide-react";
import KpiSmall from "@/components/shared/KpiSmall";
import { SkeletonCard } from "@/components/shared/Skeleton";
import TooltipDefinicao from "@/components/shared/TooltipDefinicao";
import { PROJETO, isVenda } from "@/lib/constants/projeto";
import { calcularVelocidade } from "@/lib/calculations/velocidade";
import { formatBRLCompact, formatInt } from "@/lib/utils/formatters";

interface CrmContratosResp {
  contratos?: { valor: number; status: string; cancelado: boolean; dataContrato?: string }[];
}

export default function VelocidadeVendas() {
  const { data, isLoading } = useSWR<CrmContratosResp>("/api/crm/contratos");

  if (isLoading) return <SkeletonCard height={100} />;

  // Mapeia contratos pra formato esperado por calcularVelocidade
  const vendas = (data?.contratos || [])
    .filter((c) => !c.cancelado && isVenda(c.status) && c.dataContrato)
    .map((c) => ({ dataVenda: c.dataContrato as string, valor: c.valor }));

  const velocidade = calcularVelocidade(vendas);

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
        <Zap size={12} />
        <TooltipDefinicao texto="Vendas distribuídas em 4 janelas: 7d e 30d são móveis. Mês comercial vai do dia 15 ao dia 14 do mês seguinte. Acumulado começa em 14/04/2026. Fonte: Eggs CRM (data do contrato).">
          <span>Velocidade de Vendas</span>
        </TooltipDefinicao>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "0.875rem",
        }}
      >
        <KpiSmall
          label="Últimos 7 dias"
          valor={`${formatInt(velocidade.ultimos7d.qtdVendas)} lotes`}
          contexto={formatBRLCompact(velocidade.ultimos7d.valorTotal)}
        />
        <KpiSmall
          label="Últimos 30 dias"
          valor={`${formatInt(velocidade.ultimos30d.qtdVendas)} lotes`}
          contexto={formatBRLCompact(velocidade.ultimos30d.valorTotal)}
        />
        <KpiSmall
          label={velocidade.mesComercialAtual.label}
          valor={`${formatInt(velocidade.mesComercialAtual.qtdVendas)} lotes`}
          severidade={velocidade.mesComercialAtual.severidade}
          contexto={`alvo ${velocidade.mesComercialAtual.meta.toFixed(1)} · ${formatBRLCompact(velocidade.mesComercialAtual.valorTotal)}`}
          formula={`Vendas com dataContrato no mês comercial atual.\nMeta: ${velocidade.mesComercialAtual.meta.toFixed(1)} lotes/mês.\nFonte: Eggs CRM.`}
        />
        <KpiSmall
          label="Desde lançamento"
          valor={`${formatInt(velocidade.acumulado.qtdVendas)} lotes`}
          contexto={`${formatBRLCompact(velocidade.acumulado.valorTotal)} acumulado`}
          formula={`Vendas desde ${PROJETO.DATA_LANCAMENTO}.\nFonte: Eggs CRM (dataContrato).`}
        />
      </div>
    </div>
  );
}
