"use client";

/**
 * Panorama — Velocidade de vendas NO TEMPO (meta + velocidade atual no mesmo gráfico).
 *
 * Barras  = lotes vendidos por mês comercial (Eggs.dataContrato; mês comercial 15→14).
 * Âmbar   = meta (14,5 lotes/mês — o ritmo que fecha o projeto no prazo).
 * Azul    = velocidade atual = lotes nos ÚLTIMOS 30 DIAS (mesmo número do card "Velocidade").
 *
 * Fonte única: /api/crm/contratos. Reusa calcularVelocidade p/ o nº atual bater com o KPI.
 */
import useSWR from "swr";
import { BarChart, Bar, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer, CartesianGrid, LabelList } from "recharts";
import { TrendingUp } from "lucide-react";
import LoadingCard from "@/components/shared/LoadingCard";
import { PROJETO, isVenda } from "@/lib/constants/projeto";
import { calcularVelocidade } from "@/lib/calculations/velocidade";
import { getMesComercial, getMesComercialAtual, getProximoMesComercial, dataNoMesComercial } from "@/lib/utils/mesComercial";
import { formatBRLCompact } from "@/lib/utils/formatters";

interface CrmResp {
  contratos?: { valor: number; status: string; cancelado: boolean; dataContrato?: string }[];
}
interface Ponto {
  mes: string;
  lotes: number;
  valor: number;
}

const META = PROJETO.VELOCIDADE_ALVO_LOTES_MES;
const metaTxt = META.toFixed(1).replace(".", ",");
const COR_META = "#f59e0b";
const COR_ATUAL = "#3b82f6";
const COR_BARRA = "#10b981";

