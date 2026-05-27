"use client";

/**
 * Linha 6 do Panorama — bloco de insights.
 *
 * Cards "curiosidades" calculados via regras em lib/insights/.
 * V1 = só insights tipo A (estado atual, sem histórico).
 */
import useSWR from "swr";
import { Lightbulb } from "lucide-react";
import InsightCard from "@/components/shared/InsightCard";
import { SkeletonCard } from "@/components/shared/Skeleton";
import {
  calcularConcentracaoRisco,
  calcularLoteMedioMes,
  calcularBudgetConsumido,
  calcularBonusComprometido,
  calcularVelocidadeMes,
  type Insight,
} from "@/lib/insights";
import { getMesComercialAtual } from "@/lib/utils/mesComercial";
import lotesData from "@/data/lotes.json";

interface CrmContratosResp {
  contratos?: { loteId: string; valor: number; status: string; corretor?: { nome?: string }; cancelado: boolean; dataContrato?: string }[];
}
interface UauResp {
  unidades?: { identificador: string; area: number; valorTotal: number; classificacao: string; status: string }[];
}
interface MarketingResp {
  totalRealizado?: number;
  fetchedAt?: string;
}
interface BonusResp {
  summary?: {
    qtdAPagar?: number;
    qtdPagoTotal?: number;
    aPagarAgora?: number;
    pagoTotal?: number;
  };
}
interface UauVendasResp {
  vendas?: { identificadorUnidade: string; dataVenda: string; valorVenda: number }[];
}

interface LoteStatic { id: string; classificacao?: string; area?: number; }
const lotesMap = new Map<string, LoteStatic>();
for (const l of lotesData as LoteStatic[]) lotesMap.set(l.id, l);

export default function BlocoInsights() {
  const { data: crm, isLoading: lCrm } = useSWR<CrmContratosResp>("/api/crm/contratos");
  const { data: uau, isLoading: lUau } = useSWR<UauResp>("/api/uau");
  const { data: mkt } = useSWR<MarketingResp>("/api/marketing-offline?view=summary");
  const { data: bonus } = useSWR<BonusResp>("/api/bonus");
  const { data: vendas } = useSWR<UauVendasResp>("/api/uau/vendas");

  if (lCrm || lUau) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.75rem" }}>
        <SkeletonCard height={90} />
        <SkeletonCard height={90} />
        <SkeletonCard height={90} />
        <SkeletonCard height={90} />
      </div>
    );
  }

  const mc = getMesComercialAtual();
  const hoje = new Date();
  const diasDecorridos = Math.max(
    1,
    Math.floor((hoje.getTime() - mc.inicio.getTime()) / 86_400_000),
  );

  // === Computa todos os insights ===
  const insights: (Insight | null)[] = [];

  // 1. Concentração de risco
  const contadorCorretor = new Map<string, number>();
  const contratosValidos = (crm?.contratos || []).filter((c) => !c.cancelado);
  for (const c of contratosValidos) {
    const n = c.corretor?.nome?.trim();
    if (!n) continue;
    contadorCorretor.set(n, (contadorCorretor.get(n) ?? 0) + 1);
  }
  insights.push(
    calcularConcentracaoRisco({
      vendasPorCorretor: Array.from(contadorCorretor.entries()).map(([nome, qtd]) => ({ corretorNome: nome, qtdVendas: qtd })),
      totalVendas: contratosValidos.length,
    }),
  );

  // 2. Velocidade do mês
  const vendasNoMesISO = (vendas?.vendas || []).filter(
    (v) => v.dataVenda >= mc.inicioISO && v.dataVenda <= mc.fimISO,
  );
  insights.push(
    calcularVelocidadeMes({
      vendasMesComercial: vendasNoMesISO.length,
      diasDecorridosNoMesComercial: diasDecorridos,
    }),
  );

  // 3. Lote médio do mês
  const vendasComMetadata = vendasNoMesISO.map((v) => {
    const unidade = (uau?.unidades || []).find((u) => u.identificador === v.identificadorUnidade);
    const lote = lotesMap.get(v.identificadorUnidade);
    return {
      area: unidade?.area ?? lote?.area ?? 0,
      valor: v.valorVenda,
      classificacao: unidade?.classificacao ?? lote?.classificacao,
    };
  });
  insights.push(calcularLoteMedioMes({ vendasNoMes: vendasComMetadata }));

  // 4. Budget consumido
  if ((mkt?.totalRealizado ?? 0) > 0) {
    // mesesDecorridos desde lançamento (2026-04-14)
    const lancamento = new Date("2026-04-14T00:00:00");
    const mesesDecorridos = Math.max(
      0.1,
      (hoje.getTime() - lancamento.getTime()) / (30 * 86_400_000),
    );
    insights.push(
      calcularBudgetConsumido({
        realizadoAcumulado: mkt!.totalRealizado!,
        mesesDecorridos,
      }),
    );
  }

  // 5. Bônus comprometido
  if (bonus?.summary) {
    insights.push(
      calcularBonusComprometido({
        qtdAPagar: bonus.summary.qtdAPagar ?? 0,
        qtdPagoTotal: bonus.summary.qtdPagoTotal ?? 0,
        aPagarAgora: bonus.summary.aPagarAgora ?? 0,
        pagoTotal: bonus.summary.pagoTotal ?? 0,
      }),
    );
  }

  const insightsValidos = insights
    .filter((i): i is Insight => i !== null)
    .sort((a, b) => (b.prioridade ?? 0) - (a.prioridade ?? 0));

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
        <Lightbulb size={12} />
        <span>Insights</span>
      </div>

      {insightsValidos.length === 0 ? (
        <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
          Sem insights relevantes neste momento.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "0.75rem",
          }}
        >
          {insightsValidos.map((i) => (
            <InsightCard
              key={i.id}
              titulo={i.titulo}
              texto={i.texto}
              severidade={i.severidade}
              icon={i.icon}
            />
          ))}
        </div>
      )}
    </div>
  );
}
