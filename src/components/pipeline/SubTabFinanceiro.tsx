"use client";

/**
 * Sub-tab Pipeline > Financeiro & Bônus.
 *
 *  - 3 perspectivas de valor (Tabela / Contratado / Total c/ Juros)
 *  - Inadimplência POR CLIENTE (não por parcela)
 *  - Lista de bônus com checkbox "Marcar como pago" + data + observação
 *  - Exclui Eggs da listagem de bônus
 *  - REMOVE "Projeção de Inadimplência" (era fake)
 */
import { useState, useMemo } from "react";
import useSWR, { mutate as mutateGlobal } from "swr";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import { DollarSign, AlertTriangle, Award, CheckCircle2, ChevronRight, Wallet } from "lucide-react";
import BonusDrawer, { type PlanoPagamento } from "./BonusDrawer";
import PagamentosPixDrawer from "./PagamentosPixDrawer";
import BonusPagosDrawer from "./BonusPagosDrawer";
import { authFetch } from "@/lib/client-auth";
import { FATOR_MANGABA } from "@/lib/constants/negocio";
import KpiMedium from "@/components/shared/KpiMedium";
import KpiSmall from "@/components/shared/KpiSmall";
import { SkeletonCard } from "@/components/shared/Skeleton";
import LoadingCard from "@/components/shared/LoadingCard";
import { formatBRL, formatBRLCompact, formatPct, formatData, truncate } from "@/lib/utils/formatters";
import { calcularInadimplencia } from "@/lib/calculations/inadimplencia";
import { corInadimplencia } from "@/lib/utils/cores";

// ─── Tipos ─────────────────────────────────────────────────────────────────
interface ValoresAgregados {
  tabelaUAU: number;
  contratoEggs: number;
  valorPrincipalErp?: number;
  liquidoMangaba?: number;
  comissoesEstimadas?: number;
  totalAPagarComJuros: number;
  ganhoSalto: number;
  pctGanhoSalto: number;
  jurosFinanciamento: number;
  qtdVendasComJuros: number;
}
interface ParcelaAReceber {
  identificadorUnidade: string;
  chaveVenda: string;
  numeroParcela: number;
  dataVencimento: string;
  valor: number;
  diasAtraso: number;
  tipoParcela?: string;
  status: "em_dia" | "vencida";
  clienteCodigo?: number;
  clienteNome?: string;
}
interface FinancResp {
  valorVendidoTotal?: number;
  qtdVendas?: number;
  valoresAgregados?: ValoresAgregados;
  inadimplencia?: { totalEmDia?: number; percentualInadimplencia?: number };
  parcelasAReceber?: ParcelaAReceber[];
}
interface BonusItem {
  chaveVenda: string;
  loteId: string;
  valorContratado: number;
  corretorNome: string;
  corretorCpf: string;
  corretorCreci: string;
  imobiliariaRazaoSocial: string;
  imobiliariaNomeFantasia: string;
  entradaQtdTotal: number;
  entradaQtdPaga: number;
  entradaValorTotal: number;
  entradaValorPago: number;
  entradaQuitada: boolean;
  valorRecebido?: number;
  metaAutorizado?: number;
  autorizado?: boolean;
  valorCorretora: number;
  valorImobiliaria: number;
  valorTotal: number;
  status: string;
  pagamento: {
    pagoCorretora: boolean;
    dataPagoCorretora: string;
    pagoImobiliaria: boolean;
    dataPagoImobiliaria: string;
    observacao?: string;
    isento?: boolean;
    liberadoManual?: boolean;
  };
  clienteNome: string;
}
interface BonusResp {
  summary?: {
    qtdAPagar?: number; qtdPagoTotal?: number; qtdPagoParcial?: number; qtdAguardandoEntrada?: number;
    aPagarAgora?: number; pagoTotal?: number; aguardandoEntrada?: number;
    comprometidoTotal?: number;
  };
  bonus?: BonusItem[];
  completo?: boolean; // false = ERP UAU falhou parcialmente — dado pode estar incompleto
}

