"use client";

/**
 * Panorama — Vendas POR DIA (volume diário) + marcadores de eventos.
 *
 * Linha verde       = nº de contratos fechados naquele dia (Eggs.data_contrato).
 * Linhas verticais  = eventos (EVENTOS_MARKETING) — outdoor, evento na área, etc.
 *
 * É o "pulso" diário pedido: complementa a curva acumulada. Aqui se vê o dia-a-dia
 * e os picos; um pico logo depois de um evento sugere efeito (lembrando o atraso do contrato).
 * Só vendas/contratos (não leads).
 */
import useSWR from "swr";
import { LineChart, Line, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { CalendarDays } from "lucide-react";
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
  vendas: number;
  valor: number;
}

const COR_REAL = "#10b981";
const fmtDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtLabel = (iso: string) => {
  const p = iso.split("-");
  return `${p[2]}/${p[1]}`;
};

export default function VendasPorDia() {
  const { data, isLoading } = useSWR<CrmResp>("/api/crm/contratos");
  const { data: evData } = useSWR<EventoResp>("/api/eventos");

  if (isLoading || !data) {
    return <LoadingCard height={300} label="Vendas por dia" hint="lendo CRM Eggs..." />;
  }

  const vendas = (data.contratos || [])
    .filter((c) => !c.cancelado && isVenda(c.status) && c.dataContrato)
    .map((c) => ({ data: (c.dataContrato as string).slice(0, 10), valor: Number(c.valor) || 0 }));

  // Contagem por dia.
  const porDia = new Map<string, { vendas: number; valor: number }>();
  for (const v of vendas) {
    const cur = porDia.get(v.data) || { vendas: 0, valor: 0 };
    cur.vendas += 1;
    cur.valor += v.valor;
    porDia.set(v.data, cur);
  }

  // Série diária do lançamento até hoje (dias sem venda = 0).
  const dias: DiaPonto[] = [];
  const start = new Date(PROJETO.DATA_LANCAMENTO + "T12:00:00");
  const hoje = new Date();
  const cursor = new Date(start);
  let i = 0;
  while (cursor.getTime() <= hoje.getTime() && i < 800) {
    const iso = fmtDia(cursor);
    const d = porDia.get(iso);
    dias.push({ dia: iso, vendas: d?.vendas || 0, valor: d?.valor || 0 });
    cursor.setDate(cursor.getDate() + 1);
    i++;
  }

  const totalLotes = vendas.length;
  const melhorDia = dias.reduce<DiaPonto>((m, d) => (d.vendas > m.vendas ? d : m), dias[0] || { dia: "", vendas: 0, valor: 0 });
  const eventos = (evData?.eventos ?? EVENTOS_MARKETING).filter((e) => dias.some((d) => d.dia === e.data));
  const tickInterval = Math.max(1, Math.ceil(dias.length / 6));
  const yMax = Math.max(...dias.map((d) => d.vendas), 1) + 1;

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
      {/* Cabeçalho */}
      <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.6rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <CalendarDays size={12} />
        <span>Vendas por dia</span>
        <span style={{ marginLeft: "auto", fontSize: "0.7rem", fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--text-dim)" }}>
          contratos fechados/dia · eventos
        </span>
        <EventosManager />
      </div>

      {/* Resumo */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem", marginBottom: "0.875rem" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.72rem", fontWeight: 600, color: COR_REAL, background: `${COR_REAL}15`, padding: "0.25rem 0.6rem", borderRadius: "9999px" }}>
          <span style={{ width: 8, height: 8, borderRadius: 9999, background: COR_REAL }} />
          {totalLotes} vendas no total
        </span>
        {melhorDia.vendas > 0 && (
          <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-muted)", background: "var(--bg-secondary, rgba(127,127,127,0.08))", border: "1px solid var(--border)", padding: "0.25rem 0.6rem", borderRadius: "9999px" }}>
            pico: {melhorDia.vendas} vendas em {fmtLabel(melhorDia.dia)}
          </span>
        )}
      </div>

      {dias.length === 0 ? (
        <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", fontStyle: "italic", padding: "1rem 0" }}>
          Sem vendas registradas ainda.
        </div>
      ) : (
        <div style={{ width: "100%", height: 248 }}>
          <ResponsiveContainer>
            <LineChart data={dias} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="dia" tickFormatter={fmtLabel} interval={tickInterval} minTickGap={20} tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} domain={[0, yMax]} tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} width={28} />
              <Tooltip
                cursor={{ stroke: "rgba(127,127,127,0.3)", strokeWidth: 1 }}
                content={(props) => {
                  if (!props.active || !props.payload?.length) return null;
                  const d = props.payload[0].payload as DiaPonto;
                  return (
                    <div style={{ background: "var(--bg-secondary, #fff)", border: "1px solid var(--border)", borderRadius: "0.375rem", padding: "0.4rem 0.6rem", fontSize: "0.72rem", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
                      <div style={{ fontWeight: 700, color: "var(--text)" }}>{fmtLabel(d.dia)}</div>
                      <div style={{ color: COR_REAL }}>{d.vendas} venda{d.vendas === 1 ? "" : "s"}</div>
                      {d.valor > 0 && <div style={{ color: "var(--text-muted)" }}>{formatBRLCompact(d.valor)}</div>}
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
              <Line type="linear" dataKey="vendas" stroke={COR_REAL} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ fontSize: "0.66rem", color: "var(--text-dim)", marginTop: "0.4rem", lineHeight: 1.4 }}>
        Cada ponto = nº de contratos fechados naquele dia (data do contrato). As linhas verticais são eventos —
        um pico logo depois de um evento sugere efeito, lembrando que o contrato é atrasado (efeito vem dias/semanas depois).
      </div>
    </div>
  );
}
