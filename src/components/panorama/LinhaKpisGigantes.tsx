"use client";

/**
 * Linha 1 do Panorama — 3 KPIs gigantes.
 *
 *  1. VGV vendido / VGV total (barra de progresso)
 *  2. VSO acumulado (severidade vs meta)
 *  3. Velocidade do mês comercial (vs alvo 11,6 lotes/mês)
 *
 * FONTES (otimizado pra velocidade):
 *  - /api/crm/contratos (0.4s) → VGV + Velocidade do mês (via Eggs.dataContrato)
 *  - /api/uau (2s)            → VSO (vendidos vs disponivel)
 *  - NÃO usa /api/uau/vendas (20s cold start) — Eggs.dataContrato é autoridade
 */
import useSWR from "swr";
import KpiHero from "@/components/shared/KpiHero";
import { SkeletonCard } from "@/components/shared/Skeleton";
import LoadingCard from "@/components/shared/LoadingCard";
import { PROJETO, isVenda } from "@/lib/constants/projeto";
import { calcularVso } from "@/lib/calculations/vso";
import { calcularVgv } from "@/lib/calculations/vgv";
import { getMesComercialAtual, dataNoMesComercial } from "@/lib/utils/mesComercial";
import { formatBRLCompact, formatPct, formatInt } from "@/lib/utils/formatters";
import { corMeta } from "@/lib/utils/cores";

interface UauResp {
  summary?: { total?: number; vendido?: number; disponivel?: number };
}
interface CrmContratosResp {
  contratos?: { loteId: string; valor: number; status: string; cancelado: boolean; dataContrato?: string }[];
}

export default function LinhaKpisGigantes() {
  const { data: uau, isLoading: lUau } = useSWR<UauResp>("/api/uau");
  const { data: crm, isLoading: lCrm } = useSWR<CrmContratosResp>("/api/crm/contratos");

  // Tratamos isLoading OU dados ausentes (undefined) como "ainda carregando".
  // Evita exibir "R$ 0" quando o endpoint ainda nem respondeu.
  const carregando = lUau || lCrm || !uau || !crm;

  if (carregando) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.875rem" }}>
        <LoadingCard height={140} label="VGV vendido" hint="lendo CRM Eggs..." />
        <LoadingCard height={140} label="VSO acumulado" hint="lendo ERP UAU..." />
        <LoadingCard height={140} label="Velocidade do mês" hint="cold start pode demorar até 30s" />
      </div>
    );
  }

  const contratos = crm?.contratos || [];

  // ── VGV ──
  const vgv = calcularVgv({
    contratos: contratos.map((c) => ({
      loteId: c.loteId,
      valorContratado: c.valor,
      status: c.status,
      cancelado: c.cancelado,
    })),
  });

  // ── VSO ──
  const vso = calcularVso({
    vendidos: uau?.summary?.vendido ?? 0,
    disponivel: uau?.summary?.disponivel ?? 0,
  });

  // ── Velocidade (mês comercial atual) via Eggs ──
  const mc = getMesComercialAtual();
  const vendasNoMesComercial = contratos.filter(
    (c) =>
      !c.cancelado &&
      isVenda(c.status) &&
      c.dataContrato &&
      dataNoMesComercial(c.dataContrato, mc),
  );
  const qtdMes = vendasNoMesComercial.length;
  const valorMes = vendasNoMesComercial.reduce((s, c) => s + (c.valor || 0), 0);

  const totalAcumulado = contratos.filter((c) => !c.cancelado && isVenda(c.status));

  const severidadeVel = corMeta(qtdMes, PROJETO.VELOCIDADE_ALVO_LOTES_MES);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: "0.875rem",
      }}
    >
      <KpiHero
        label="VGV Vendido"
        valor={formatBRLCompact(vgv.vgvVendido)}
        severidade={corMeta(vgv.vgvVendido, PROJETO.VGV_INICIAL * 0.5)}
        formula={`VGV vendido = soma valor contratado de contratos ASSINADO/FATURADO/ENTREGUE (excluindo investidor)\n${formatBRLCompact(vgv.vgvVendido)} de ${formatBRLCompact(vgv.vgvTotal)} total\nFonte: CRM Eggs Contratos`}
        contexto={`de ${formatBRLCompact(vgv.vgvTotal)} · ${vgv.lotesVendidos}/${vgv.lotesTotal} lotes`}
        progresso={vgv.pctVendido}
      />

      <KpiHero
        label="VSO Acumulado"
        valor={formatPct(vso.valor)}
        severidade={vso.severidade}
        formula={`${vso.formula}\nMeta: ≥ ${formatPct(vso.meta, { casas: 0 })}\nFonte: ERP UAU (espelho)`}
        contexto={`meta ≥ ${formatPct(vso.meta, { casas: 0 })}`}
      />

      <KpiHero
        label={`Velocidade · ${mc.labelCurto}`}
        valor={`${qtdMes} lotes`}
        severidade={severidadeVel}
        formula={`Vendas com data de contrato no mês comercial atual (${mc.label}).\nFonte: Eggs Contratos (dataContrato).\nMeta: ${PROJETO.VELOCIDADE_ALVO_LOTES_MES} lotes/mês.`}
        contexto={`alvo ${PROJETO.VELOCIDADE_ALVO_LOTES_MES.toFixed(1)} lotes/mês · ${formatBRLCompact(valorMes)} contratado`}
        progresso={qtdMes / PROJETO.VELOCIDADE_ALVO_LOTES_MES}
        extra={
          <div style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
            <span style={{ fontWeight: 600 }}>{formatInt(totalAcumulado.length)}</span> desde lançamento
          </div>
        }
      />
    </div>
  );
}