const NOMES_IMOBILIARIA = ["EGGS", "GESTÃO", "GESTAO", "INTELIGENCIA EM VENDAS"];
function isImobiliaria(nome: string): boolean {
  const upper = (nome || "").toUpperCase();
  return NOMES_IMOBILIARIA.some((n) => upper.includes(n));
}

interface CrmContratosRespMin { contratos?: { loteId: string; valor: number; cliente: string; corretor?: { nome: string }; clienteTelefone?: string; cancelado?: boolean; status?: string; statusOriginal?: string; planoPagamento?: PlanoPagamento }[] }

export default function SubTabFinanceiro() {
  const { data: financ, isLoading: lF } = useSWR<FinancResp>("/api/uau/financeiro");
  const { data: bonus, isLoading: lB } = useSWR<BonusResp>("/api/bonus");
  const { data: crm, isLoading: lC } = useSWR<CrmContratosRespMin>("/api/crm/contratos");
  const { data: histInad } = useSWR<{ dias?: { data: string; pct: number; totalVencido: number }[] }>("/api/inadimplencia-historico");

  // Só bloqueia a tela toda no que é RÁPIDO (bônus + CRM). O financeiro do UAU é lento
  // (cold start 30-57s) e carrega numa seção própria — não segura mais a lista de bônus.
  if (lB || lC || !bonus || !crm) {
    return <LoadingCard height={400} label="Carregando bônus" hint="Lendo CRM Eggs e bônus..." />;
  }

  // Mapa loteId → nome do cliente (vem do Eggs CRM, mais confiável que UAU)
  const clientePorLote = new Map<string, { cliente: string; corretor?: string }>();
  for (const c of crm?.contratos || []) {
    clientePorLote.set(c.loteId, { cliente: c.cliente, corretor: c.corretor?.nome });
  }

  // ── Inadimplência agregada POR CLIENTE ──
  const parcelas = financ?.parcelasAReceber || [];
  const vencidas = parcelas.filter((p) => p.status === "vencida");
  const inad = calcularInadimplencia({
    parcelasVencidas: vencidas.map((p) => ({
      identificadorUnidade: p.identificadorUnidade,
      chaveVenda: p.chaveVenda,
      numeroParcela: p.numeroParcela,
      dataVencimento: p.dataVencimento,
      valor: p.valor,
      diasAtraso: p.diasAtraso,
      tipoParcela: p.tipoParcela || "",
      clienteCodigo: p.clienteCodigo || 0,
      // Prioridade: 1) nome do Eggs (via loteId), 2) clienteNome do UAU, 3) fallback código
      clienteNome: clientePorLote.get(p.identificadorUnidade)?.cliente
                 || p.clienteNome
                 || `Cliente ${p.clienteCodigo || "?"}`,
    })),
    totalAbertoEmDia: financ?.inadimplencia?.totalEmDia || 0,
  });

  const va = financ?.valoresAgregados;
  const bs = bonus?.summary;
  const planoPorLote = new Map<string, PlanoPagamento>();
  for (const c of crm?.contratos || []) if (c.planoPagamento) planoPorLote.set(c.loteId, c.planoPagamento);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* ════ FINANCEIRO ════ */}
      <section>
        <h2 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <DollarSign size={14} /> Financeiro
        </h2>

        {(lF || !financ) ? (
          <LoadingCard height={300} label="Carregando financeiro" hint="ERP UAU pode levar até 40s no primeiro acesso. (Os bônus abaixo já estão prontos.)" />
        ) : (
        <>
        {/* VGV Total (Eggs ASSINADO) + VGV Mangaba (ERP UAU, só lançado) */}
        {(() => {
          // VGV Total = só vendas ASSINADAS no Eggs (não conta ENVIADO PARA ASSINATURA)
          const STATUS_VENDA = ["ASSINADO", "FATURADO", "ENTREGUE AO INCORPORADOR"];
          const vendasAssinadas = (crm?.contratos || []).filter(
            (c) => !c.cancelado && STATUS_VENDA.includes((c.statusOriginal || c.status || "").toUpperCase().trim())
          );
          const qtdAssinadas = vendasAssinadas.length;
          const qtdEmAssinatura = (crm?.contratos || []).filter(
            (c) => !c.cancelado && (c.statusOriginal || "").toUpperCase().trim() === "ENVIADO PARA ASSINATURA"
          ).length;
          const vgvTotal = vendasAssinadas.reduce((s, c) => s + (c.valor || 0), 0);

          // VGV Mangaba = SÓ ERP UAU (= valorPrincipal total, sem estimativas)
          // Fallback: se o backend ainda não tem o campo (cache antigo), estima por FATOR_MANGABA
          const vgvMangaba = (va?.valorPrincipalErp && va.valorPrincipalErp > 0)
            ? va.valorPrincipalErp
            : (va?.contratoEggs ?? vgvTotal) * FATOR_MANGABA;
          const qtdUau = financ?.qtdVendas ?? 0;

          // Vendas ASSINADAS no Eggs mas não lançadas no UAU
          const assinadasSemUau = qtdAssinadas - qtdUau;
          const valorAssinadasSemUau = vgvTotal - (vendasAssinadas
            .filter((c) => {
              // Filtra os que estão no UAU
              return true; // simplificação — falar abaixo no aviso
            }).length > 0 ? 0 : 0);

          const ticketTotal = qtdAssinadas > 0 ? vgvTotal / qtdAssinadas : 0;
          const ticketMangaba = qtdUau > 0 ? vgvMangaba / qtdUau : 0;

          return (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem", marginBottom: "0.875rem" }}>
              <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
                Valor das vendas
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1.5rem", alignItems: "baseline" }}>
                {/* VGV TOTAL — só ASSINADO Eggs */}
                <div>
                  <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "0.25rem" }}>
                    VGV Total (contratado)
                  </div>
                  <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>
                    {formatBRLCompact(vgvTotal)}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>
                    {qtdAssinadas} venda{qtdAssinadas === 1 ? "" : "s"} ASSINADA{qtdAssinadas === 1 ? "" : "s"} no Eggs · ticket {formatBRLCompact(ticketTotal)}
                  </div>
                </div>

                {/* VGV MANGABA — só ERP UAU */}
                <div>
                  <div style={{ fontSize: "0.65rem", color: "#10b981", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "0.25rem" }}>
                    VGV Mangaba ★
                  </div>
                  <div style={{ fontSize: "2rem", fontWeight: 700, color: "#10b981", lineHeight: 1 }}>
                    {formatBRLCompact(vgvMangaba)}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>
                    {qtdUau} venda{qtdUau === 1 ? "" : "s"} no ERP UAU · ticket {formatBRLCompact(ticketMangaba)}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginTop: "0.2rem", fontStyle: "italic" }}>
                    principal sem juros (líquido confirmado pelo financeiro)
                  </div>
                </div>
              </div>

              {/* Avisos contextuais */}
              {assinadasSemUau > 0 && (
                <div style={{ marginTop: "0.875rem", padding: "0.5rem 0.75rem", background: "#f59e0b15", border: "1px solid #f59e0b40", borderRadius: "0.375rem", fontSize: "0.72rem", color: "var(--text-muted)" }}>
                  ⚠ <strong style={{ color: "#f59e0b" }}>{assinadasSemUau} venda{assinadasSemUau > 1 ? "s" : ""} ASSINADA{assinadasSemUau > 1 ? "s" : ""}</strong> no Eggs ainda não foi lançada no ERP UAU. Quando o financeiro atualizar (cron diário 4h), o VGV Mangaba sobe automaticamente.
                </div>
              )}
              {qtdEmAssinatura > 0 && (
                <div style={{ marginTop: "0.5rem", padding: "0.5rem 0.75rem", background: "#4285f415", border: "1px solid #4285f440", borderRadius: "0.375rem", fontSize: "0.72rem", color: "var(--text-muted)" }}>
                  💡 <strong style={{ color: "#4285f4" }}>{qtdEmAssinatura} contrato{qtdEmAssinatura > 1 ? "s" : ""}</strong> em "Enviado para Assinatura" — ainda não conta{qtdEmAssinatura > 1 ? "m" : ""} como venda firme. Vê detalhes na aba <a href="/pipeline?tab=contratos" style={{ color: "#4285f4", textDecoration: "underline" }}>Contratos</a>.
                </div>
              )}
            </div>
          );
        })()}

        {/* Inadimplência */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Inadimplência (agregada por cliente)
            </div>
            <KpiMedium
              label="% inadimplência"
              valor={formatPct(inad.percentual)}
              severidade={inad.severidade}
              formula={`Total vencido / total aberto = ${formatBRLCompact(inad.totalVencido)} / ${formatBRLCompact(inad.totalAberto)}.\nVerde até 3% · amarelo 3-5% · vermelho >5%.`}
              contexto={`${inad.qtdClientesInadimplentes} cliente${inad.qtdClientesInadimplentes === 1 ? "" : "s"} · ${inad.qtdParcelasVencidas} parcela${inad.qtdParcelasVencidas === 1 ? "" : "s"}`}
            />
          </div>

          {inad.porCliente.length === 0 ? (
            <div style={{ padding: "1rem", textAlign: "center", color: "var(--text-dim)", fontSize: "0.85rem" }}>
              Sem inadimplência. Todos pagamentos em dia.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: "0.8rem", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--text-dim)", fontSize: "0.7rem", textTransform: "uppercase", fontWeight: 600 }}>
                    <th style={{ padding: "0.5rem 0.25rem" }}>Cliente</th>
                    <th style={{ padding: "0.5rem 0.25rem" }}>Lotes</th>
                    <th style={{ padding: "0.5rem 0.25rem", textAlign: "right" }}>Parcelas</th>
                    <th style={{ padding: "0.5rem 0.25rem", textAlign: "right" }}>Total vencido</th>
                    <th style={{ padding: "0.5rem 0.25rem", textAlign: "right" }}>Atraso máx</th>
                    <th style={{ padding: "0.5rem 0.25rem", textAlign: "right" }}>1ª vencida</th>
                  </tr>
                </thead>
                <tbody>
                  {inad.porCliente.map((c) => (
                    <tr key={`${c.clienteCodigo}-${c.clienteNome}`} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "0.4rem 0.25rem", color: "var(--text)", fontWeight: 600 }}>
                        {c.clienteNome || `Cliente ${c.clienteCodigo}`}
                      </td>
                      <td style={{ padding: "0.4rem 0.25rem", color: "var(--text-muted)", fontSize: "0.75rem" }}>
                        {c.lotesEnvolvidos.slice(0, 3).join(", ")}
                        {c.lotesEnvolvidos.length > 3 ? ` +${c.lotesEnvolvidos.length - 3}` : ""}
                      </td>
                      <td style={{ padding: "0.4rem 0.25rem", textAlign: "right", color: "var(--text)" }}>{c.qtdParcelas}</td>
                      <td style={{ padding: "0.4rem 0.25rem", textAlign: "right", color: "var(--text)", fontWeight: 600 }}>{formatBRL(c.valorTotal)}</td>
                      <td style={{ padding: "0.4rem 0.25rem", textAlign: "right", color: corInadimplencia(c.diasAtrasoMaximo / 30) === "vermelho" ? "#dc2626" : "var(--text-muted)" }}>
                        {c.diasAtrasoMaximo}d
                      </td>
                      <td style={{ padding: "0.4rem 0.25rem", textAlign: "right", color: "var(--text-muted)", fontSize: "0.75rem" }}>
                        {formatData(c.primeiraVencida)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Evolução da inadimplência (snapshots diários — coletando desde 10/06/2026) */}
          {(histInad?.dias?.length ?? 0) >= 2 ? (
            <div style={{ marginTop: "1rem" }}>
              <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>
                Evolução da inadimplência
              </div>
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={histInad!.dias} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="data" tick={{ fontSize: 10, fill: "var(--text-dim)" }} tickFormatter={(d: string) => d.slice(8, 10) + "/" + d.slice(5, 7)} stroke="var(--border)" />
                  <YAxis width={36} tick={{ fontSize: 10, fill: "var(--text-dim)" }} tickFormatter={(v: number) => `${v.toFixed(1)}%`} stroke="var(--border)" />
                  <Tooltip
                    formatter={(v) => [`${Number(v ?? 0).toFixed(2)}%`, "inadimplência"]}
                    labelFormatter={(d) => formatData(String(d))}
                    contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.4rem", fontSize: "0.75rem" }}
                  />
                  <Line type="monotone" dataKey="pct" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div style={{ marginTop: "0.75rem", fontSize: "0.68rem", color: "var(--text-dim)", fontStyle: "italic" }}>
              Histórico diário de inadimplência começou a acumular em 10/06/2026 — o gráfico de evolução aparece a partir do 2º dia.
            </div>
          )}
        </div>
        </>
        )}
      </section>

      {/* ════ BÔNUS ════ */}
      <section>
        <h2 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <Award size={14} /> Bônus de corretores e imobiliárias
        </h2>

        {/* Dado parcial: o ERP falhou em parte da consulta — avisa em vez de fingir que está tudo certo */}
        {bonus && bonus.completo === false ? (
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", padding: "0.6rem 0.9rem", marginBottom: "0.875rem", background: "#f59e0b12", borderLeft: "3px solid #f59e0b", borderRadius: "0.4rem", fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.45 }}>
            <AlertTriangle size={14} style={{ color: "#f59e0b", flexShrink: 0, marginTop: "0.1rem" }} />
            <span>
              <strong style={{ color: "#f59e0b" }}>Fonte de dados instável agora</strong> (ERP UAU ou armazenamento) —
              status e pagos podem aparecer incompletos. <strong>Nada foi perdido</strong>: o registro real está
              preservado (Excel/storage) e a tela se corrige sozinha quando a fonte volta.
            </span>
          </div>
        ) : null}

        {/* KPIs */}
        {bs && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0.625rem", marginBottom: "0.875rem" }}>
            <KpiMedium
              label="A pagar agora"
              valor={formatBRLCompact(bs.aPagarAgora ?? 0)}
              severidade={(bs.qtdAPagar ?? 0) > 0 ? "amarelo" : "cinza"}
              contexto={`${bs.qtdAPagar ?? 0} venda${(bs.qtdAPagar ?? 0) === 1 ? "" : "s"}`}
              formula="Bônus de vendas que já pagaram ≥1,5% do contrato, ainda não marcados como pagos. R$ 3k corretora + R$ 1k imobiliária por venda."
            />
            <KpiMedium
              label="Pago"
              valor={formatBRLCompact(bs.pagoTotal ?? 0)}
              severidade="verde"
              contexto={`${(bs.qtdPagoTotal ?? 0) + (bs.qtdPagoParcial ?? 0)} venda${((bs.qtdPagoTotal ?? 0) + (bs.qtdPagoParcial ?? 0)) === 1 ? "" : "s"} c/ pgto`}
              formula="Soma do que está anotado como 'pago' no Excel (corretora + imobiliária) — o dashboard lê a planilha sozinho."
            />
            <KpiMedium
              label="Aguardando 1,5%"
              valor={formatBRLCompact(bs.aguardandoEntrada ?? 0)}
              severidade="cinza"
              contexto={`${bs.qtdAguardandoEntrada ?? 0} venda${(bs.qtdAguardandoEntrada ?? 0) === 1 ? "" : "s"}`}
              formula="Vendas assinadas onde o cliente ainda pagou menos de 1,5% do contrato (ERP UAU)."
            />
            <KpiMedium
              label="Comprometido total"
              valor={formatBRLCompact(bs.comprometidoTotal ?? 0)}
              severidade="cinza"
              formula="Soma de R$ 4k (R$ 3k + R$ 1k) por todas as vendas ASSINADO no Eggs (excluindo isentos)."
            />
          </div>
        )}

        {/* Lista de bônus a pagar */}
        <BonusList bonus={bonus?.bonus || []} planoPorLote={planoPorLote} />
      </section>
    </div>
  );
}

