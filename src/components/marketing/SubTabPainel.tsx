"use client";

/**
 * Sub-tab Marketing > Painel.
 *
 * Fonte única: /api/marketing-offline (lê Cenario_Marketing.xlsx do OneDrive).
 *
 * Contém:
 *  - 5 KPIs topo (VGV, Budget, Velocidade alvo, CAC alvo, Prazo)
 *  - Bloco "Orçamento vs Realizado" (Budget / Realizado / Saldo / Eventos)
 *  - Gráfico Plano vs Realizado mensal (18 meses)
 *  - Gastos por Grupo (lista horizontal ordenada)
 *  - Tabela Eventos
 *  - Lista Não-Eventos
 */
import useSWR from "swr";
import { Megaphone, DollarSign, Target, Calendar, Award } from "lucide-react";
import KpiMedium from "@/components/shared/KpiMedium";
import LoadingCard from "@/components/shared/LoadingCard";
import { formatBRL, formatBRLCompact, formatPct, formatData, truncate } from "@/lib/utils/formatters";
import { corMetaInversa } from "@/lib/utils/cores";
import { PROJETO } from "@/lib/constants/projeto";

interface Premissas {
  vgv: number;
  budgetMarketing: number;
  velocidadeAlvo: number;
  cacMaximo: number;
  prazoComercializacaoMeses: number;
  totalLotes: number;
}
interface PlanoMes {
  mes: string;
  mesIdx: number;
  planoEfetivo: number;
  realizado: number;
  saldo: number;
  pctConsumido: number;
}
interface ResumoGrupo {
  grupo: string;
  totalGasto: number;
  pctOrcamento: number;
}
interface Evento {
  centroCusto: string;
  tipo: string;
  data: string;
  status: string;
  totalGasto: number;
}
interface NaoEvento {
  centroCusto: string;
  totalGasto: number;
}
interface MktResp {
  premissas?: Premissas;
  totalRealizado?: number;
  pctBudgetConsumido?: number;
  planoMensal?: PlanoMes[];
  resumoPorGrupo?: ResumoGrupo[];
  eventos?: Evento[];
  naoEventos?: NaoEvento[];
  fetchedAt?: string;
}

