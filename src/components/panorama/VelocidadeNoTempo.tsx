"use client";

/**
 * Panorama — Velocidade de vendas NO TEMPO.
 *
 * Barras EMPILHADAS = lotes vendidos por MÊS DE CALENDÁRIO (Eggs.dataContrato),
 *   quebrados pelo tamanho da venda: 1 lote / 2 lotes / 3+ lotes.
 *   "Venda de N lotes" = N lotes do MESMO comprador (CPF/CNPJ) fechados na MESMA data.
 *   (No ERP cada lote é um registro separado; reconstruímos por comprador+data.)
 *   A legenda é clicável e filtra as categorias.
 * Âmbar = meta (14,5 lotes/mês — ritmo que fecha o projeto no prazo).
 * Azul  = velocidade atual = lotes nos ÚLTIMOS 30 DIAS (mesmo número do card "Velocidade").
 *
 * Fonte única: /api/crm/contratos (já traz clienteCpfCnpj por contrato).
 */
import { useState } from "react";
import useSWR from "swr";
import { BarChart, Bar, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer, CartesianGrid, LabelList } from "recharts";
import { TrendingUp } from "lucide-react";
import LoadingCard from "@/components/shared/LoadingCard";
import { PROJETO, isVenda } from "@/lib/constants/projeto";
import { calcularVelocidade } from "@/lib/calculations/velocidade";
import { getMesComercial, getMesComercialAtual, getProximoMesComercial, dataNoMesComercial } from "@/lib/utils/mesComercial";
import { formatBRLCompact } from "@/lib/utils/formatters";

interface CrmContrato { valor: number; status: string; cancelado: boolean; dataContrato?: string; clienteCpfCnpj?: string }
interface CrmResp { contratos?: CrmContrato[] }

type CatKey = "c1" | "c2" | "c3";
const CATS: { key: CatKey; label: string; cor: string }[] = [
  { key: "c1", label: "1 lote", cor: "#10b981" },   // verde
  { key: "c2", label: "2 lotes", cor: "#8b5cf6" },  // violeta
  { key: "c3", label: "3+ lotes", cor: "#f43f5e" }, // rosa
];
const LABEL_CAT: Record<CatKey, string> = { c1: "1 lote", c2: "2 lotes", c3: "3+ lotes" };
const COR_CAT: Record<CatKey, string> = { c1: "#10b981", c2: "#8b5cf6", c3: "#f43f5e" };

interface Ponto {
  mes: string;
  c1: number;
  c2: number;
  c3: number;
  _total: number;
  _valor: number;
}

const META = PROJETO.VELOCIDADE_ALVO_LOTES_MES;
const metaTxt = META.toFixed(1).replace(".", ",");
const COR_META = "#f59e0b";
const COR_ATUAL = "#3b82f6";

function catKeyDe(n: number): CatKey {
  return n === 1 ? "c1" : n === 2 ? "c2" : "c3";
}