// ── Componente da lista de bônus ──────────────────────────────────────────
function BonusList({ bonus, planoPorLote }: { bonus: BonusItem[]; planoPorLote: Map<string, PlanoPagamento> }) {
  const [updatingChave, setUpdatingChave] = useState<string | null>(null);
  const [drawerBonus, setDrawerBonus] = useState<BonusItem | null>(null);
  const [pixOpen, setPixOpen] = useState(false);
  const [pagosOpen, setPagosOpen] = useState(false);

  // Filtra: ignora isentos (não fazem parte do "a pagar")
  // Exclui imobiliárias do listing principal — só corretor PF + ação na imobiliária no card
  const agrupados = useMemo(() => {
    const aPagar = bonus.filter((b) => b.status === "a_pagar" || b.status === "pago_parcial");
    const pagos = bonus.filter((b) => b.status === "pago_total");
    const aguardando = bonus.filter((b) => b.status === "aguardando_entrada");
    return { aPagar, pagos, aguardando };
  }, [bonus]);

  // Libera o bônus manualmente (override do check de entrada/sinal do UAU).
  // Usado quando não tem entrada nem sinal (venda à vista, acordo fora do sistema).
  async function liberarManual(b: BonusItem, liberar: boolean) {
    setUpdatingChave(b.chaveVenda);
    try {
      const res = await authFetch("/api/bonus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark", chaveVenda: b.chaveVenda, patch: { liberadoManual: liberar } }),
      });
      if (res.status === 401) alert("Sessão expirada — recarregue a página e faça login de novo.");
      const j = await res.json().catch(() => null);
      if (j?.tracking?.bonus) await mutateGlobal("/api/bonus", j.tracking, { revalidate: false });
      else await mutateGlobal("/api/bonus");
    } finally {
      setUpdatingChave(null);
    }
  }

  if (agrupados.aPagar.length + agrupados.pagos.length + agrupados.aguardando.length === 0) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-dim)", fontSize: "0.85rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem" }}>
        Nenhum bônus ainda. Vai aparecer aqui assim que houver vendas assinadas.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.68rem", color: "var(--text-dim)", marginRight: "auto" }}>
          O pagamento é anotado no <strong>Excel</strong> (digite &quot;pago&quot; na célula) — o dashboard lê sozinho em até 5 min.
        </span>
        <button
          onClick={() => setPagosOpen(true)}
          style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.4rem 0.8rem", fontSize: "0.78rem", fontWeight: 600, color: "var(--text)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.5rem", cursor: "pointer" }}
        >
          <Award size={13} /> Bônus pago
        </button>
        <button
          onClick={() => setPixOpen(true)}
          style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.4rem 0.8rem", fontSize: "0.78rem", fontWeight: 600, color: "var(--text)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.5rem", cursor: "pointer" }}
        >
          <Wallet size={13} /> Pagamentos por PIX
        </button>
      </div>
      <Grupo titulo="🟢 AUTORIZADO PGT" cor="#10b981" itens={agrupados.aPagar} ativo updatingChave={updatingChave} onLiberar={liberarManual} onAbrir={setDrawerBonus} />
      <Grupo titulo="🔵 AGUARDANDO 1,5%" cor="#4285f4" itens={agrupados.aguardando} colapsado updatingChave={updatingChave} onLiberar={liberarManual} onAbrir={setDrawerBonus} />
      <Grupo titulo="⚪ JÁ PAGO" cor="#6b7280" itens={agrupados.pagos} colapsado updatingChave={updatingChave} onLiberar={liberarManual} onAbrir={setDrawerBonus} />
      {drawerBonus ? <BonusDrawer bonus={drawerBonus} plano={planoPorLote.get(drawerBonus.loteId)} onClose={() => setDrawerBonus(null)} /> : null}
      {pixOpen ? <PagamentosPixDrawer bonus={bonus} onClose={() => setPixOpen(false)} /> : null}
      {pagosOpen ? <BonusPagosDrawer bonus={bonus} onClose={() => setPagosOpen(false)} /> : null}
    </div>
  );
}

