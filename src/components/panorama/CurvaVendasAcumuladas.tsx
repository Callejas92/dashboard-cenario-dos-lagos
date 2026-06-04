"use client";

/**
 * Panorama — Curva de vendas ACUMULADAS no tempo + meta + marcadores de eventos.
 *
 * Linha verde         = lotes vendidos acumulados por dia (Eggs.dataContrato).
 * Linha âmbar tracejada = meta acumulada (14,5/mês prorrateado por dia desde o lançamento).
 * Linhas verticais    = eventos (outdoor, evento na área, ação imobiliária...) — EVENTOS_MARKETING.
 *
 * Objetivo: ver se a curva ACELERA (fica mais íngreme) depois de um evento.
 * ⚠️ Contrato é indicador atrasado — o efeito de um evento aparece dias/semanas depois.
 * Só vendas/contratos (não leads), como pedido.
 */
import useSWR from "swr";
import { LineChart, Line, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Activity } from "lucide-react";
import LoadingCard from "@/components/shared/LoadingCard";
import { PROJETO, isVenda } from "@/lib/constants/projeto";
import { EVENTOS_MARKETING, COR_TIPO_EVENTO, type TipoEvento } from "@/lib/constants/eventos";
import { formatBRLCompact } from "@/lib/utils/formatters";
import EventosManager from "@/components/panorama/EventosManager";

interface CrmResp {
  contratos?: { valor: number; status: string; cancelado: boolean; dataContrato?: string }[];
}
interface EventoResp {
  eventos?: { id?: string; data: string; nome: string; tipo?: TipoEvento }[];
}
interface DiaPonto {
  dia: string;
  real: number;
  meta: number;
  valor: number;
}

const META = PROJETO.VELOCIDADE_ALVO_LOTES_MES;
const COR_REAL = "#10b981";
const COR_META = "#f59e0b";

const fmtDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtLabel = (iso: string) => {
  const p = iso.split("-");
  return `${p[2]}/${p[1]}`;
};