export default function VelocidadeNoTempo() {
  const { data, isLoading } = useSWR<CrmResp>("/api/crm/contratos");
  const [ativos, setAtivos] = useState<Set<CatKey>>(new Set<CatKey>(["c1", "c2", "c3"]));

  if (isLoading || !data) {
    return <LoadingCard height={300} label="Velocidade no tempo" hint="lendo CRM Eggs..." />;
  }

  const contratosVenda = (data.contratos || []).filter(
    (c) => !c.cancelado && isVenda(c.status) && c.dataContrato,
  );

  // Cada lote → { data, valor, cpf }. "Venda de N lotes" = mesmo CPF na mesma data.
  const vendas = contratosVenda.map((c) => ({
    data: c.dataContrato as string,
    valor: Number(c.valor) || 0,
    cpf: (c.clienteCpfCnpj || "").trim(),
  }));
  // Tamanho de cada venda (CPF+data). Sem CPF não dá pra agrupar com confiança → conta como 1 lote.
  const tamanho = new Map<string, number>();
  for (const v of vendas) {
    if (!v.cpf) continue;
    const k = `${v.cpf}|${v.data}`;
    tamanho.set(k, (tamanho.get(k) || 0) + 1);
  }
  const catDe = (v: { cpf: string; data: string }): CatKey =>
    v.cpf ? catKeyDe(tamanho.get(`${v.cpf}|${v.data}`) || 1) : "c1";

  // Velocidade ATUAL = últimos 30 dias (mesma fonte/cálculo do card "Velocidade de Vendas").
  const vel = calcularVelocidade(contratosVenda.map((c) => ({ dataVenda: c.dataContrato as string, valor: Number(c.valor) || 0 })));
  const velAtual = vel.ultimos30d.qtdVendas;
  const deltaPct = META > 0 ? Math.round(((velAtual - META) / META) * 100) : 0;
  const acima = velAtual >= META;

  // Barras: meses de calendário do mês da 1ª venda até o atual.
  const dados: Ponto[] = [];
  if (vendas.length) {
    const minData = vendas.reduce((m, v) => (v.data < m ? v.data : m), vendas[0].data);
    const atual = getMesComercialAtual();
    let mc = getMesComercial(new Date(minData + "T12:00:00"));
    let guard = 0;
    while (mc.inicio.getTime() <= atual.inicio.getTime() && guard < 48) {
      const noMes = vendas.filter((v) => dataNoMesComercial(v.data, mc));
      let c1 = 0, c2 = 0, c3 = 0;
      for (const v of noMes) {
        const k = catDe(v);
        if (k === "c1") c1++; else if (k === "c2") c2++; else c3++;
      }
      dados.push({
        mes: mc.labelCurto,
        c1, c2, c3,
        _total: c1 + c2 + c3,
        _valor: noMes.reduce((s, v) => s + v.valor, 0),
      });
      mc = getProximoMesComercial(mc.inicio);
      guard++;
    }
  }

  // Aplica o filtro da legenda (categoria desligada → conta 0 na barra).
  const dadosRender = dados.map((d) => {
    const c1 = ativos.has("c1") ? d.c1 : 0;
    const c2 = ativos.has("c2") ? d.c2 : 0;
    const c3 = ativos.has("c3") ? d.c3 : 0;
    return { ...d, c1, c2, c3, _total: c1 + c2 + c3 };
  });

  // Totais por categoria (todo o período) — mostrados nos chips do filtro.
  const totCat: Record<CatKey, number> = { c1: 0, c2: 0, c3: 0 };
  for (const d of dados) { totCat.c1 += d.c1; totCat.c2 += d.c2; totCat.c3 += d.c3; }
  const totalLotes = totCat.c1 + totCat.c2 + totCat.c3;

  const yMax = Math.ceil(Math.max(...dadosRender.map((d) => d._total), META, velAtual, 1) * 1.18);

  function toggle(cat: CatKey) {
    setAtivos((prev) => {
      const novo = new Set(prev);
      if (novo.has(cat)) {
        if (novo.size === 1) return prev; // mantém pelo menos 1 ligada
        novo.delete(cat);
      } else {
        novo.add(cat);
      }
      return novo;
    });
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
      {/* Cabeçalho */}
      <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.6rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <TrendingUp size={12} />
        <span>Velocidade no tempo</span>
        <span style={{ marginLeft: "auto", fontSize: "0.7rem", fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--text-dim)" }}>
          lotes por mês
        </span>
      </div>

      {/* Comparação atual × meta */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem", marginBottom: "0.6rem" }}>
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

      {/* Filtro por tamanho da venda (legenda clicável) */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.4rem", marginBottom: "0.875rem" }}>
        <span style={{ fontSize: "0.68rem", color: "var(--text-dim)", marginRight: "0.1rem" }}>tamanho da venda:</span>
        {CATS.map(({ key, label, cor }) => {
          const on = ativos.has(key);
          return (
            <button
              key={key}
              onClick={() => toggle(key)}
              style={{
                display: "inline-flex", alignItems: "center", gap: "0.35rem",
                fontSize: "0.72rem", fontWeight: 600,
                color: on ? cor : "var(--text-dim)",
                background: on ? `${cor}15` : "transparent",
                border: `1px solid ${on ? cor : "var(--border)"}`,
                padding: "0.2rem 0.55rem", borderRadius: "9999px",
                cursor: "pointer", opacity: on ? 1 : 0.55, transition: "all 0.15s",
              }}
              title={on ? `Esconder vendas de ${label}` : `Mostrar vendas de ${label}`}
            >
              <span style={{ width: 8, height: 8, borderRadius: 2, background: cor }} />
              {label} <span style={{ fontWeight: 400, opacity: 0.8 }}>({totCat[key]})</span>
            </button>
          );
        })}
      </div>

      {dados.length === 0 ? (
        <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", fontStyle: "italic", padding: "1rem 0" }}>
          Sem vendas registradas ainda.
        </div>
      ) : (
        <div style={{ width: "100%", height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={dadosRender} margin={{ top: 18, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} domain={[0, yMax]} tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} width={34} />
              <Tooltip
                cursor={{ fill: "rgba(127,127,127,0.08)" }}
                content={(props) => {
                  if (!props.active || !props.payload?.length) return null;
                  const d = props.payload[0].payload as Ponto;
                  return (
                    <div style={{ background: "var(--bg-secondary, #fff)", border: "1px solid var(--border)", borderRadius: "0.375rem", padding: "0.4rem 0.6rem", fontSize: "0.72rem", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
                      <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: "0.15rem" }}>{String(props.label)}</div>
                      {CATS.filter(({ key }) => ativos.has(key) && d[key] > 0).map(({ key, label, cor }) => (
                        <div key={key} style={{ color: cor }}>{label}: {d[key]}</div>
                      ))}
                      <div style={{ color: "var(--text)", fontWeight: 600, marginTop: "0.15rem" }}>{d._total} lote{d._total === 1 ? "" : "s"} no mês</div>
                      <div style={{ color: "var(--text-muted)" }}>{formatBRLCompact(d._valor)}</div>
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
              {/* Barras empilhadas por tamanho da venda; o total fica no topo da pilha. */}
              {CATS.map(({ key, cor }, i) => (
                <Bar key={key} dataKey={key} stackId="lotes" fill={cor} maxBarSize={56}
                  radius={i === CATS.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}>
                  {i === CATS.length - 1 && (
                    <LabelList dataKey="_total" position="top" style={{ fontSize: 11, fill: "var(--text)", fontWeight: 600 }} />
                  )}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ fontSize: "0.66rem", color: "var(--text-dim)", marginTop: "0.4rem", lineHeight: 1.4 }}>
        {totalLotes} lote{totalLotes === 1 ? "" : "s"} desde o lançamento, por mês de calendário. As cores separam o
        <strong> tamanho da venda</strong> (1 / 2 / 3+ lotes do mesmo comprador na mesma data) — clique na legenda pra filtrar.
        A linha <strong style={{ color: COR_ATUAL }}>azul</strong> é o ritmo atual (últimos 30 dias) e a
        <strong style={{ color: COR_META }}> âmbar</strong> é a meta de {metaTxt}/mês pra fechar em {PROJETO.PRAZO_COMERCIALIZACAO_MESES} meses.
      </div>
    </div>
  );
}
