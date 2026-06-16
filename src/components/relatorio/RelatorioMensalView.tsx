"use client";

/**
 * Relatório Mensal Comercial (mês comercial 15 → 14) — view printável.
 *
 * Fontes:
 *  - /api/relatorio?mes=  → núcleo comercial (Eggs): vendas do mês, acumulado/VSO, ranking.
 *    Mês fechado vem CONGELADO (oficial); mês em curso vem ao vivo.
 *  - /api/uau/financeiro + /api/bonus → bloco "estado atual" (inadimplência, recebido,
 *    bônus). É live e rotulado "atual" — o ERP UAU não data pagamentos.
 */
import { useState } from "react";
import useSWR from "swr";
import { Printer } from "lucide-react";
import KpiHero from "@/components/shared/KpiHero";
import LoadingCard from "@/components/shared/LoadingCard";
import { cor, corInadimplencia, type Severidade } from "@/lib/utils/cores";
import { formatBRLCompact, formatBRL, formatPct, formatInt, formatNum, formatData } from "@/lib/utils/formatters";

interface RankingItem { nome: string; lotes: number; vgv: number; ticket: number }
interface Relatorio {
  mesISO: string;
  periodo: { inicioISO: string; fimISO: string; label: string; labelCurto: string };
  congelado: boolean;
  geradoEm: string;
  vendasMes: { lotes: number; vgv: number; ticket: number; meta: number; pctMeta: number; severidade: Severidade; anteriorLotes: number; anteriorVgv: number; deltaLotes: number; deltaVgv: number };
  acumulado: { lotes: number; vgv: number; vgvTotal: number; pctVendido: number; vso: number; vsoEsperado: number; vsoSeveridade: Severidade; ritmoMedioLotesMes: number; mesesParaTermino: number | null; projecaoTerminoISO: string | null; lotesRestantes: number };
  rankingCorretores: RankingItem[];
  rankingImobiliarias: RankingItem[];
  auditoriaDatas: { loteId: string; cliente: string; dataContrato: string; dataEmissao: string; divergente: boolean }[];
}
interface MesDisp { mesISO: string; labelCurto: string; label: string; fechado: boolean }
interface RelatorioResp { relatorio: Relatorio; fechado?: boolean; mesesDisponiveis: MesDisp[]; error?: string }

interface FinanceiroResp {
  inadimplencia?: { percentualInadimplencia: number; totalVencido: number; totalPago: number; qtdClientesInadimplentes: number; qtdParcelasVencidas: number };
}
interface RecebidoMensalResp { porMes?: Record<string, number>; total?: number; parcial?: boolean; vendas?: number }
interface BonusResp { summary?: { aPagarAgora: number; pagoTotal: number; comprometidoTotal: number } }

const PRINT_CSS = `@media print {
  body * { visibility: hidden !important; }
  #relatorio-print, #relatorio-print * { visibility: visible !important; }
  #relatorio-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; }
  .no-print { display: none !important; }
  .rel-secao { break-inside: avoid; }
}`;

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "0.75rem",
  padding: "1.25rem 1.5rem",
};
const secaoTitulo: React.CSSProperties = {
  fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase",
  color: "var(--text-dim)", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem",
};

function deltaLabel(delta: number, fmt: (n: number) => string): { txt: string; sev: Severidade } {
  if (delta > 0) return { txt: `▲ ${fmt(delta)} vs mês anterior`, sev: "verde" };
  if (delta < 0) return { txt: `▼ ${fmt(-delta)} vs mês anterior`, sev: "vermelho" };
  return { txt: `= mesmo do mês anterior`, sev: "cinza" };
}