function Grupo({
  titulo, cor, itens, ativo, colapsado, updatingChave, onLiberar, onAbrir,
}: {
  titulo: string;
  cor: string;
  itens: BonusItem[];
  ativo?: boolean;
  colapsado?: boolean;
  updatingChave: string | null;
  onLiberar: (b: BonusItem, liberar: boolean) => Promise<void>;
  onAbrir: (b: BonusItem) => void;
}) {
  const [collapsed, setCollapsed] = useState(!!colapsado);
  if (itens.length === 0) return null;

  return (
    <div style={{ background: "var(--surface)", border: `1px solid var(--border)`, borderLeft: `4px solid ${cor}`, borderRadius: "0.5rem", overflow: "hidden" }}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{ width: "100%", padding: "0.625rem 1rem", background: cor + "08", border: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", color: cor, fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.03em" }}
      >
        <span>{titulo} — {itens.length}</span>
        <span style={{ fontSize: "0.75rem", fontWeight: 400, color: "var(--text-muted)" }}>
          {formatBRLCompact(itens.reduce((s, b) => s + b.valorTotal, 0))} {collapsed ? "›" : "⌄"}
        </span>
      </button>
      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {itens.map((b) => (
            <BonusCard
              key={b.chaveVenda}
              bonus={b}
              ativo={!!ativo}
              updating={updatingChave === b.chaveVenda}
              onLiberar={onLiberar}
              onAbrir={onAbrir}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BonusCard({
  bonus, ativo, updating, onLiberar, onAbrir,
}: {
  bonus: BonusItem;
  ativo: boolean;
  updating: boolean;
  onLiberar: (b: BonusItem, liberar: boolean) => Promise<void>;
  onAbrir: (b: BonusItem) => void;
}) {
  const corretorEhImob = isImobiliaria(bonus.corretorNome);
  // Gatilho de autorização: pagou >= 1,5% (regra atual). Estrito: cache antigo sem o
  // campo NÃO autoriza pela regra velha (entradaQuitada) — fica "aguardando" até revalidar.
  const autorizado = bonus.autorizado === true;
  const corretoraElegivel = ativo && autorizado && !corretorEhImob;
  const imobElegivel = ativo && autorizado && !!bonus.imobiliariaRazaoSocial && !isImobiliaria(bonus.imobiliariaRazaoSocial);
  // Mostra "Liberar manualmente" só quando NÃO autorizado (aguardando) e ainda não foi liberado.
  const mostrarLiberar = !autorizado && !bonus.pagamento.liberadoManual;

  return (
    <div style={{ padding: "0.625rem 1rem", borderTop: "1px solid var(--border)", display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 2fr) minmax(0, 2fr)", gap: "0.875rem", alignItems: "start" }}>
      {/* Lote + Cliente — clicável: abre o detalhe do bônus */}
      <div onClick={() => onAbrir(bonus)} title="Ver detalhes do bônus" style={{ minWidth: 0, cursor: "pointer" }}>
        <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text)", display: "flex", alignItems: "center", gap: "0.2rem" }}>
          {bonus.loteId}
          <ChevronRight size={13} style={{ color: "var(--text-dim)" }} />
        </div>
        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.125rem" }}>
          {truncate(bonus.clienteNome || "(sem nome)", 30)}
        </div>
        <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", marginTop: "0.125rem" }}>
          contrato {formatBRLCompact(bonus.valorContratado)}
        </div>
        {!autorizado && (
          <div style={{ fontSize: "0.65rem", color: "#f59e0b", marginTop: "0.125rem" }}>
            pago {bonus.valorContratado > 0 ? (((bonus.valorRecebido ?? bonus.entradaValorPago) / bonus.valorContratado) * 100).toFixed(1) : "0"}% · meta 1,5%
          </div>
        )}
        {bonus.pagamento.liberadoManual && (
          <div style={{ fontSize: "0.65rem", color: "#10b981", marginTop: "0.125rem", display: "flex", alignItems: "center", gap: "0.2rem" }}>
            <CheckCircle2 size={10} /> liberado manualmente
            <button
              onClick={(e) => { e.stopPropagation(); onLiberar(bonus, false); }}
              title="Desfazer liberação"
              style={{ marginLeft: "0.2rem", background: "transparent", border: 0, color: "var(--text-dim)", cursor: "pointer", textDecoration: "underline", fontSize: "0.6rem" }}
            >
              desfazer
            </button>
          </div>
        )}
        {mostrarLiberar && (
          <button
            onClick={(e) => { e.stopPropagation(); onLiberar(bonus, true); }}
            disabled={updating}
            title="Libera o bônus pra pagamento mesmo sem entrada/sinal detectado no UAU (venda à vista, acordo externo, etc)"
            style={{
              marginTop: "0.375rem", padding: "0.25rem 0.5rem", fontSize: "0.65rem", fontWeight: 600,
              background: "transparent", border: "1px solid #4285f450", color: "#4285f4",
              borderRadius: "0.25rem", cursor: updating ? "wait" : "pointer",
            }}
          >
            Liberar manualmente
          </button>
        )}
      </div>

      {/* Corretor */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.02em" }}>
          Corretora · R$ {bonus.valorCorretora.toLocaleString("pt-BR")}
        </div>
        <div style={{ fontSize: "0.825rem", color: "var(--text)", marginTop: "0.125rem" }}>
          {truncate(bonus.corretorNome || "(sem corretor)", 28)}
        </div>
        <StatusPagamento
          elegivel={corretoraElegivel}
          pago={bonus.pagamento.pagoCorretora}
          data={bonus.pagamento.dataPagoCorretora}
          viaExcel={(bonus.pagamento.observacao || "").includes("pago via Excel")}
        />
      </div>

      {/* Imobiliária */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.02em" }}>
          Imobiliária · R$ {bonus.valorImobiliaria.toLocaleString("pt-BR")}
        </div>
        <div style={{ fontSize: "0.825rem", color: "var(--text)", marginTop: "0.125rem" }}>
          {truncate(bonus.imobiliariaNomeFantasia || bonus.imobiliariaRazaoSocial || "—", 28)}
        </div>
        <StatusPagamento
          elegivel={imobElegivel}
          pago={bonus.pagamento.pagoImobiliaria}
          data={bonus.pagamento.dataPagoImobiliaria}
          viaExcel={(bonus.pagamento.observacao || "").includes("pago via Excel")}
        />
      </div>
    </div>
  );
}

// Status read-only: o "pago" é anotado NO EXCEL pelo Felipe (o sync lê e marca aqui sozinho).
function StatusPagamento({
  elegivel, pago, data, viaExcel,
}: {
  elegivel: boolean;
  pago: boolean;
  data: string;
  viaExcel: boolean;
}) {
  if (pago) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.375rem" }}>
        <CheckCircle2 size={12} style={{ color: "#10b981" }} />
        <span style={{ fontSize: "0.7rem", color: "#10b981", fontWeight: 600 }}>
          Pago em {formatData(data)}{viaExcel ? " · via Excel" : ""}
        </span>
      </div>
    );
  }
  if (elegivel) {
    return (
      <div style={{ fontSize: "0.7rem", color: "#10b981", marginTop: "0.375rem", fontWeight: 600 }}>
        autorizado — anote &quot;pago&quot; no Excel quando pagar
      </div>
    );
  }
  return <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginTop: "0.375rem", fontStyle: "italic" }}>aguardando</div>;
}
