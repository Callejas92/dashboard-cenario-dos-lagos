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
  summary?: { total?: number; vendido?: number; disponivel?: number; emVenda?: number; foraDeVenda?: number };
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

  // ── Progresso esperado pela curva do projeto (régua temporal dos cards) ──
  // Sem isso, o VGV era medido contra "50% do total" fixo: ficava VERMELHO por meses
  // no início do projeto mesmo vendendo ACIMA da meta (contradizia a Velocidade verde).
  const lancamento = new Date(PROJETO.DATA_LANCAMENTO + "T00:00:00");
  const mesesDecorridos = Math.max(0.1, (Date.now() - lancamento.getTime()) / (30 * 86_400_000));
  const fracEsperada = Math.min(1, mesesDecorridos / PROJETO.PRAZO_COMERCIALIZACAO_MESES);
  const vgvEsperadoHoje = PROJETO.VGV_INICIAL * fracEsperada;

  // ── VGV ──
  const vgv = calcularVgv({
    contratos: contratos.map((c) => ({
      loteId: c.loteId,
      valorContratado: c.valor,
      status: c.status,
      cancelado: c.cancelado,
    })),
  });
  const aFrente = vgv.vgvVendido - vgvEsperadoHoje;

  // ── VSO — vendas FIRMES (mesma contagem do card VGV; o espelho UAU contava
  // "CONTRATO"=enviado p/ assinatura como vendido e divergia: 54 vs 46) ──
  const s = uau?.summary;
  const foraDeVenda = Math.max(
    0,
    (s?.total ?? PROJETO.LOTES_VENDAVEIS) - (s?.vendido ?? 0) - (s?.disponivel ?? 0) - (s?.emVenda ?? 0),
  );
  const vso = calcularVso({
    vendidos: vgv.lotesVendidos,
    foraDeVenda,
    mesesDecorridos,
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
        severidade={corMeta(vgv.vgvVendido, vgvEsperadoHoje)}
        formula={`VGV vendido = soma valor contratado de contratos ASSINADO/FATURADO/ENTREGUE (excluindo investidor)\n${formatBRLCompact(vgv.vgvVendido)} de ${formatBRLCompact(vgv.vgvTotal)} total\nEsperado p/ hoje (curva ${PROJETO.PRAZO_COMERCIALIZACAO_MESES}m): ${formatBRLCompact(vgvEsperadoHoje)}\nFonte: CRM Eggs Contratos`}
        contexto={`${aFrente >= 0 ? `${formatBRLCompact(aFrente)} à frente da curva` : `${formatBRLCompact(-aFrente)} atrás da curva`} · ${vgv.lotesVendidos}/${vgv.lotesTotal} lotes`}
        progresso={vgv.pctVendido}
      />

      <KpiHero
        label="VSO Acumulado"
        valor={formatPct(vso.valor)}
        severidade={vso.severidade}
        formula={vso.formula}
        contexto={`esperado p/ hoje ≥ ${formatPct(vso.esperadoHoje)}`}
      />

      <KpiHero
        label={`Velocidade · ${mc.labelCurto}`}
        valor={`${qtdMes} lotes`}
        severidade={severidadeVel}
        formula={`Vendas com data de contrato no mês atual — calendário (${mc.label}).\nFonte: Eggs Contratos (dataContrato).\nMeta: ${PROJETO.VELOCIDADE_ALVO_LOTES_MES} lotes/mês.`}
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