export default function SubTabPainel() {
  const { data, isLoading } = useSWR<MktResp>("/api/marketing-offline");

  if (isLoading || !data || !data.premissas) {
    return <LoadingCard height={400} label="Carregando painel de marketing" hint="lendo Cenario_Marketing.xlsx do OneDrive (~3s)" />;
  }

  const p = data.premissas;
  const realizado = data.totalRealizado ?? 0;
  const pctBudget = data.pctBudgetConsumido ?? 0;
  const saldo = p.budgetMarketing - realizado;
  const eventosRealizados = (data.eventos || []).filter((e) => e.status === "Realizado");
  const totalEventos = (data.eventos || []).reduce((s, e) => s + e.totalGasto, 0);
  const totalNaoEventos = (data.naoEventos || []).reduce((s, e) => s + e.totalGasto, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* 5 KPIs topo */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0.625rem" }}>
        <KpiMedium
          label="VGV planejado"
          valor={formatBRLCompact(p.vgv)}
          formula={`VGV Inicial sem ganho de salto.\nFonte: aba PREMISSAS da planilha.`}
          contexto={`${p.totalLotes} lotes`}
          icon={<DollarSign size={11} style={{ color: "var(--text-dim)" }} />}
        />
        <KpiMedium
          label="Budget MKT total"
          valor={formatBRLCompact(p.budgetMarketing)}
          formula={`2% do VGV inicial. Distribuído ao longo dos ${p.prazoComercializacaoMeses} meses.\nMensal alvo: ${formatBRLCompact(p.budgetMarketing / p.prazoComercializacaoMeses)}.`}
          contexto={`${formatBRLCompact(p.budgetMarketing / p.prazoComercializacaoMeses)}/mês`}
          icon={<Megaphone size={11} style={{ color: "var(--text-dim)" }} />}
        />
        <KpiMedium
          label="CAC máximo aceitável"
          valor={formatBRLCompact(p.cacMaximo)}
          formula={`Budget total ÷ lotes vendáveis = ${formatBRL(p.budgetMarketing)} ÷ ${p.totalLotes}.\nValor máximo aceitável por lote vendido.`}
          icon={<Target size={11} style={{ color: "var(--text-dim)" }} />}
        />
        {/* Meta OFICIAL = constante do projeto (decisão do Felipe: 14,5/mês, 12 meses).
            Se a planilha PREMISSAS divergir, avisa pra atualizar lá. */}
        <KpiMedium
          label="Velocidade alvo"
          valor={`${PROJETO.VELOCIDADE_ALVO_LOTES_MES.toFixed(1)}/mês`}
          formula={`OFICIAL do projeto: ${PROJETO.LOTES_VENDAVEIS} lotes ÷ ${PROJETO.PRAZO_COMERCIALIZACAO_MESES} meses.${Math.abs(p.velocidadeAlvo - PROJETO.VELOCIDADE_ALVO_LOTES_MES) > 0.05 ? `\n⚠ Planilha PREMISSAS diz ${p.velocidadeAlvo.toFixed(1)}/mês — atualizar lá pra alinhar.` : ""}`}
          contexto={Math.abs(p.velocidadeAlvo - PROJETO.VELOCIDADE_ALVO_LOTES_MES) > 0.05 ? `⚠ planilha: ${p.velocidadeAlvo.toFixed(1)}/mês` : `${PROJETO.PRAZO_COMERCIALIZACAO_MESES} meses pra esgotar`}
          icon={<Target size={11} style={{ color: "var(--text-dim)" }} />}
        />
        <KpiMedium
          label="Prazo comercial"
          valor={`${PROJETO.PRAZO_COMERCIALIZACAO_MESES} meses`}
          formula={`OFICIAL do projeto (decisão: fechar em 12 meses).${p.prazoComercializacaoMeses !== PROJETO.PRAZO_COMERCIALIZACAO_MESES ? `\n⚠ Planilha PREMISSAS diz ${p.prazoComercializacaoMeses} meses — atualizar lá pra alinhar.` : ""}`}
          contexto={p.prazoComercializacaoMeses !== PROJETO.PRAZO_COMERCIALIZACAO_MESES ? `⚠ planilha: ${p.prazoComercializacaoMeses}m` : undefined}
          icon={<Calendar size={11} style={{ color: "var(--text-dim)" }} />}
        />
      </div>

      {/* Orçamento vs Realizado */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
        <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.875rem" }}>
          Orçamento × Realizado · acumulado
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", alignItems: "baseline" }}>
          <div>
            <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "0.2rem" }}>Budget total</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--text)" }}>{formatBRLCompact(p.budgetMarketing)}</div>
          </div>
          <div>
            <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "0.2rem" }}>Realizado</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 700, color: corMetaInversa(pctBudget, 1) === "verde" ? "#10b981" : corMetaInversa(pctBudget, 1) === "amarelo" ? "#f59e0b" : "#dc2626" }}>
              {formatBRLCompact(realizado)}
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{formatPct(pctBudget)} do budget</div>
          </div>
          <div>
            <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "0.2rem" }}>Saldo restante</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--text)" }}>{formatBRLCompact(saldo)}</div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{formatPct(saldo / p.budgetMarketing)} disponível</div>
          </div>
          <div>
            <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "0.2rem" }}>Eventos</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--text)" }}>{formatBRLCompact(totalEventos)}</div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{eventosRealizados.length} realizados · {data.eventos?.length || 0} total</div>
          </div>
        </div>

        {/* Barra de progresso */}
        <div style={{ marginTop: "1rem", height: "10px", background: "var(--border)", borderRadius: "9999px", overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${Math.min(100, pctBudget * 100)}%`,
            background: pctBudget > 0.9 ? "#dc2626" : pctBudget > 0.7 ? "#f59e0b" : "#10b981",
            transition: "width 0.4s ease",
          }} />
        </div>
      </div>

      {/* Plano vs Realizado mensal */}
      <PlanoVsRealizado planoMensal={data.planoMensal || []} />

      {/* Gastos por Grupo */}
      {data.resumoPorGrupo && data.resumoPorGrupo.length > 0 && (
        <GastosPorGrupo grupos={data.resumoPorGrupo} budget={p.budgetMarketing} />
      )}

      {/* Eventos + Não-Eventos lado a lado */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1rem" }}>
        <Eventos eventos={data.eventos || []} totalEventos={totalEventos} />
        <NaoEventos lista={data.naoEventos || []} totalNaoEventos={totalNaoEventos} />
      </div>

      {/* Rodapé com info de sync */}
      <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", textAlign: "right", fontStyle: "italic" }}>
        fonte: Cenario_Marketing.xlsx · sync {data.fetchedAt ? new Date(data.fetchedAt).toLocaleString("pt-BR") : "—"}
      </div>
    </div>
  );
}

// ─── Sub-componentes ─────────────────────────────────────────────────────
function PlanoVsRealizado({ planoMensal }: { planoMensal: { mes: string; planoEfetivo: number; realizado: number; pctConsumido: number }[] }) {
  if (planoMensal.length === 0) return null;

  const max = Math.max(...planoMensal.map((m) => Math.max(m.planoEfetivo, m.realizado)));
  const visiveis = planoMensal.slice(0, 12); // 12 primeiros meses

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
      <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.875rem" }}>
        Plano × Realizado · mensal
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {visiveis.map((m) => (
          <div key={m.mes} style={{ display: "grid", gridTemplateColumns: "60px 1fr 130px", gap: "0.625rem", alignItems: "center" }}>
            <div style={{ fontSize: "0.7rem", color: "var(--text)", fontWeight: 600 }}>{m.mes}</div>
            <div aria-hidden style={{ height: "18px", background: "var(--border)", borderRadius: "0.25rem", overflow: "hidden", position: "relative" }}>
              {/* Plano (azul) */}
              <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: `${(m.planoEfetivo / max) * 100}%`, background: "#4285f455", borderRadius: "0.25rem" }} />
              {/* Realizado (verde) por cima */}
              <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: `${(m.realizado / max) * 100}%`, background: "#10b981", borderRadius: "0.25rem" }} />
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
              {formatBRLCompact(m.realizado)} / {formatBRLCompact(m.planoEfetivo)}
              {m.pctConsumido > 0 && <span style={{ color: m.pctConsumido > 1 ? "#dc2626" : "#10b981", fontWeight: 600, marginLeft: "0.3rem" }}>{formatPct(m.pctConsumido)}</span>}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: "1rem", justifyContent: "center", marginTop: "0.75rem", fontSize: "0.7rem", color: "var(--text-muted)" }}>
        <span><span style={{ display: "inline-block", width: "10px", height: "10px", background: "#4285f455", borderRadius: "2px", marginRight: "0.3rem" }} />Plano</span>
        <span><span style={{ display: "inline-block", width: "10px", height: "10px", background: "#10b981", borderRadius: "2px", marginRight: "0.3rem" }} />Realizado</span>
      </div>
    </div>
  );
}

function GastosPorGrupo({ grupos, budget }: { grupos: ResumoGrupo[]; budget: number }) {
  const sortedGrupos = [...grupos].sort((a, b) => b.totalGasto - a.totalGasto);
  const max = sortedGrupos[0]?.totalGasto || 1;
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
      <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.875rem" }}>
        Gastos por grupo do plano MKT
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {sortedGrupos.map((g) => (
          <div key={g.grupo} style={{ display: "grid", gridTemplateColumns: "minmax(180px, 240px) 1fr 110px", gap: "0.625rem", alignItems: "center" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text)" }}>{truncate(g.grupo, 30)}</div>
            <div aria-hidden style={{ height: "14px", background: "var(--border)", borderRadius: "0.25rem", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(g.totalGasto / max) * 100}%`, background: "#10b981", borderRadius: "0.25rem" }} />
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textAlign: "right" }}>
              {formatBRLCompact(g.totalGasto)} <span style={{ color: "var(--text-dim)" }}>· {formatPct(g.totalGasto / budget)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Eventos({ eventos, totalEventos }: { eventos: Evento[]; totalEventos: number }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <Award size={12} /> Eventos · {eventos.length}
        </div>
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>{formatBRLCompact(totalEventos)}</div>
      </div>
      {eventos.length === 0 ? (
        <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Nenhum evento registrado.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: "0.75rem", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--text-dim)", fontSize: "0.65rem", textTransform: "uppercase", fontWeight: 600 }}>
                <th style={{ padding: "0.4rem 0.2rem" }}>Evento</th>
                <th style={{ padding: "0.4rem 0.2rem" }}>Data</th>
                <th style={{ padding: "0.4rem 0.2rem" }}>Status</th>
                <th style={{ padding: "0.4rem 0.2rem", textAlign: "right" }}>Gasto</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((e) => (
                <tr key={e.centroCusto} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.4rem 0.2rem", color: "var(--text)", fontWeight: 600 }}>
                    {truncate(e.centroCusto, 24)}
                    <div style={{ fontSize: "0.65rem", color: "var(--text-dim)" }}>{e.tipo}</div>
                  </td>
                  <td style={{ padding: "0.4rem 0.2rem", color: "var(--text-muted)" }}>{e.data ? formatData(e.data) : "—"}</td>
                  <td style={{ padding: "0.4rem 0.2rem" }}>
                    <span style={{
                      fontSize: "0.6rem", fontWeight: 700, padding: "0.1rem 0.4rem", borderRadius: "9999px",
                      background: e.status === "Realizado" ? "#10b98115" : "#f59e0b15",
                      color: e.status === "Realizado" ? "#10b981" : "#f59e0b",
                    }}>{e.status}</span>
                  </td>
                  <td style={{ padding: "0.4rem 0.2rem", textAlign: "right", color: "var(--text)", fontWeight: 600 }}>{formatBRLCompact(e.totalGasto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NaoEventos({ lista, totalNaoEventos }: { lista: NaoEvento[]; totalNaoEventos: number }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>Não-Eventos</div>
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>{formatBRLCompact(totalNaoEventos)}</div>
      </div>
      {lista.length === 0 ? (
        <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>—</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {lista.map((n) => (
            <div key={n.centroCusto} style={{ display: "flex", justifyContent: "space-between", padding: "0.4rem 0.5rem", background: "var(--bg-secondary, #fff)", borderRadius: "0.375rem" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--text)" }}>{n.centroCusto}</span>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600 }}>{formatBRLCompact(n.totalGasto)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