export default function VelocidadeNoTempo() {
  const { data, isLoading } = useSWR<CrmResp>("/api/crm/contratos");

  if (isLoading || !data) {
    return <LoadingCard height={300} label="Velocidade no tempo" hint="lendo CRM Eggs..." />;
  }

  const contratosVenda = (data.contratos || []).filter(
    (c) => !c.cancelado && isVenda(c.status) && c.dataContrato,
  );
  const vendas = contratosVenda.map((c) => ({ data: c.dataContrato as string, valor: Number(c.valor) || 0 }));

  // Velocidade ATUAL = últimos 30 dias (mesma fonte/cálculo do card "Velocidade de Vendas").
  const vel = calcularVelocidade(contratosVenda.map((c) => ({ dataVenda: c.dataContrato as string, valor: Number(c.valor) || 0 })));
  const velAtual = vel.ultimos30d.qtdVendas;
  const deltaPct = META > 0 ? Math.round(((velAtual - META) / META) * 100) : 0;
  const acima = velAtual >= META;

  // Barras: meses comerciais do mês da 1ª venda até o atual.
  const dados: Ponto[] = [];
  if (vendas.length) {
    const minData = vendas.reduce((m, v) => (v.data < m ? v.data : m), vendas[0].data);
    const atual = getMesComercialAtual();
    let mc = getMesComercial(new Date(minData + "T12:00:00"));
    let guard = 0;
    while (mc.inicio.getTime() <= atual.inicio.getTime() && guard < 36) {
      const noMes = vendas.filter((v) => dataNoMesComercial(v.data, mc));
      dados.push({
        mes: mc.labelCurto.replace(" (comercial)", ""),
        lotes: noMes.length,
        valor: noMes.reduce((s, v) => s + v.valor, 0),
      });
      mc = getProximoMesComercial(mc.inicio);
      guard++;
    }
  }

  const totalLotes = dados.reduce((s, d) => s + d.lotes, 0);
  const yMax = Math.ceil(Math.max(...dados.map((d) => d.lotes), META, velAtual, 1) * 1.18);

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
      {/* Cabeçalho */}
      <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.6rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <TrendingUp size={12} />
        <span>Velocidade no tempo</span>
        <span style={{ marginLeft: "auto", fontSize: "0.7rem", fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--text-dim)" }}>
          lotes por mês comercial
        </span>
      </div>

      {/* Comparação atual × meta */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem", marginBottom: "0.875rem" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.72rem", fontWeight: 600, color: COR_ATUAL, background: `${COR_ATUAL}15`, padding: "0.25rem 0.6rem", borderRadius: "9999px" }}>
          <span style={{ width: 8, height: 8, borderRadius: 9999, background: COR_ATUAL }} />
          atual {velAtual}/mês <span style={{ fontWeight: 400, opacity: 0.8 }}>(últ. 30 dias)</span>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.72rem", fontWeight: 600, color: COR_META, background: `${COR_META}15`, padding: "0.25rem 0.6rem", borderRadius: "9999px" }}>
          <span style={{ width: 10, height: 2, background: COR_META }} />
          meta {metaTxt}/mês
        </span>
        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: acima ? "#10b981" : "#dc2626", background: acima ? "#10b98115" : "#dc262615", padding: "0.25rem 0.6rem", borderRadius: "9999px" }}>
          {acima ? "▲" : "▼"} {acima ? "+" : ""}{deltaPct}% {acima ? "acima da meta" : "abaixo da meta"}
        </span>
      </div>

      {dados.length === 0 ? (
        <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", fontStyle: "italic", padding: "1rem 0" }}>
          Sem vendas registradas ainda.
        </div>
      ) : (
        <div style={{ width: "100%", height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={dados} margin={{ top: 18, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} domain={[0, yMax]} tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} width={28} />
              <Tooltip
                cursor={{ fill: "rgba(127,127,127,0.08)" }}
                content={(props) => {
                  if (!props.active || !props.payload?.length) return null;
                  const d = props.payload[0].payload as Ponto;
                  return (
                    <div style={{ background: "var(--bg-secondary, #fff)", border: "1px solid var(--border)", borderRadius: "0.375rem", padding: "0.4rem 0.6rem", fontSize: "0.72rem", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
                      <div style={{ fontWeight: 700, color: "var(--text)" }}>{String(props.label)}</div>
                      <div style={{ color: "var(--text)" }}>{d.lotes} lote{d.lotes === 1 ? "" : "s"}</div>
                      <div style={{ color: "var(--text-muted)" }}>{formatBRLCompact(d.valor)}</div>
                    </div>
                  );
                }}
              />
              {/* Meta (âmbar tracejada) */}
              <ReferenceLine
                y={META}
                stroke={COR_META}
                strokeDasharray="5 4"
                strokeWidth={1.5}
                label={{ value: `meta ${metaTxt}`, position: "insideBottomRight", fontSize: 10, fill: COR_META }}
              />
              {/* Velocidade atual (azul sólida) */}
              <ReferenceLine
                y={velAtual}
                stroke={COR_ATUAL}
                strokeWidth={2}
                label={{ value: `atual ${velAtual}`, position: "insideTopRight", fontSize: 10, fill: COR_ATUAL }}
              />
              <Bar dataKey="lotes" fill={COR_BARRA} radius={[4, 4, 0, 0]} maxBarSize={56}>
                <LabelList dataKey="lotes" position="top" style={{ fontSize: 11, fill: "var(--text)", fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ fontSize: "0.66rem", color: "var(--text-dim)", marginTop: "0.4rem", lineHeight: 1.4 }}>
        {totalLotes} lote{totalLotes === 1 ? "" : "s"} desde o lançamento. As barras são o realizado por mês comercial;
        a linha <strong style={{ color: COR_ATUAL }}>azul</strong> é o ritmo atual (últimos 30 dias) e a
        <strong style={{ color: COR_META }}> âmbar</strong> é a meta de {metaTxt}/mês pra fechar em {PROJETO.PRAZO_COMERCIALIZACAO_MESES} meses.
      </div>
    </div>
  );
}
