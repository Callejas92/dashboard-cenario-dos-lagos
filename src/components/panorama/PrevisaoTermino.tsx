"use client";

/**
 * Previsão de Término — calcula quanto tempo ainda falta pra esgotar o estoque
 * baseado no ritmo de vendas real (não na meta).
 *
 * Cenários mostrados:
 *  - Ritmo atual (últimos 30 dias)
 *  - Ritmo desde o lançamento (acumulado)
 *  - Ritmo necessário pra fechar no prazo planejado (12 meses)
 *
 * Severidade:
 *  - verde: vai fechar no prazo ou antes
 *  - amarelo: até 3 meses de atraso
 *  - vermelho: >3 meses de atraso
 */
import useSWR from "swr";
import { Calendar, TrendingUp, Target } from "lucide-react";
import LoadingCard from "@/components/shared/LoadingCard";
import TooltipDefinicao from "@/components/shared/TooltipDefinicao";
import { PROJETO, isVenda } from "@/lib/constants/projeto";
import { calcularVelocidade } from "@/lib/calculations/velocidade";
import { formatBRLCompact, formatInt } from "@/lib/utils/formatters";

interface CrmContratosResp {
  contratos?: { loteId: string; valor: number; status: string; cancelado: boolean; dataContrato?: string }[];
}

const MESES_BR = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function formatMesAno(d: Date): string {
  return `${MESES_BR[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`;
}

function corPorAtraso(mesesAtraso: number): { value: string; bg: string; label: string } {
  if (mesesAtraso <= 0) return { value: "#10b981", bg: "#10b98115", label: "no prazo" };
  if (mesesAtraso <= 3) return { value: "#f59e0b", bg: "#f59e0b15", label: `${mesesAtraso.toFixed(1)}m de atraso` };
  return { value: "#dc2626", bg: "#dc262615", label: `${mesesAtraso.toFixed(1)}m de atraso` };
}