export default function CurvaVendasAcumuladas() {
  const { data, isLoading } = useSWR<CrmResp>("/api/crm/contratos");
  const { data: evData } = useSWR<EventoResp>("/api/eventos");

  if (isLoading || !data) {
    return <LoadingCard height={340} label="Curva de vendas no tempo" hint="lendo CRM Eggs..." />;
  }

  const vendas = (data.contratos || [])
    .filter((c) => !c.cancelado && isVenda(c.status) && c.dataContrato)
    .map((c) => ({ data: (c.dataContrato as string).slice(0, 10), valor: Number(c.valor) || 0 }))
    .sort((a, b) => (a.data < b.data ? -1 : 1));

  // Série diária do lançamento até hoje.
  const dias: DiaPonto[] = [];
  const start = new Date(PROJETO.DATA_LANCAMENTO + "T12:00:00");
  const hoje = new Date();
  const metaPorDia = META / 30;
  const cursor = new Date(start);
  let i = 0;
  while (cursor.getTime() <= hoje.getTime() && i < 800) {
    const iso = fmtDia(cursor);
    const ate = vendas.filter((v) => v.data <= iso);
    dias.push({
      dia: iso,
      real: ate.length,
      meta: Math.round(metaPorDia * i * 10) / 10,
      valor: ate.reduce((s, v) => s + v.valor, 0),
    });
    cursor.setDate(cursor.getDate() + 1);
    i++;
  }

  const ultimo = dias[dias.length - 1];
  const realHoje = ultimo?.real ?? 0;
  const metaHoje = Math.round(ultimo?.meta ?? 0);
  const aFrente = realHoje - metaHoje;
  const eventos = (evData?.eventos ?? EVENTOS_MARKETING).filter((e) => dias.some((d) => d.dia === e.data));
  const tickInterval = Math.max(1, Math.ceil(dias.length / 6));
  const yMax = Math.ceil(Math.max(realHoje, metaHoje, 1) * 1.12);

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
      {/* Cabeçalho */}
      <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.6rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <Activity size={12} />
        <span>Curva de vendas no tempo</span>
        <span style={{ marginLeft: "auto", fontSize: "0.7rem", fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--text-dim)" }}>
          acumulado vs meta · eventos
        </span>
        <EventosManager />
      </div>

      {/* Resumo */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem", marginBottom: "0.875rem" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.72rem", fontWeight: 600, color: COR_REAL, background: `${COR_REAL}15`, padding: "0.25rem 0.6rem", borderRadius: "9999px" }}>
          <span style={{ width: 8, height: 8, borderRadius: 9999, background: COR_REAL }} />
          {realHoje} lotes acumulados
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.72rem", fontWeight: 600, color: COR_META, background: `${COR_META}15`, padding: "0.25rem 0.6rem", borderRadius: "9999px" }}>
          <span style={{ width: 10, height: 2, background: COR_META }} />
          meta no período ~{metaHoje}
        </span>
        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: aFrente >= 0 ? "#10b981" : "#dc2626", background: aFrente >= 0 ? "#10b98115" : "#dc262615", padding: "0.25rem 0.6rem", borderRadius: "9999px" }}>
          {aFrente >= 0 ? "▲" : "▼"} {Math.abs(aFrente)} lotes {aFrente >= 0 ? "à frente" : "atrás"} da meta
        </span>
      </div>

      {dias.length === 0 ? (
        <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", fontStyle: "italic", padding: "1rem 0" }}>
          Sem vendas registradas ainda.
        </div>
      ) : (
        <div style={{ width: "100%", height: 268 }}>
          <ResponsiveContainer>
            <LineChart data={dias} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="dia" tickFormatter={fmtLabel} interval={tickInterval} minTickGap={20} tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} domain={[0, yMax]} tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} width={34} />
              <Tooltip
                cursor={{ stroke: "rgba(127,127,127,0.3)", strokeWidth: 1 }}
                content={(props) => {
                  if (!props.active || !props.payload?.length) return null;
                  const d = props.payload[0].payload as DiaPonto;
                  return (
                    <div style={{ background: "var(--bg-secondary, #fff)", border: "1px solid var(--border)", borderRadius: "0.375rem", padding: "0.4rem 0.6rem", fontSize: "0.72rem", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
                      <div style={{ fontWeight: 700, color: "var(--text)" }}>{fmtLabel(d.dia)}</div>
                      <div style={{ color: COR_REAL }}>{d.real} lotes acumulados</div>
                      <div style={{ color: COR_META }}>meta {d.meta}</div>
                      <div style={{ color: "var(--text-muted)" }}>{formatBRLCompact(d.valor)}</div>
                    </div>
                  );
                }}
              />
              {/* Eventos (linhas verticais) */}
              {eventos.map((e) => (
                <ReferenceLine
                  key={`${e.data}-${e.nome}`}
                  x={e.data}
                  stroke={COR_TIPO_EVENTO[e.tipo || "outro"]}
                  strokeDasharray="4 3"
                  strokeWidth={1.25}
                  label={{ value: e.nome, position: "top", fontSize: 9, fill: COR_TIPO_EVENTO[e.tipo || "outro"] }}
                />
              ))}
              {/* Meta acumulada */}
              <Line type="monotone" dataKey="meta" stroke={COR_META} strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
              {/* Vendas acumuladas (real) */}
              <Line type="monotone" dataKey="real" stroke={COR_REAL} strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ fontSize: "0.66rem", color: "var(--text-dim)", marginTop: "0.4rem", lineHeight: 1.4 }}>
        Linha <strong style={{ color: COR_REAL }}>verde</strong> = vendas acumuladas; <strong style={{ color: COR_META }}>âmbar</strong> = meta acumulada (14,5/mês).
        As linhas verticais são eventos — onde a verde fica mais íngreme depois de um evento, vendeu-se mais rápido.
        Lembrando: contrato é atrasado, então o efeito costuma aparecer dias/semanas depois da data.
      </div>
    </div>
  );
}
