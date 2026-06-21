"use client";

/**
 * Ritmo & Previsão — funde o "Previsão de Término" com a leitura honesta da tendência.
 *
 * Gráfico burn-up: realizado (cheio) + previsão no ritmo recente (tracejado) + plano até o
 * prazo (pontilhado). Veredito pelo ritmo RECENTE (não pela média que carrega o pico).
 * Só usa contratos do Eggs (independe do UAU/Blob).
 */
import useSWR from "swr";
import { LineChart, Line, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { TrendingUp, TrendingDown, Minus, CheckCircle2, AlertTriangle } from "lucide-react";
import LoadingCard from "@/components/shared/LoadingCard";
import { isVenda } from "@/lib/constants/projeto";
import { calcularTendencia } from "@/lib/calculations/tendencia";

interface CrmContratosResp {
  contratos?: { valor: number; status: string; cancelado: boolean; dataContrato?: string }[];
}

const VERDE = "#10b981", AMBAR = "#f59e0b", VERMELHO = "#dc2626", CINZA = "#9ca3af";
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesAno = (ms: number) => { const d = new Date(ms); return `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`; };

export default function RitmoHonesto() {
  const { data, isLoading } = useSWR<CrmContratosResp>("/api/crm/contratos");

  if (isLoading || !data) {
    return <LoadingCard height={300} label="Ritmo & Previsão" hint="lendo contratos..." />;
  }

  const vendas = (data.contratos || [])
    .filter((c) => !c.cancelado && isVenda(c.status) && c.dataContrato)
    .map((c) => ({ dataVenda: (c.dataContrato as string).slice(0, 10), valor: c.valor }));

  const t = calcularTendencia(vendas);
  const cor = t.veredito === "no_ritmo" ? VERDE : t.veredito === "caindo" ? AMBAR : VERMELHO;

  const recente = t.recente30d;
  const nec = t.necessario;
  const semRitmo = t.esgotamentoMs == null;
  const verdito =
    semRitmo
      ? `Ritmo parado — sem vendas recentes. Precisa de ${nec.toFixed(0)}/mês pra fechar no prazo (${mesAno(t.prazoMs)}).`
      : t.veredito === "no_ritmo"
      ? `No ritmo de agora (${recente}/mês) você esgota ~${t.esgotamentoLabel} — antes do prazo (${mesAno(t.prazoMs)}).`
      : t.veredito === "caindo"
      ? `Ainda dá (${recente}/mês), mas o ritmo está caindo. Previsão de esgotar: ~${t.esgotamentoLabel}. Fique de olho.`
      : `Abaixo do necessário: ${recente}/mês vs ${nec.toFixed(0)}/mês. No ritmo atual só esgota ~${t.esgotamentoLabel}, depois do prazo (${mesAno(t.prazoMs)}).`;

  const dir = t.direcao;
  const corDir = dir === "acelerando" ? VERDE : dir === "desacelerando" ? AMBAR : CINZA;
  const iconDir = dir === "acelerando" ? <TrendingUp size={12} /> : dir === "desacelerando" ? <TrendingDown size={12} /> : <Minus size={12} />;

  // Ticks mensais (a cada 2 meses) pro eixo X
  const ticks: number[] = [];
  if (t.serie.length) {
    const d = new Date(t.serie[0].t); d.setDate(1);
    const last = t.serie[t.serie.length - 1].t;
    for (let m = d.getTime(); m <= last;) { ticks.push(m); const nd = new Date(m); nd.setMonth(nd.getMonth() + 2); m = nd.getTime(); }
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
      <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <TrendingUp size={12} />
        <span>Ritmo &amp; Previsão</span>
        <span style={{ marginLeft: "auto", fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
          vai fechar no prazo? (ritmo recente, não a média)
        </span>
      </div>

      {/* Veredito sempre visível */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", background: `${cor}14`, borderRadius: "0.5rem", padding: "0.6rem 0.85rem", marginBottom: "0.875rem" }}>
        {t.veredito === "no_ritmo" ? <CheckCircle2 size={20} style={{ color: cor, flexShrink: 0 }} /> : <AlertTriangle size={20} style={{ color: cor, flexShrink: 0 }} />}
        <span style={{ fontSize: "0.85rem", color: "var(--text)", lineHeight: 1.4 }}>{verdito}</span>
      </div>

      {/* Números-chave */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "0.6rem", marginBottom: "0.875rem" }}>
        <div style={{ background: "var(--bg-secondary, rgba(127,127,127,0.04))", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.55rem 0.7rem" }}>
          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Agora (30 dias)</div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700, color: cor, lineHeight: 1.1 }}>{recente}<span style={{ fontSize: "0.68rem", color: "var(--text-dim)", fontWeight: 400 }}>/mês</span></div>
        </div>
        <div style={{ background: "var(--bg-secondary, rgba(127,127,127,0.04))", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.55rem 0.7rem" }}>
          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Precisa agora</div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text)", lineHeight: 1.1 }}>{nec.toFixed(0)}<span style={{ fontSize: "0.68rem", color: "var(--text-dim)", fontWeight: 400 }}>/mês</span></div>
          <div style={{ fontSize: "0.62rem", color: "var(--text-dim)" }}>daqui até abr/27</div>
        </div>
        <div style={{ background: "var(--bg-secondary, rgba(127,127,127,0.04))", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.55rem 0.7rem" }}>
          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Alvo (1 ano)</div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text)", lineHeight: 1.1 }}>{(t.restantes / 12).toFixed(1).replace(".", ",")}<span style={{ fontSize: "0.68rem", color: "var(--text-dim)", fontWeight: 400 }}>/mês</span></div>
          <div style={{ fontSize: "0.62rem", color: "var(--text-dim)" }}>zera o disponível ({t.restantes}) em 12 meses</div>
        </div>
        <div style={{ background: "var(--bg-secondary, rgba(127,127,127,0.04))", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.55rem 0.7rem" }}>
          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Esgota (previsão)</div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text)", lineHeight: 1.1 }}>{t.esgotamentoLabel}</div>
        </div>
        <div style={{ background: "var(--bg-secondary, rgba(127,127,127,0.04))", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.55rem 0.7rem" }}>
          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Tendência</div>
          <div style={{ fontSize: "0.95rem", fontWeight: 700, color: corDir, lineHeight: 1.1, display: "flex", alignItems: "center", gap: "0.2rem", marginTop: "0.2rem" }}>{iconDir} {dir === "acelerando" ? "subindo" : dir === "desacelerando" ? "caindo" : "estável"}</div>
        </div>
      </div>

      {/* Gráfico burn-up */}
      <div style={{ width: "100%", height: 200 }}>
        <ResponsiveContainer>
          <LineChart data={t.serie} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} ticks={ticks} tickFormatter={mesAno} tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, t.lotesVendaveis]} ticks={[0, Math.round(t.lotesVendaveis / 2), t.lotesVendaveis]} tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} width={32} />
            <Tooltip
              content={(p) => {
                if (!p.active || !p.payload?.length) return null;
                const ms = p.payload[0]?.payload?.t as number;
                const row = p.payload[0]?.payload as { real: number | null; previsto: number | null; plano: number | null };
                return (
                  <div style={{ background: "var(--bg-secondary, #fff)", border: "1px solid var(--border)", borderRadius: "0.375rem", padding: "0.4rem 0.6rem", fontSize: "0.72rem" }}>
                    <div style={{ fontWeight: 700, color: "var(--text)" }}>{mesAno(ms)}</div>
                    {row.real != null && <div style={{ color: VERDE }}>realizado: {Math.round(row.real)}</div>}
                    {row.previsto != null && <div style={{ color: VERDE }}>previsão: {Math.round(row.previsto)}</div>}
                    {row.plano != null && <div style={{ color: "var(--text-muted)" }}>plano: {Math.round(row.plano)}</div>}
                  </div>
                );
              }}
            />
            <ReferenceLine y={t.lotesVendaveis} stroke={CINZA} strokeDasharray="2 2" label={{ value: `meta ${t.lotesVendaveis}`, position: "insideTopLeft", fontSize: 9, fill: "var(--text-dim)" }} />
            <ReferenceLine x={t.hojeMs} stroke="var(--text-dim)" strokeDasharray="3 3" label={{ value: "hoje", position: "insideTopRight", fontSize: 9, fill: "var(--text-dim)" }} />
            <ReferenceLine x={t.prazoMs} stroke={CINZA} strokeDasharray="3 3" label={{ value: `prazo ${mesAno(t.prazoMs)}`, position: "insideBottomRight", fontSize: 9, fill: "var(--text-dim)" }} />
            {t.esgotamentoMs != null && t.esgotamentoMs <= t.serie[t.serie.length - 1].t && (
              <ReferenceLine x={t.esgotamentoMs} stroke={cor} strokeDasharray="3 3" label={{ value: `esgota ${t.esgotamentoLabel}`, position: "insideTopLeft", fontSize: 9, fill: cor }} />
            )}
            <Line type="monotone" dataKey="plano" stroke={CINZA} strokeWidth={1.5} strokeDasharray="1 4" dot={false} connectNulls name="plano" isAnimationActive={false} />
            <Line type="monotone" dataKey="previsto" stroke={VERDE} strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls name="previsão" isAnimationActive={false} />
            <Line type="monotone" dataKey="real" stroke={VERDE} strokeWidth={2.5} dot={false} connectNulls name="realizado" isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legenda + explicação */}
      <div style={{ display: "flex", gap: "0.9rem", flexWrap: "wrap", marginTop: "0.5rem", fontSize: "0.7rem", color: "var(--text-muted)" }}>
        <span><span style={{ display: "inline-block", width: 16, height: 2.5, background: VERDE, verticalAlign: "middle" }} /> realizado ({t.vendidos})</span>
        <span><span style={{ display: "inline-block", width: 16, borderTop: `2px dashed ${VERDE}`, verticalAlign: "middle" }} /> previsão (ritmo atual)</span>
        <span><span style={{ display: "inline-block", width: 16, borderTop: `2px dotted ${CINZA}`, verticalAlign: "middle" }} /> plano (fechar no prazo)</span>
      </div>
      <div style={{ marginTop: "0.5rem", fontSize: "0.72rem", color: "var(--text-dim)", lineHeight: 1.5 }}>
        Onde a <strong>previsão</strong> (tracejada) toca os {t.lotesVendaveis} = data prevista de esgotamento. Antes da linha &quot;prazo&quot; = adiantado; depois = atrasado. A previsão usa o ritmo recente, não a média ({t.mediaAcumulada.toFixed(0)}/mês) que carrega o pico do lançamento.
      </div>
    </div>
  );
}
