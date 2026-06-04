"use client";

/**
 * Panorama — Velocidade de vendas NO TEMPO.
 * Barras de lotes vendidos por mês comercial + linha de meta (14,5/mês).
 * Fonte: /api/crm/contratos (Eggs.dataContrato). Mês comercial vai do dia 15 ao 14.
 */
import useSWR from "swr";
import { BarChart, Bar, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer, CartesianGrid, LabelList } from "recharts";
import { TrendingUp } from "lucide-react";
import LoadingCard from "@/components/shared/LoadingCard";
import { PROJETO, isVenda } from "@/lib/constants/projeto";
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

export default function VelocidadeNoTempo() {
  const { data, isLoading } = useSWR<CrmResp>("/api/crm/contratos");

  if (isLoading || !data) {
    return <LoadingCard height={280} label="Velocidade no tempo" hint="lendo CRM Eggs..." />;
  }

  const vendas = (data.contratos || [])
    .filter((c) => !c.cancelado && isVenda(c.status) && c.dataContrato)
    .map((c) => ({ data: c.dataContrato as string, valor: Number(c.valor) || 0 }));

  // Meses comerciais do mês da 1ª venda até o atual.
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

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
      <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <TrendingUp size={12} />
        <span>Velocidade no tempo</span>
        <span style={{ marginLeft: "auto", fontSize: "0.7rem", fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--text-dim)" }}>
          lotes por mês comercial · meta {metaTxt}/mês
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
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} width={28} />
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
              <ReferenceLine
                y={META}
                stroke="#f59e0b"
                strokeDasharray="5 4"
                strokeWidth={1.5}
                label={{ value: `meta ${metaTxt}`, position: "insideTopRight", fontSize: 10, fill: "#f59e0b" }}
              />
              <Bar dataKey="lotes" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={56}>
                <LabelList dataKey="lotes" position="top" style={{ fontSize: 11, fill: "var(--text)", fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ fontSize: "0.66rem", color: "var(--text-dim)", marginTop: "0.4rem" }}>
        {totalLotes} lote{totalLotes === 1 ? "" : "s"} desde o lançamento · a linha tracejada é a meta de {metaTxt}/mês pra fechar em {PROJETO.PRAZO_COMERCIALIZACAO_MESES} meses.
      </div>
    </div>
  );
}
