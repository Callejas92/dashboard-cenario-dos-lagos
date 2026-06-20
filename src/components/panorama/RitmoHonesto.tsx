"use client";

/**
 * Ritmo — leitura HONESTA (a derivada que o selo "no prazo" esconde).
 *
 * O "Previsão de Término" e os KPIs comparam a MÉDIA desde o lançamento (que carrega o
 * pico) com o necessário → fica verde mesmo desacelerando. Aqui mostramos o ritmo RECENTE
 * (30d), a DIREÇÃO (recente vs 30d anteriores) e a curva do ritmo móvel, com veredito
 * baseado no recente — não na média. Só usa contratos do Eggs (não depende do UAU/Blob).
 */
import useSWR from "swr";
import { Activity, TrendingDown, TrendingUp, Minus } from "lucide-react";
import LoadingCard from "@/components/shared/LoadingCard";
import TooltipDefinicao from "@/components/shared/TooltipDefinicao";
import { isVenda } from "@/lib/constants/projeto";
import { calcularTendencia } from "@/lib/calculations/tendencia";

interface CrmContratosResp {
  contratos?: { valor: number; status: string; cancelado: boolean; dataContrato?: string }[];
}

const VERDE = "#10b981", AMBAR = "#f59e0b", VERMELHO = "#dc2626", CINZA = "#6b7280";

export default function RitmoHonesto() {
  const { data, isLoading } = useSWR<CrmContratosResp>("/api/crm/contratos");

  if (isLoading || !data) {
    return <LoadingCard height={150} label="Ritmo — tendência" hint="lendo contratos..." />;
  }

  const vendas = (data.contratos || [])
    .filter((c) => !c.cancelado && isVenda(c.status) && c.dataContrato)
    .map((c) => ({ dataVenda: (c.dataContrato as string).slice(0, 10), valor: c.valor }));

  const t = calcularTendencia(vendas);

  const corVeredito = t.veredito === "no_ritmo" ? VERDE : t.veredito === "caindo" ? AMBAR : VERMELHO;
  const textoVeredito =
    t.veredito === "no_ritmo"
      ? "No ritmo recente, fecha no prazo."
      : t.veredito === "caindo"
      ? "Pelo ritmo recente ainda dá — mas está caindo. A média esconde isso."
      : "Ritmo recente abaixo do necessário. A média desde o lançamento mascara.";

  const dir = t.direcao;
  const corDir = dir === "acelerando" ? VERDE : dir === "desacelerando" ? AMBAR : CINZA;
  const iconDir = dir === "acelerando" ? <TrendingUp size={12} /> : dir === "desacelerando" ? <TrendingDown size={12} /> : <Minus size={12} />;
  const labelDir = dir === "acelerando" ? "acelerando" : dir === "desacelerando" ? "desacelerando" : "estável";
  const deltaTxt = t.anterior30d > 0 ? `${t.deltaPct >= 0 ? "+" : ""}${Math.round(t.deltaPct * 100)}% vs 30d anteriores` : "sem base anterior";

  // ── Sparkline do ritmo móvel 30d ──
  const W = 280, H = 64, PAD = 4;
  const serie = t.serie;
  const maxY = Math.max(t.necessario, ...serie.map((p) => p.ritmo30d), 1) * 1.15;
  const x = (i: number) => PAD + (serie.length <= 1 ? 0 : (i / (serie.length - 1)) * (W - 2 * PAD));
  const y = (v: number) => H - PAD - (v / maxY) * (H - 2 * PAD);
  const pts = serie.map((p, i) => `${x(i).toFixed(1)},${y(p.ritmo30d).toFixed(1)}`).join(" ");
  const yNec = y(t.necessario);

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
      <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.875rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <Activity size={12} />
        <TooltipDefinicao
          texto={`Ritmo RECENTE (últimos 30 dias) vs o necessário pra fechar no prazo, e a DIREÇÃO (recente vs os 30 dias anteriores).\n\nO selo "no prazo" usa a média desde o lançamento (${t.mediaAcumulada.toFixed(1)}/mês), que carrega o pico e fica verde mesmo desacelerando. Aqui o veredito usa o ritmo recente.`}
        >
          <span>Ritmo — tendência</span>
        </TooltipDefinicao>
        <span style={{ marginLeft: "auto", fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
          a derivada que o selo esconde
        </span>
      </div>

      <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", alignItems: "flex-start" }}>
        {/* Números */}
        <div style={{ flex: "1 1 200px", minWidth: 200 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "2rem", fontWeight: 700, color: corVeredito, lineHeight: 1 }}>{t.recente30d}</span>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>lotes/mês · últimos 30d</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem", fontSize: "0.68rem", fontWeight: 700, color: corDir, background: `${corDir}1a`, padding: "0.1rem 0.45rem", borderRadius: "9999px" }}>
              {iconDir} {labelDir}
            </span>
          </div>
          <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: "0.4rem", lineHeight: 1.5 }}>
            necessário <strong style={{ color: "var(--text)" }}>{t.necessario.toFixed(1)}/mês</strong> · {deltaTxt}
            <br />
            <span style={{ textDecoration: "line-through", color: "var(--text-dim)" }}>média {t.mediaAcumulada.toFixed(1)}</span>
            <span style={{ color: "var(--text-dim)" }}> (carrega o pico — engana)</span>
          </div>
        </div>

        {/* Sparkline */}
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, height: H, maxWidth: "100%", flexShrink: 0 }} role="img" aria-label="curva do ritmo móvel de 30 dias ao longo do tempo">
          <line x1={PAD} y1={yNec} x2={W - PAD} y2={yNec} stroke={CINZA} strokeWidth={1} strokeDasharray="4 3" opacity={0.6} />
          <text x={PAD} y={Math.max(9, yNec - 3)} style={{ fontSize: 9, fill: "var(--text-dim)" }}>necessário {t.necessario.toFixed(0)}</text>
          {serie.length > 1 && <polyline points={pts} fill="none" stroke="#3b82f6" strokeWidth={2} />}
          {serie.length > 0 && <circle cx={x(serie.length - 1)} cy={y(serie[serie.length - 1].ritmo30d)} r={3.5} fill={corVeredito} />}
          <text x={W - PAD} y={H - 1} textAnchor="end" style={{ fontSize: 9, fill: "var(--text-dim)" }}>lançamento → hoje</text>
        </svg>
      </div>

      <div style={{ marginTop: "0.75rem", padding: "0.5rem 0.75rem", background: `${corVeredito}14`, borderRadius: "0.375rem", fontSize: "0.74rem", color: "var(--text)" }}>
        <strong style={{ color: corVeredito }}>{textoVeredito}</strong>
      </div>
    </div>
  );
}
