"use client";

/**
 * Linha 1 do Panorama — 3 KPIs gigantes.
 * Decisão em 5 segundos: bati a meta?
 *
 *  1. VGV vendido / VGV total (barra de progresso)
 *  2. VSO acumulado (severidade vs meta)
 *  3. Velocidade do mês comercial (vs alvo 11,6 lotes/mês)
 */
import useSWR from "swr";
import KpiHero from "@/components/shared/KpiHero";
import { SkeletonCard } from "@/components/shared/Skeleton";
import { PROJETO } from "@/lib/constants/projeto";
import { calcularVso } from "@/lib/calculations/vso";
import { calcularVelocidade } from "@/lib/calculations/velocidade";
import { calcularVgv } from "@/lib/calculations/vgv";
import { getMesComercialAtual } from "@/lib/utils/mesComercial";
import { formatBRLCompact, formatPct, formatInt } from "@/lib/utils/formatters";
import { corMeta } from "@/lib/utils/cores";

interface UauResp {
  summary?: { total?: number; vendido?: number; disponivel?: number; vgvVendido?: number };
}
interface CrmContratosResp {
  contratos?: { loteId: string; valor: number; status: string; cancelado: boolean }[];
}
interface UauVendasResp {
  vendas?: { dataVenda: string; valorVenda: number }[];
}

export default function LinhaKpisGigantes() {
  const { data: uau, isLoading: lUau } = useSWR<UauResp>("/api/uau");
  const { data: crm, isLoading: lCrm } = useSWR<CrmContratosResp>("/api/crm/contratos");
  const { data: vendas, isLoading: lVendas } = useSWR<UauVendasResp>("/api/uau/vendas");

  const carregando = lUau || lCrm || lVendas;

  if (carregando) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.875rem" }}>
        <SkeletonCard height={140} />
        <SkeletonCard height={140} />
        <SkeletonCard height={140} />
      </div>
    );
  }

  // ── VGV (via lib/calculations/vgv.ts) ─────────────────────────────────
  const vgv = calcularVgv({
    contratos: (crm?.contratos || []).map((c) => ({
      loteId: c.loteId,
      valorContratado: c.valor,
      status: c.status,
      cancelado: c.cancelado,
    })),
  });

  // ── VSO (via lib/calculations/vso.ts) ─────────────────────────────────
  const vso = calcularVso({
    vendidos: uau?.summary?.vendido ?? 0,
    disponivel: uau?.summary?.disponivel ?? 0,
  });

  // ── Velocidade (mês comercial atual) ──────────────────────────────────
  const mc = getMesComercialAtual();
  const velocidade = calcularVelocidade(
    (vendas?.vendas || []).map((v) => ({ dataVenda: v.dataVenda, valor: v.valorVenda })),
    mc,
  );

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
        severidade={corMeta(vgv.vgvVendido, PROJETO.VGV_INICIAL * 0.5) /* meta interna ~50% no fim do projeto */}
        formula={`VGV vendido = soma valor contratado de contratos ASSINADO/FATURADO/ENTREGUE (excluindo investidor)\nDe ${formatBRLCompact(vgv.vgvVendido)} de ${formatBRLCompact(vgv.vgvTotal)} total`}
        contexto={`de ${formatBRLCompact(vgv.vgvTotal)} · ${vgv.lotesVendidos}/${vgv.lotesTotal} lotes`}
        progresso={vgv.pctVendido}
      />

      <KpiHero
        label="VSO Acumulado"
        valor={formatPct(vso.valor)}
        severidade={vso.severidade}
        formula={`${vso.formula}\nMeta: ≥ ${formatPct(vso.meta, { casas: 0 })}`}
        contexto={`meta ≥ ${formatPct(vso.meta, { casas: 0 })}`}
      />

      <KpiHero
        label={`Velocidade · ${mc.labelCurto}`}
        valor={`${velocidade.mesComercialAtual.qtdVendas} lotes`}
        severidade={velocidade.mesComercialAtual.severidade}
        formula={`Vendas no mês comercial atual (${mc.label}).\nMeta: ${PROJETO.VELOCIDADE_ALVO_LOTES_MES} lotes/mês.`}
        contexto={`alvo ${PROJETO.VELOCIDADE_ALVO_LOTES_MES.toFixed(1)} lotes/mês · ${formatBRLCompact(velocidade.mesComercialAtual.valorTotal)} contratado`}
        progresso={velocidade.mesComercialAtual.qtdVendas / PROJETO.VELOCIDADE_ALVO_LOTES_MES}
        extra={
          <div style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
            <span style={{ fontWeight: 600 }}>{formatInt(velocidade.acumulado.qtdVendas)}</span> desde lançamento
          </div>
        }
      />
    </div>
  );
}