export default function RelatorioMensalView() {
  const [mesSel, setMesSel] = useState<string>(""); // "" = default (mês que fechou)

  const qs = mesSel ? `?mes=${mesSel}` : "";
  const { data, isLoading, error } = useSWR<RelatorioResp>(`/api/relatorio${qs}`);
  const { data: fin, error: finErr } = useSWR<FinanceiroResp>("/api/uau/financeiro");
  const { data: bonusData } = useSWR<BonusResp>("/api/bonus");
  const { data: receb, error: recebErr } = useSWR<RecebidoMensalResp>("/api/uau/recebido-mensal");

  if (isLoading || !data) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <LoadingCard height={120} label="Relatório comercial" hint="lendo CRM Eggs..." />
        <LoadingCard height={200} label="Vendas do mês" hint="montando o fechamento..." />
      </div>
    );
  }
  if (error || data.error || !data.relatorio) {
    return <div style={{ ...card, color: cor("vermelho").value }}>Não foi possível gerar o relatório agora. Tente recarregar.</div>;
  }

  const r = data.relatorio;
  const meses = data.mesesDisponiveis || [];
  const valorSel = mesSel || r.mesISO;
  const auditoria = r.auditoriaDatas || []; // snapshots antigos podem não ter o campo

  // Selo de estado: oficial congelado / fechado ao vivo (congela quando o storage voltar) / em curso
  const selo = r.congelado
    ? { txt: "OFICIAL · congelado", sev: "verde" as Severidade }
    : data.fechado
      ? { txt: "FECHADO · ao vivo", sev: "amarelo" as Severidade }
      : { txt: "EM CURSO · ao vivo", sev: "cinza" as Severidade };

  // Bônus: acumulado + a pagar (o Excel não guarda a data real do pagamento, então
  // não dá pra recortar "pago no mês" com honestidade — mostramos acumulado).
  const bonusPagoAcum = bonusData?.summary?.pagoTotal ?? null;
  const bonusAPagar = bonusData?.summary?.aPagarAgora ?? null;
  const inad = fin?.inadimplencia;
  const pctInad = inad?.percentualInadimplencia ?? null; // já em pontos percentuais (0.28 = 0,28%)
  const erpForaDoAr = !!finErr && !fin; // ERP UAU indisponível (504/erro)
  const recebMes = receb?.porMes?.[r.mesISO] ?? null; // recebido no mês comercial selecionado

  return (
    <div id="relatorio-print" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <style>{PRINT_CSS}</style>

      {/* ── Cabeçalho + seletor + impressão ── */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, margin: 0 }}>Relatório Comercial</h1>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
            Mês comercial <strong>{r.periodo.label}</strong>
            {"  "}
            <span style={{
              marginLeft: "0.5rem", fontSize: "0.7rem", fontWeight: 700, padding: "0.15rem 0.5rem", borderRadius: "9999px",
              background: cor(selo.sev).bg, color: cor(selo.sev).value,
            }}>
              {selo.txt}
            </span>
          </div>
        </div>
        <div className="no-print" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <select
            value={valorSel}
            onChange={(e) => setMesSel(e.target.value)}
            style={{ padding: "0.5rem 0.75rem", borderRadius: "0.5rem", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "0.85rem" }}
          >
            {meses.map((m) => (
              <option key={m.mesISO} value={m.mesISO}>{m.labelCurto}{m.fechado ? "" : " · em curso"}</option>
            ))}
          </select>
          <button
            onClick={() => window.print()}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.5rem 0.9rem", borderRadius: "0.5rem", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", cursor: "pointer", fontSize: "0.85rem" }}
          >
            <Printer size={15} /> Imprimir / PDF
          </button>
        </div>
      </div>

      {/* ── SEÇÃO 1 — Vendas do mês + meta ── */}
      <div className="rel-secao">
        <div style={secaoTitulo}>1 · Vendas do mês</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.875rem" }}>
          <KpiHero
            label="Lotes vendidos"
            valor={`${r.vendasMes.lotes} lotes`}
            severidade={r.vendasMes.severidade}
            formula={`Vendas com data de contrato dentro de ${r.periodo.label}.\nMeta: ${r.vendasMes.meta} lotes/mês.\nFonte: CRM Eggs (data_contrato).`}
            contexto={`alvo ${formatNum(r.vendasMes.meta)} /mês · ${formatPct(r.vendasMes.pctMeta)} da meta`}
            progresso={r.vendasMes.pctMeta}
            extra={<DeltaLinha {...deltaLabel(r.vendasMes.deltaLotes, (n) => `${formatInt(n)} lote(s)`)} />}
          />
          <KpiHero
            label="VGV do mês"
            valor={formatBRLCompact(r.vendasMes.vgv)}
            formula={`Soma do valor contratado das vendas do mês.\nFonte: CRM Eggs.`}
            contexto={`ticket médio ${formatBRLCompact(r.vendasMes.ticket)}`}
            extra={<DeltaLinha {...deltaLabel(r.vendasMes.deltaVgv, (n) => formatBRLCompact(n))} />}
          />
          <KpiHero
            label="Mês anterior"
            valor={`${r.vendasMes.anteriorLotes} lotes`}
            severidade="cinza"
            formula="Vendas no mês comercial anterior, pra comparação."
            contexto={`${formatBRLCompact(r.vendasMes.anteriorVgv)} de VGV`}
          />
        </div>
      </div>

      {/* ── SEÇÃO 2 — Acumulado + VSO + projeção ── */}
      <div className="rel-secao">
        <div style={secaoTitulo}>2 · Acumulado do projeto (no fechamento)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.875rem" }}>
          <KpiHero
            label="VGV vendido acumulado"
            valor={formatBRLCompact(r.acumulado.vgv)}
            formula={`Soma de todos os contratos válidos até ${formatData(r.periodo.fimISO)}.\nFonte: CRM Eggs.`}
            contexto={`${formatPct(r.acumulado.pctVendido)} de ${formatBRLCompact(r.acumulado.vgvTotal)} · ${r.acumulado.lotes} lotes`}
            progresso={r.acumulado.pctVendido}
          />
          <KpiHero
            label="VSO acumulado"
            valor={formatPct(r.acumulado.vso)}
            severidade={r.acumulado.vsoSeveridade}
            formula={`Vendas firmes / oferta (174 lotes).\nEsperado p/ esta data pela curva de 12 meses: ${formatPct(r.acumulado.vsoEsperado)}.`}
            contexto={`esperado p/ a data ≥ ${formatPct(r.acumulado.vsoEsperado)}`}
          />
          <KpiHero
            label="Ritmo & projeção"
            valor={`${formatNum(r.acumulado.ritmoMedioLotesMes)} /mês`}
            severidade={r.acumulado.ritmoMedioLotesMes >= r.vendasMes.meta ? "verde" : r.acumulado.ritmoMedioLotesMes >= r.vendasMes.meta * 0.7 ? "amarelo" : "vermelho"}
            formula={`Ritmo médio desde o lançamento.\nRestam ${r.acumulado.lotesRestantes} lotes.`}
            contexto={r.acumulado.projecaoTerminoISO
              ? `término projetado ${formatData(r.acumulado.projecaoTerminoISO)} (${formatNum(r.acumulado.mesesParaTermino ?? 0)} meses)`
              : "sem vendas pra projetar"}
          />
        </div>
      </div>

      {/* ── SEÇÃO 3 — Ranking ── */}
      <div className="rel-secao">
        <div style={secaoTitulo}>3 · Ranking do mês</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "0.875rem" }}>
          <TabelaRanking titulo="Corretores" itens={r.rankingCorretores} />
          <TabelaRanking titulo="Imobiliárias" itens={r.rankingImobiliarias} />
        </div>
      </div>

      {/* ── SEÇÃO 4 — Financeiro (estado atual) ── */}
      <div className="rel-secao">
        <div style={secaoTitulo}>4 · Financeiro <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--text-muted)" }}>· estado atual</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.875rem" }}>
          <KpiHero
            label="Inadimplência atual"
            valor={erpForaDoAr ? "indisponível" : pctInad === null ? "…" : `${formatNum(pctInad, 2)}%`}
            severidade={erpForaDoAr ? "cinza" : pctInad === null ? "cinza" : corInadimplencia(pctInad / 100)}
            formula="Parcelas vencidas / total a receber (estado de hoje).\nFonte: ERP UAU."
            contexto={erpForaDoAr ? "ERP UAU fora do ar agora — recarregue em instantes" : inad ? `${formatInt(inad.qtdClientesInadimplentes)} cliente(s) · ${formatInt(inad.qtdParcelasVencidas)} parcela(s)` : "lendo ERP UAU (pode levar até 60s)..."}
          />
          <KpiHero
            label="Recebido no mês"
            valor={recebErr ? "indisponível" : recebMes === null ? "…" : formatBRLCompact(recebMes)}
            formula={`Pagamentos de parcelas com data de recebimento dentro de ${r.periodo.label}.\nFonte: ERP UAU (Venda/BuscarParcelasRecebidas — Data_Rec).`}
            contexto={recebErr ? "ERP UAU fora do ar agora" : receb?.total != null ? `recebido total (acum.): ${formatBRLCompact(receb.total)}${receb.parcial ? " · parcial" : ""}` : "somando recebimentos (pode levar ~30s)..."}
          />
          <KpiHero
            label="Bônus pago (acumulado)"
            valor={bonusPagoAcum === null ? "…" : formatBRLCompact(bonusPagoAcum)}
            formula={"Total de bônus baixado como pago, acumulado.\nFonte: você digita \"pago\" na célula do Excel → o dashboard importa.\nO Excel não guarda a DATA do pagamento, então não há recorte mensal confiável."}
            contexto={bonusAPagar !== null ? `a pagar agora: ${formatBRLCompact(bonusAPagar)}` : ""}
          />
        </div>
      </div>

      {/* ── SEÇÃO 5 — Datas das vendas (conferência) ── */}
      {auditoria.length > 0 && (() => {
        const divergentes = auditoria.filter((a) => a.divergente).length;
        return (
          <div className="rel-secao" style={card}>
            <div style={secaoTitulo}>5 · Datas das vendas (conferência)</div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
              Todas as vendas que tocam o mês, com <strong>data do contrato</strong> e <strong>data de emissão</strong>.
              {divergentes > 0 ? (
                <> <strong style={{ color: cor("amarelo").value }}>{divergentes} em destaque</strong> têm as duas datas em
                meses comerciais diferentes — a escolha da data muda em que mês a venda entra. Confira se a <code>data_contrato</code>
                no Eggs é a <strong>data em que o comprador assinou</strong>.</>
              ) : (
                <> Nenhuma divergência de mês — todas batem.</>
              )}
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
              <thead>
                <tr style={{ color: "var(--text-dim)", textAlign: "left" }}>
                  <th style={{ padding: "0.3rem 0.4rem", fontWeight: 600 }}>Lote</th>
                  <th style={{ padding: "0.3rem 0.4rem", fontWeight: 600 }}>Cliente</th>
                  <th style={{ padding: "0.3rem 0.4rem", fontWeight: 600, textAlign: "right" }}>Data contrato</th>
                  <th style={{ padding: "0.3rem 0.4rem", fontWeight: 600, textAlign: "right" }}>Data emissão</th>
                </tr>
              </thead>
              <tbody>
                {auditoria.map((a, i) => (
                  <tr key={a.loteId + i} style={{ borderTop: "1px solid var(--border)", background: a.divergente ? cor("amarelo").bg : undefined }}>
                    <td style={{ padding: "0.4rem", fontWeight: 600 }}>
                      {a.divergente && <span title="datas em meses diferentes" style={{ color: cor("amarelo").value }}>⚠ </span>}{a.loteId}
                    </td>
                    <td style={{ padding: "0.4rem" }}>{a.cliente || "—"}</td>
                    <td style={{ padding: "0.4rem", textAlign: "right" }}>{formatData(a.dataContrato)}</td>
                    <td style={{ padding: "0.4rem", textAlign: "right", color: "var(--text-muted)" }}>{formatData(a.dataEmissao)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* ── Rodapé ── */}
      <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", textAlign: "right", marginTop: "0.5rem" }}>
        {r.congelado ? "Comercial congelado" : "Comercial ao vivo"} · gerado {formatData(r.geradoEm.split("T")[0])} · mês comercial 15→14 · data da venda = data_contrato (Eggs)
      </div>
    </div>
  );
}

function DeltaLinha({ txt, sev }: { txt: string; sev: Severidade }) {
  return <div style={{ fontSize: "0.72rem", color: cor(sev).value, fontWeight: 600 }}>{txt}</div>;
}

function TabelaRanking({ titulo, itens }: { titulo: string; itens: RankingItem[] }) {
  return (
    <div style={card}>
      <div style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.75rem" }}>{titulo}</div>
      {itens.length === 0 ? (
        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Sem vendas no mês.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
          <thead>
            <tr style={{ color: "var(--text-dim)", textAlign: "left" }}>
              <th style={{ padding: "0.3rem 0", fontWeight: 600 }}>Nome</th>
              <th style={{ padding: "0.3rem 0", fontWeight: 600, textAlign: "right" }}>Lotes</th>
              <th style={{ padding: "0.3rem 0", fontWeight: 600, textAlign: "right" }}>VGV</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((it, i) => (
              <tr key={it.nome + i} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "0.4rem 0" }}>{it.nome}</td>
                <td style={{ padding: "0.4rem 0", textAlign: "right" }}>{it.lotes}</td>
                <td style={{ padding: "0.4rem 0", textAlign: "right" }}>{formatBRLCompact(it.vgv)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
