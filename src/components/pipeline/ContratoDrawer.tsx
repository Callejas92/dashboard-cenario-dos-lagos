"use client";

/**
 * Drawer lateral com detalhe completo de um contrato.
 * Click no fundo OU ESC fecha.
 */
import { useEffect } from "react";
import useSWR from "swr";
import { X, Phone, Mail, User, Calendar, DollarSign, Briefcase, AlertTriangle, CheckCircle2, Award, TrendingUp } from "lucide-react";
import { formatBRL, formatBRLCompact, formatData } from "@/lib/utils/formatters";
import lotesData from "@/data/lotes.json";

interface Contrato {
  id: number;
  loteId: string;
  bloco: string;
  unidade: string;
  valor: number;
  metragem: number;
  digital: boolean;
  cliente: string;
  clienteCpfCnpj: string;
  clienteTipo: "PF" | "PJ" | "";
  clienteTelefone: string;
  clienteEmail: string;
  status: string;
  statusOriginal: string;
  responsavelSistema?: string;
  corretor: { nome: string; cpf: string; creci: string; telefone: string; email: string };
  imobiliaria: { razaoSocial: string; nomeFantasia: string; cnpj: string };
  dataContrato?: string;
  dataEmissao?: string;
  planoPagamento?: {
    sinal: number;
    parcelasQtd: number;
    parcelasValor: number;
    balaoQtd: number;
    balaoValor: number;
    outros: number;
    total: number;
  };
}

interface ParcelaMin {
  identificadorUnidade: string;
  status: "vencida" | "em_dia";
  valor: number;
  diasAtraso: number;
  dataVencimento: string;
  numeroParcela: number;
  tipoParcela?: string;
}
interface FinancRespMin {
  parcelasAReceber?: ParcelaMin[];
}
interface VendaMin {
  identificadorUnidade: string;
  valorVenda: number;
  valorTabela: number;
  valorPrincipal: number;
  valorRecebido: number;
  saldoDevedor: number;
  formaPagamento?: string;
  qtdParcelas: number;
  qtdParcelasPagas?: number;
}
interface UauVendasResp {
  vendas?: VendaMin[];
}
interface BonusItem {
  loteId: string;
  status: string;
  valorCorretora: number;
  valorImobiliaria: number;
  pagamento: { pagoCorretora: boolean; dataPagoCorretora: string; pagoImobiliaria: boolean; dataPagoImobiliaria: string; isento?: boolean };
  entradaQuitada: boolean;
  autorizado?: boolean;
  valorRecebido?: number;
  metaAutorizado?: number;
  entradaQtdPaga: number;
  entradaQtdTotal: number;
}
interface BonusResp { bonus?: BonusItem[] }

interface LoteStatic { id: string; area?: number; classificacao?: string; rua?: string }
const lotesMap = new Map<string, LoteStatic>();
for (const l of lotesData as LoteStatic[]) lotesMap.set(l.id, l);

const COMISSAO_IMOB_PCT = 0.05;
const COMISSAO_EGGS_PCT = 0.015;
const COMISSAO_TOTAL_PCT = COMISSAO_IMOB_PCT + COMISSAO_EGGS_PCT;