export default function PrevisaoTermino() {
  const { data, isLoading } = useSWR<CrmContratosResp>("/api/crm/contratos");

  if (isLoading || !data) {
    return <LoadingCard height={180} label="Previsão de término" hint="calculando ritmo de vendas..." />;
  }

  const hoje = new Date();
  const vendas = (data.contratos || []).filter(
    (c) => !c.cancelado && isVenda(c.status) && c.dataContrato
  );

  const totalVendido = vendas.length;
  const restantes = Math.max(0, PROJETO.LOTES_VENDAVEIS - totalVendido);

  // Ritmo dos últimos 30 dias — usa a MESMA fonte do card "Velocidade" e dos gráficos
  // (calcularVelocidade) pra não divergir na tela. Antes contava a borda do dia diferente
  // (timestamp now-30d), o que excluía 1 venda no limite e mostrava 19 em vez de 20.
  const vendas30d = calcularVelocidade(
    vendas.map((c) => ({ dataVenda: c.dataContrato as string, valor: c.valor })),
  ).ultimos30d.qtdVendas;
  const ritmo30d = vendas30d; // vendas/mês (proxy: 30 dias = 1 mês)

  // Ritmo desde o lançamento
  const lancamento = new Date(PROJETO.DATA_LANCAMENTO + "T00:00:00");
  const mesesDecorridos = Math.max(
    0.1,
    (hoje.getTime() - lancamento.getTime()) / (30 * 86_400_000),
  );
  const ritmoAcumulado = totalVendido / mesesDecorridos;

  // Ritmo necessário pra fechar no prazo (PROJETO.PRAZO_COMERCIALIZACAO_MESES desde lançamento)
  const mesesAteFimPrazo = Math.max(
    0.1,
    PROJETO.PRAZO_COMERCIALIZACAO_MESES - mesesDecorridos,
  );
  const ritmoNecessario = restantes / mesesAteFimPrazo;

  // Previsões de término
  const mesesAteEsgotar30d = ritmo30d > 0 ? restantes / ritmo30d : Infinity;
  const mesesAteEsgotarAcum = ritmoAcumulado > 0 ? restantes / ritmoAcumulado : Infinity;

  const fimPrazoData = new Date(lancamento);
  fimPrazoData.setMonth(fimPrazoData.getMonth() + PROJETO.PRAZO_COMERCIALIZACAO_MESES);

  function dataPrevista(meses: number): string {
    if (!Number.isFinite(meses)) return "—";
    const d = new Date(hoje);
    d.setMonth(d.getMonth() + Math.ceil(meses));
    return formatMesAno(d);
  }

  function atrasoVsPrazo(meses: number): number {
    if (!Number.isFinite(meses)) return Infinity;
    return meses - mesesAteFimPrazo;
  }

  const atraso30d = atrasoVsPrazo(mesesAteEsgotar30d);
  const atrasoAcum = atrasoVsPrazo(mesesAteEsgotarAcum);
  const cor30d = corPorAtraso(atraso30d);
  const corAcum = corPorAtraso(atrasoAcum);

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
      <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.875rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <Calendar size={12} />
        <TooltipDefinicao
          texto={`Previsão de término baseada em 3 ritmos diferentes.\n\nPrazo planejado: ${PROJETO.PRAZO_COMERCIALIZACAO_MESES} meses = fim ${formatMesAno(fimPrazoData)}.\nFaltam ${restantes} lotes de ${PROJETO.LOTES_VENDAVEIS}.\nRestam ${mesesAteFimPrazo.toFixed(1)} meses até o prazo.`}
        >
          <span>Previsão de Término</span>
        </TooltipDefinicao>
        <span style={{ marginLeft: "auto", fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
          alvo: fechar em {formatMesAno(fimPrazoData)} · {restantes} lotes restantes
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
        {/* Ritmo últimos 30 dias */}
        <CenarioCard
          icon={<TrendingUp size={11} />}
          label="Ritmo últimos 30d"
          ritmo={ritmo30d}
          mesesAteFim={mesesAteEsgotar30d}
          dataPrevista={dataPrevista(mesesAteEsgotar30d)}
          cor={cor30d}
          formula={`${vendas30d} vendas em 30 dias = ${ritmo30d.toFixed(1)} lotes/mês.\nNesse ritmo: ${restantes} lotes ÷ ${ritmo30d.toFixed(1)}/mês = ${Number.isFinite(mesesAteEsgotar30d) ? mesesAteEsgotar30d.toFixed(1) + " meses" : "tempo indefinido"}`}
        />

        {/* Ritmo acumulado desde lançamento */}
        <CenarioCard
          icon={<TrendingUp size={11} />}
          label="Ritmo desde lançamento"
          ritmo={ritmoAcumulado}
          mesesAteFim={mesesAteEsgotarAcum}
          dataPrevista={dataPrevista(mesesAteEsgotarAcum)}
          cor={corAcum}
          formula={`${totalVendido} vendas em ${mesesDecorridos.toFixed(1)} meses desde ${formatMesAno(lancamento)} = ${ritmoAcumulado.toFixed(1)} lotes/mês.`}
        />

        {/* Ritmo necessário pra meta */}
        <div
          style={{
            padding: "0.875rem 1rem",
            background: "#4285f415",
            border: "1px solid #4285f440",
            borderRadius: "0.5rem",
          }}
        >
          <div style={{ fontSize: "0.65rem", color: "#4285f4", fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
            <Target size={11} /> Pra fechar no prazo
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#4285f4", lineHeight: 1 }}>
            {ritmoNecessario.toFixed(1)} lotes/mês
          </div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>
            ritmo necessário pelos próximos {mesesAteFimPrazo.toFixed(1)} meses pra acabar em {formatMesAno(fimPrazoData)}
          </div>
          <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", marginTop: "0.2rem" }}>
            alvo planejado: {PROJETO.VELOCIDADE_ALVO_LOTES_MES.toFixed(1)} lotes/mês
          </div>
        </div>
      </div>

      {/* Resumo conclusão */}
      <div style={{ marginTop: "0.875rem", padding: "0.5rem 0.75rem", background: "var(--bg-secondary, #fff)", border: "1px solid var(--border)", borderRadius: "0.375rem", fontSize: "0.72rem", color: "var(--text-muted)" }}>
        <strong style={{ color: "var(--text)" }}>{formatInt(restantes)} lotes restantes</strong> de {PROJETO.LOTES_VENDAVEIS}.
        Atualmente vendendo <strong>{ritmo30d.toFixed(1)} lotes/mês</strong> (média 30d).
        {Number.isFinite(mesesAteEsgotar30d) && (
          <> No ritmo atual, fim previsto em <strong style={{ color: cor30d.value }}>{dataPrevista(mesesAteEsgotar30d)}</strong> ({cor30d.label}).</>
        )}
      </div>
    </div>
  );
}

function CenarioCard({
  icon, label, ritmo, mesesAteFim, dataPrevista, cor, formula,
}: {
  icon: React.ReactNode;
  label: string;
  ritmo: number;
  mesesAteFim: number;
  dataPrevista: string;
  cor: { value: string; bg: string; label: string };
  formula: string;
}) {
  return (
    <div
      style={{
        padding: "0.875rem 1rem",
        background: cor.bg,
        border: `1px solid ${cor.value}40`,
        borderRadius: "0.5rem",
      }}
    >
      <div style={{ fontSize: "0.65rem", color: cor.value, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
        <TooltipDefinicao texto={formula}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
            {icon} {label}
          </span>
        </TooltipDefinicao>
      </div>
      <div style={{ fontSize: "1.4rem", fontWeight: 700, color: cor.value, lineHeight: 1 }}>
        {ritmo.toFixed(1)} lotes/mês
      </div>
      <div style={{ fontSize: "0.75rem", color: "var(--text)", marginTop: "0.4rem", fontWeight: 600 }}>
        fim previsto: {dataPrevista}
      </div>
      <div style={{ fontSize: "0.7rem", color: cor.value, marginTop: "0.15rem", fontWeight: 600 }}>
        {cor.label}
      </div>
    </div>
  );
}