export default function ContratoDrawer({
  contrato,
  onClose,
}: {
  contrato: Contrato | null;
  onClose: () => void;
}) {
  // Busca financeiro pra cruzar com lote
  const { data: financ, isLoading: lF } = useSWR<FinancRespMin>("/api/uau/financeiro");
  const { data: uauVendas, isLoading: lV } = useSWR<UauVendasResp>("/api/uau/vendas");
  const { data: bonusData } = useSWR<BonusResp>("/api/bonus");
  const isLoadingUau = lF || lV;

  // ESC fecha
  useEffect(() => {
    if (!contrato) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [contrato, onClose]);

  if (!contrato) return null;

  // ── ÁREA: prioridade UAU > lotes.json > contrato.metragem ──
  const vendaUau = (uauVendas?.vendas || []).find((v) => v.identificadorUnidade === contrato.loteId);
  const loteEstatico = lotesMap.get(contrato.loteId);
  const area = contrato.metragem > 0
    ? contrato.metragem
    : (loteEstatico?.area ?? 0);

  // ── VALORES CALCULADOS ──
  const valorContratado = contrato.valor;
  const valorMangaba = valorContratado * (1 - COMISSAO_TOTAL_PCT);
  const comissaoImob = valorContratado * COMISSAO_IMOB_PCT;
  const comissaoEggs = valorContratado * COMISSAO_EGGS_PCT;
  const valorRecebido = vendaUau?.valorRecebido ?? 0;
  const saldoDevedor = vendaUau?.saldoDevedor ?? 0;
  const formaPagamento = vendaUau?.formaPagamento || "";
  const qtdParcelasTotal = vendaUau?.qtdParcelas ?? 0;

  // ── PARCELAS DO LOTE ──
  const parcelasDoLote = (financ?.parcelasAReceber || []).filter((p) => p.identificadorUnidade === contrato.loteId);
  const vencidasDoLote = parcelasDoLote.filter((p) => p.status === "vencida");
  const emDiaDoLote = parcelasDoLote.filter((p) => p.status === "em_dia");
  const totalVencido = vencidasDoLote.reduce((s, p) => s + p.valor, 0);
  const totalEmAberto = parcelasDoLote.reduce((s, p) => s + p.valor, 0); // vencidas + em dia
  const maxAtraso = vencidasDoLote.reduce((m, p) => Math.max(m, p.diasAtraso), 0);
  const proximaParcela = [...emDiaDoLote].sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento))[0];

  // Parcelas BALÃO (tipoParcela contendo "BAL" ou "B" exato, case-insensitive)
  const isBalao = (tipo?: string): boolean => {
    if (!tipo) return false;
    const t = tipo.toUpperCase().trim();
    return t === "B" || t.includes("BAL");
  };
  const parcelasBalao = parcelasDoLote.filter((p) => isBalao(p.tipoParcela));
  const totalBalao = parcelasBalao.reduce((s, p) => s + p.valor, 0);

  // Entrada/sinal (tipo E ou S) — separa pra não misturar com parcela nem balão
  const isEntrada = (tipo?: string): boolean => {
    if (!tipo) return false;
    const t = tipo.toUpperCase().trim();
    return t === "E" || t === "S" || t.includes("ENTR") || t.includes("SINAL");
  };
  // Parcelas comuns = tudo que NÃO é balão e NÃO é entrada/sinal
  const parcelasComuns = parcelasDoLote.filter((p) => !isBalao(p.tipoParcela) && !isEntrada(p.tipoParcela));
  const totalComuns = parcelasComuns.reduce((s, p) => s + p.valor, 0);

  // Contagem de parcelas só é CONFIÁVEL quando o financeiro retornou as parcelas
  // a receber deste lote. Se vier vazio (financeiro frio/incompleto), NÃO inventa
  // "X pagas / 0 falta" — mostra só os valores monetários.
  const parcelasOk = parcelasDoLote.length > 0;
  const qtdFalta = parcelasDoLote.length;
  const qtdPagas = parcelasOk && qtdParcelasTotal > 0
    ? Math.max(0, qtdParcelasTotal - parcelasDoLote.length)
    : 0;

  // ── BÔNUS ──
  const bonusInfo = (bonusData?.bonus || []).find((b) => b.loteId === contrato.loteId);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
          zIndex: 9998, animation: "fadein 0.15s ease",
        }}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-label="Detalhe do contrato"
        className="drawer-mobile"
        style={{
          position: "fixed", right: 0, top: 0, bottom: 0,
          width: "100%", maxWidth: "460px",
          background: "var(--bg-secondary, #ffffff)",
          borderLeft: "1px solid var(--border)",
          zIndex: 9999, overflowY: "auto",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.35)",
          animation: "slidein 0.2s ease",
          paddingBottom: "env(safe-area-inset-bottom, 0)",
        }}
      >
        {/* Header sticky */}
        <div style={{
          position: "sticky", top: 0,
          background: "var(--bg-secondary, #ffffff)",
          borderBottom: "1px solid var(--border)", padding: "0.75rem 1rem",
          display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 1,
        }}>
          <div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Contrato #{contrato.id}
            </div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text)" }}>
              {contrato.loteId}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            style={{ padding: "0.4rem", background: "transparent", border: 0, color: "var(--text-muted)", cursor: "pointer", borderRadius: "0.375rem" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Conteúdo */}
        <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* ═══ VALOR + STATUS ═══ */}
          <div style={{ padding: "0.875rem 1rem", background: "#10b98108", border: "1px solid #10b98140", borderRadius: "0.5rem" }}>
            <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem" }}>
              VALOR CONTRATADO
            </div>
            <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--text)" }}>{formatBRL(valorContratado)}</div>

            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {area > 0 && <><span>{area.toFixed(0)} m²</span><span>•</span></>}
              {loteEstatico?.classificacao && <><span>Classif. {loteEstatico.classificacao}</span><span>•</span></>}
              <span>{contrato.digital ? "Digital" : "Físico"}</span>
            </div>

            <div style={{ marginTop: "0.5rem" }}>
              <span style={{
                fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.6rem",
                background: contrato.statusOriginal === "ASSINADO" ? "#10b98115" : "#4285f415",
                color: contrato.statusOriginal === "ASSINADO" ? "#10b981" : "#4285f4",
                borderRadius: "9999px",
              }}>
                {contrato.statusOriginal}
              </span>
            </div>
          </div>

          {/* ═══ RESUMO FINANCEIRO ═══ */}
          <div>
            <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <DollarSign size={11} /> Resumo financeiro
            </div>
            <div style={{ padding: "0.875rem 1rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {/* VGV Mangaba ★ destaque */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "0.625rem", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <div style={{ fontSize: "0.7rem", color: "#10b981", fontWeight: 700 }}>VGV Mangaba ★</div>
                  <div style={{ fontSize: "0.6rem", color: "var(--text-dim)" }}>líquido (após 6,5% de comissões)</div>
                </div>
                <div className="tnum" style={{ fontSize: "1.15rem", fontWeight: 700, color: "#10b981" }}>{formatBRL(valorMangaba)}</div>
              </div>

              {/* Comissões — em uma linha só */}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}>
                <span style={{ color: "var(--text-muted)" }}>Comissões a pagar</span>
                <span className="tnum" style={{ color: "var(--text)", fontWeight: 600 }}>
                  {formatBRL(comissaoImob + comissaoEggs)}
                </span>
              </div>
              <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", marginTop: "-0.25rem" }}>
                imobiliária 5% ({formatBRLCompact(comissaoImob)}) + Eggs 1,5% ({formatBRLCompact(comissaoEggs)})
              </div>

              {/* Forma de pagamento (se UAU enviou) */}
              {(formaPagamento || qtdParcelasTotal > 0) && (
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "0.5rem", borderTop: "1px solid var(--border)", fontSize: "0.75rem" }}>
                  <span style={{ color: "var(--text-muted)" }}>{qtdParcelasTotal > 0 ? "Parcelamento" : "Forma de pagamento"}</span>
                  <span style={{ color: "var(--text)" }}>
                    {formaPagamento && <>{formaPagamento}{qtdParcelasTotal > 0 ? " · " : ""}</>}
                    {qtdParcelasTotal > 0 && <span className="tnum">{qtdParcelasTotal}x</span>}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ═══ STATUS DOS PAGAMENTOS (UAU) ═══ */}
          {(parcelasDoLote.length > 0 || valorRecebido > 0) && (
            <div>
              <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <TrendingUp size={11} /> Pagamentos
              </div>
              <div style={{ padding: "0.875rem 1rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>

                {/* Linha 1: paga · em aberto */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                  {/* Pagas */}
                  <div style={{ padding: "0.5rem 0.625rem", background: "#10b98110", border: "1px solid #10b98130", borderRadius: "0.375rem" }}>
                    <div style={{ fontSize: "0.6rem", color: "#10b981", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                      {parcelasOk ? `${qtdPagas} paga${qtdPagas === 1 ? "" : "s"}` : "Recebido"}
                    </div>
                    <div className="tnum" style={{ fontSize: "0.9rem", fontWeight: 700, color: "#10b981" }}>
                      {formatBRL(valorRecebido)}
                    </div>
                  </div>

                  {/* Parcelas comuns (sem balão) */}
                  <div style={{ padding: "0.5rem 0.625rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.375rem" }}>
                    <div style={{ fontSize: "0.6rem", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                      {parcelasOk ? `Parcelas · ${parcelasComuns.length}` : "A receber"}
                    </div>
                    <div className="tnum" style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text)" }}>
                      {formatBRL(parcelasOk ? totalComuns : (saldoDevedor > 0 ? saldoDevedor : totalEmAberto))}
                    </div>
                  </div>
                </div>
                {!parcelasOk && (saldoDevedor > 0) && (
                  <div style={{ fontSize: "0.62rem", color: "var(--text-dim)", fontStyle: "italic" }}>
                    contagem de parcelas indisponível agora (financeiro carregando) — valores conferem.
                  </div>
                )}

                {/* Balão (se houver) */}
                {parcelasBalao.length > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", padding: "0.3rem 0.5rem", background: "#4285f410", border: "1px solid #4285f430", borderRadius: "0.375rem" }}>
                    <span style={{ color: "#4285f4", fontWeight: 700 }}>
                      🎈 Balão · {parcelasBalao.length}
                    </span>
                    <span className="tnum" style={{ color: "#4285f4", fontWeight: 600 }}>{formatBRL(totalBalao)}</span>
                  </div>
                )}

                {/* Total a receber (parcelas + balão) — referência, sem substituir o detalhe acima */}
                {parcelasOk && qtdFalta > 0 && (
                  <div style={{ fontSize: "0.62rem", color: "var(--text-dim)", textAlign: "right" }}>
                    total a receber: <span className="tnum">{formatBRL(totalEmAberto)}</span> · {qtdFalta} pagamentos
                  </div>
                )}

                {/* Próxima parcela */}
                {proximaParcela && (
                  <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "0.5rem", borderTop: "1px solid var(--border)", fontSize: "0.75rem" }}>
                    <div>
                      <div style={{ color: "var(--text-muted)" }}>Próxima a vencer</div>
                      <div style={{ color: "var(--text-dim)", fontSize: "0.65rem" }}>
                        {formatData(proximaParcela.dataVencimento)}
                        {proximaParcela.tipoParcela && <> · {proximaParcela.tipoParcela}</>}
                      </div>
                    </div>
                    <div className="tnum" style={{ color: "var(--text)", fontWeight: 600 }}>{formatBRL(proximaParcela.valor)}</div>
                  </div>
                )}

                {/* Alerta vencidas */}
                {vencidasDoLote.length > 0 && (
                  <div style={{ padding: "0.5rem 0.75rem", background: "#dc262615", border: "1px solid #dc262640", borderRadius: "0.375rem", fontSize: "0.72rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", color: "#dc2626", fontWeight: 700, marginBottom: "0.2rem" }}>
                      <AlertTriangle size={11} /> {vencidasDoLote.length} parcela{vencidasDoLote.length > 1 ? "s" : ""} vencida{vencidasDoLote.length > 1 ? "s" : ""}
                    </div>
                    <div className="tnum" style={{ color: "var(--text-muted)" }}>
                      {formatBRL(totalVencido)} · atraso máx {maxAtraso}d
                    </div>
                  </div>
                )}

                {/* OK status */}
                {parcelasDoLote.length > 0 && vencidasDoLote.length === 0 && (
                  <div style={{ fontSize: "0.7rem", color: "#10b981", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <CheckCircle2 size={11} /> Em dia — sem vencidos
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Loading state UAU */}
          {isLoadingUau && (
            <div style={{ padding: "0.6rem 0.9rem", background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: "0.375rem", fontSize: "0.72rem", color: "var(--text-dim)", fontStyle: "italic" }}>
              Carregando dados do ERP UAU…
            </div>
          )}

          {/* UAU ainda sem financeiro lançado: mostra o PLANO contratado (Eggs) se houver */}
          {!isLoadingUau && parcelasDoLote.length === 0 && valorRecebido === 0 && (
            contrato.planoPagamento ? (
              <div>
                <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <TrendingUp size={11} /> Plano de pagamento (contratado)
                </div>
                <div style={{ padding: "0.875rem 1rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {contrato.planoPagamento.sinal > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem" }}>
                      <span style={{ color: "var(--text-muted)" }}>Sinal / entrada</span>
                      <span className="tnum" style={{ color: "var(--text)", fontWeight: 600 }}>{formatBRL(contrato.planoPagamento.sinal)}</span>
                    </div>
                  )}
                  {contrato.planoPagamento.parcelasQtd > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem" }}>
                      <span style={{ color: "var(--text-muted)" }}>Parcelas · {contrato.planoPagamento.parcelasQtd}</span>
                      <span className="tnum" style={{ color: "var(--text)", fontWeight: 600 }}>{formatBRL(contrato.planoPagamento.parcelasValor)}</span>
                    </div>
                  )}
                  {contrato.planoPagamento.balaoQtd > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem" }}>
                      <span style={{ color: "#4285f4", fontWeight: 700 }}>🎈 Balão · {contrato.planoPagamento.balaoQtd}</span>
                      <span className="tnum" style={{ color: "#4285f4", fontWeight: 600 }}>{formatBRL(contrato.planoPagamento.balaoValor)}</span>
                    </div>
                  )}
                  {contrato.planoPagamento.outros > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--text-dim)" }}>
                      <span>Outros (comissão/coord.)</span>
                      <span className="tnum">{formatBRL(contrato.planoPagamento.outros)}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "0.5rem", borderTop: "1px solid var(--border)", fontSize: "0.8rem", fontWeight: 700 }}>
                    <span style={{ color: "var(--text)" }}>Total contratado</span>
                    <span className="tnum" style={{ color: "var(--text)" }}>{formatBRL(contrato.planoPagamento.total)}</span>
                  </div>
                  <div style={{ fontSize: "0.62rem", color: "#f59e0b", fontStyle: "italic", marginTop: "0.15rem" }}>
                    ⏳ Plano do contrato (Eggs). O financeiro ainda não foi lançado no UAU — o que já foi pago aparece quando o UAU lançar.
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: "0.6rem 0.9rem", background: "#f59e0b10", border: "1px solid #f59e0b30", borderRadius: "0.375rem", fontSize: "0.72rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                ⏳ Sem parcelas no UAU (venda recente — aguardando lançamento do financeiro).
              </div>
            )
          )}

          {/* ═══ BÔNUS ═══ */}
          {bonusInfo && (
            <div>
              <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <Award size={11} /> Bônus de Comissão
              </div>
              <div style={{ padding: "0.875rem 1rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {/* Bônus corretor */}
                <BonusLinha
                  label="Bônus corretor"
                  valor={bonusInfo.valorCorretora || 3000}
                  pago={bonusInfo.pagamento.pagoCorretora}
                  dataPago={bonusInfo.pagamento.dataPagoCorretora}
                  autorizado={bonusInfo.autorizado === true}
                  isento={bonusInfo.pagamento.isento}
                />

                {/* Bônus imobiliária */}
                <BonusLinha
                  label="Bônus imobiliária"
                  valor={bonusInfo.valorImobiliaria || 1000}
                  pago={bonusInfo.pagamento.pagoImobiliaria}
                  dataPago={bonusInfo.pagamento.dataPagoImobiliaria}
                  autorizado={bonusInfo.autorizado === true}
                  isento={bonusInfo.pagamento.isento}
                />

                {/* Progresso entrada/sinal (se ainda não quitou) */}
                {bonusInfo.autorizado !== true && (bonusInfo.metaAutorizado ?? 0) > 0 && (
                  <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", paddingTop: "0.4rem", borderTop: "1px solid var(--border)" }}>
                    Pago <span className="tnum">{formatBRL(bonusInfo.valorRecebido ?? 0)}</span> de {formatBRL(bonusInfo.metaAutorizado ?? 0)} (1,5%) — bônus libera ao atingir.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ CLIENTE ═══ */}
          <div>
            <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <User size={11} /> Cliente {contrato.clienteTipo && `· ${contrato.clienteTipo}`}
            </div>
            <div style={{ fontSize: "0.9rem", color: "var(--text)", fontWeight: 600 }}>{contrato.cliente || "—"}</div>
            {contrato.clienteCpfCnpj && (
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                {contrato.clienteTipo === "PJ" ? "CNPJ" : "CPF"}: {contrato.clienteCpfCnpj}
              </div>
            )}
            {contrato.clienteTelefone && (
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <Phone size={10} /> {contrato.clienteTelefone}
              </div>
            )}
            {contrato.clienteEmail && (
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <Mail size={10} /> {contrato.clienteEmail}
              </div>
            )}
          </div>

          {/* ═══ CORRETOR ═══ */}
          <div>
            <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <Briefcase size={11} /> Corretor
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--text)", fontWeight: 600 }}>{contrato.corretor.nome || "—"}</div>
            {contrato.corretor.creci && (
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>CRECI {contrato.corretor.creci}</div>
            )}
            {contrato.corretor.telefone && (
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <Phone size={10} /> {contrato.corretor.telefone}
              </div>
            )}
          </div>

          {/* ═══ IMOBILIÁRIA ═══ */}
          {(contrato.imobiliaria.razaoSocial || contrato.imobiliaria.nomeFantasia) && (
            <div>
              <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
                Imobiliária
              </div>
              <div style={{ fontSize: "0.85rem", color: "var(--text)" }}>
                {contrato.imobiliaria.nomeFantasia || contrato.imobiliaria.razaoSocial}
              </div>
              {contrato.imobiliaria.cnpj && (
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>CNPJ {contrato.imobiliaria.cnpj}</div>
              )}
            </div>
          )}

          {/* ═══ DATA DO CONTRATO ═══ */}
          {(contrato.dataContrato || contrato.dataEmissao) && (
            <div>
              <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <Calendar size={11} /> Data do contrato
              </div>
              <div style={{ fontSize: "0.85rem", color: "var(--text)", fontWeight: 600 }}>
                {formatData(contrato.dataContrato || contrato.dataEmissao!)}
              </div>
            </div>
          )}
        </div>
      </aside>

      <style jsx global>{`
        @keyframes fadein { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slidein { from { transform: translateX(100%) } to { transform: translateX(0) } }
      `}</style>
    </>
  );
}

/**
 * BonusLinha — linha de bônus com badge de status.
 *
 * Estados possíveis:
 *  - Isento (cinza)
 *  - Pago dd/mm (verde)
 *  - A pagar (amarelo) — entrada quitada, esperando pagamento
 *  - Aguardando entrada (azul) — entrada ainda não quitada
 */
function BonusLinha({
  label, valor, pago, dataPago, autorizado, isento,
}: {
  label: string;
  valor: number;
  pago: boolean;
  dataPago: string;
  autorizado: boolean;
  isento?: boolean;
}) {
  let badgeText: string;
  let badgeColor: string;
  let badgeBg: string;

  if (isento) {
    badgeText = "Isento";
    badgeColor = "var(--text-muted)";
    badgeBg = "var(--surface-hover, rgba(0,0,0,0.05))";
  } else if (pago) {
    badgeText = `Pago ${formatData(dataPago)}`;
    badgeColor = "#10b981";
    badgeBg = "#10b98115";
  } else if (autorizado) {
    badgeText = "A pagar";
    badgeColor = "#f59e0b";
    badgeBg = "#f59e0b15";
  } else {
    badgeText = "Aguardando 1,5%";
    badgeColor = "#4285f4";
    badgeBg = "#4285f415";
  }

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.75rem" }}>
      <div>
        <div style={{ color: "var(--text)", fontWeight: 600 }}>{label}</div>
        <div className="tnum" style={{ color: "var(--text-dim)", fontSize: "0.65rem" }}>{formatBRL(valor)}</div>
      </div>
      <span style={{
        fontSize: "0.65rem", fontWeight: 700, padding: "0.2rem 0.55rem",
        background: badgeBg, color: badgeColor, borderRadius: "9999px",
        whiteSpace: "nowrap",
      }}>
        {badgeText}
      </span>
    </div>
  );
}
