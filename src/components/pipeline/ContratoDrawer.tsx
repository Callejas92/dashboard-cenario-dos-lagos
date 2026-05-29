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
  const { data: financ } = useSWR<FinancRespMin>("/api/uau/financeiro");
  const { data: uauVendas } = useSWR<UauVendasResp>("/api/uau/vendas");
  const { data: bonusData } = useSWR<BonusResp>("/api/bonus");

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
  const valorTabela = vendaUau?.valorTabela ?? 0;
  const ganhoSalto = valorTabela > 0 ? valorContratado - valorTabela : 0;
  const pctGanhoSalto = valorTabela > 0 ? (ganhoSalto / valorTabela) * 100 : 0;
  const valorRecebido = vendaUau?.valorRecebido ?? 0;
  const saldoDevedor = vendaUau?.saldoDevedor ?? 0;
  const formaPagamento = vendaUau?.formaPagamento || "";
  const qtdParcelasTotal = vendaUau?.qtdParcelas ?? 0;

  // ── PARCELAS DO LOTE ──
  const parcelasDoLote = (financ?.parcelasAReceber || []).filter((p) => p.identificadorUnidade === contrato.loteId);
  const vencidasDoLote = parcelasDoLote.filter((p) => p.status === "vencida");
  const emDiaDoLote = parcelasDoLote.filter((p) => p.status === "em_dia");
  const totalVencido = vencidasDoLote.reduce((s, p) => s + p.valor, 0);
  const totalEmDia = emDiaDoLote.reduce((s, p) => s + p.valor, 0);
  const maxAtraso = vencidasDoLote.reduce((m, p) => Math.max(m, p.diasAtraso), 0);
  const proximaParcela = [...emDiaDoLote].sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento))[0];

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
            <div style={{ padding: "0.75rem 1rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {/* Valor Mangaba */}
              <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "0.5rem", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <div style={{ fontSize: "0.7rem", color: "#10b981", fontWeight: 700 }}>VGV Mangaba ★</div>
                  <div style={{ fontSize: "0.6rem", color: "var(--text-dim)" }}>líquido após comissões</div>
                </div>
                <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "#10b981" }}>{formatBRL(valorMangaba)}</div>
              </div>

              {/* Comissões */}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}>
                <span style={{ color: "var(--text-muted)" }}>Comissão imobiliária (5%)</span>
                <span style={{ color: "var(--text)" }}>{formatBRL(comissaoImob)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}>
                <span style={{ color: "var(--text-muted)" }}>Comissão Eggs (1,5%)</span>
                <span style={{ color: "var(--text)" }}>{formatBRL(comissaoEggs)}</span>
              </div>

              {/* Ganho de salto */}
              {valorTabela > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "0.5rem", borderTop: "1px solid var(--border)", fontSize: "0.75rem" }}>
                  <span style={{ color: "var(--text-muted)" }}>
                    Tabela base / Ganho de salto
                  </span>
                  <span style={{ color: "var(--text)" }}>
                    {formatBRLCompact(valorTabela)}{" "}
                    <span style={{ color: ganhoSalto >= 0 ? "#10b981" : "#dc2626", fontWeight: 600 }}>
                      ({ganhoSalto >= 0 ? "+" : ""}{pctGanhoSalto.toFixed(1)}%)
                    </span>
                  </span>
                </div>
              )}

              {/* Forma + parcelas */}
              {(formaPagamento || qtdParcelasTotal > 0) && (
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "0.5rem", borderTop: "1px solid var(--border)", fontSize: "0.75rem" }}>
                  <span style={{ color: "var(--text-muted)" }}>Forma de pagamento</span>
                  <span style={{ color: "var(--text)" }}>
                    {formaPagamento || "—"}
                    {qtdParcelasTotal > 0 && <> · {qtdParcelasTotal}x</>}
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
              <div style={{ padding: "0.75rem 1rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {valorRecebido > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}>
                    <span style={{ color: "var(--text-muted)" }}>Já recebido</span>
                    <span style={{ color: "#10b981", fontWeight: 600 }}>{formatBRL(valorRecebido)}</span>
                  </div>
                )}
                {saldoDevedor > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}>
                    <span style={{ color: "var(--text-muted)" }}>Saldo a receber</span>
                    <span style={{ color: "var(--text)", fontWeight: 600 }}>{formatBRL(saldoDevedor)}</span>
                  </div>
                )}
                {proximaParcela && (
                  <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "0.5rem", borderTop: "1px solid var(--border)", fontSize: "0.75rem" }}>
                    <div>
                      <div style={{ color: "var(--text-muted)" }}>Próxima parcela</div>
                      <div style={{ color: "var(--text-dim)", fontSize: "0.65rem" }}>
                        venc. {formatData(proximaParcela.dataVencimento)} · {proximaParcela.tipoParcela || "P"}
                      </div>
                    </div>
                    <div style={{ color: "var(--text)", fontWeight: 600 }}>{formatBRL(proximaParcela.valor)}</div>
                  </div>
                )}
                {vencidasDoLote.length > 0 && (
                  <div style={{ padding: "0.5rem 0.75rem", background: "#dc262615", border: "1px solid #dc262640", borderRadius: "0.375rem", fontSize: "0.72rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", color: "#dc2626", fontWeight: 700, marginBottom: "0.2rem" }}>
                      <AlertTriangle size={11} /> {vencidasDoLote.length} parcela{vencidasDoLote.length > 1 ? "s" : ""} vencida{vencidasDoLote.length > 1 ? "s" : ""}
                    </div>
                    <div style={{ color: "var(--text-muted)" }}>
                      {formatBRL(totalVencido)} · atraso máx {maxAtraso}d
                    </div>
                  </div>
                )}
                {parcelasDoLote.length > 0 && vencidasDoLote.length === 0 && (
                  <div style={{ fontSize: "0.7rem", color: "#10b981", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <CheckCircle2 size={11} /> Pagamentos em dia ({emDiaDoLote.length} parcela{emDiaDoLote.length > 1 ? "s" : ""} pendente, {formatBRL(totalEmDia)})
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Caso sem parcelas no UAU */}
          {parcelasDoLote.length === 0 && valorRecebido === 0 && (
            <div style={{ padding: "0.6rem 0.9rem", background: "#f59e0b10", border: "1px solid #f59e0b30", borderRadius: "0.375rem", fontSize: "0.72rem", color: "var(--text-muted)", fontStyle: "italic" }}>
              ⏳ Sem parcelas no UAU (venda recente — aguardando lançamento do financeiro).
            </div>
          )}

          {/* ═══ BÔNUS ═══ */}
          {bonusInfo && (
            <div>
              <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <Award size={11} /> Bônus de Comissão
              </div>
              <div style={{ padding: "0.75rem 1rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "0.4rem" }}>
                  <span style={{ color: "var(--text-muted)" }}>Bônus corretor (R$ 3k)</span>
                  <span style={{ color: bonusInfo.pagamento.pagoCorretora ? "#10b981" : "var(--text)", fontWeight: 600 }}>
                    {bonusInfo.pagamento.pagoCorretora ? `pago ${formatData(bonusInfo.pagamento.dataPagoCorretora)}` : (bonusInfo.entradaQuitada ? "a pagar" : "aguardando entrada")}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "0.4rem" }}>
                  <span style={{ color: "var(--text-muted)" }}>Bônus imobiliária (R$ 1k)</span>
                  <span style={{ color: bonusInfo.pagamento.pagoImobiliaria ? "#10b981" : "var(--text)", fontWeight: 600 }}>
                    {bonusInfo.pagamento.pagoImobiliaria ? `pago ${formatData(bonusInfo.pagamento.dataPagoImobiliaria)}` : (bonusInfo.entradaQuitada ? "a pagar" : "aguardando entrada")}
                  </span>
                </div>
                {!bonusInfo.entradaQuitada && bonusInfo.entradaQtdTotal > 0 && (
                  <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", paddingTop: "0.4rem", borderTop: "1px solid var(--border)" }}>
                    Entrada: {bonusInfo.entradaQtdPaga}/{bonusInfo.entradaQtdTotal} parcelas pagas. Bônus libera quando quitar todas.
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

          {/* ═══ DATAS ═══ */}
          <div>
            <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <Calendar size={11} /> Datas
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "grid", gap: "0.25rem" }}>
              {contrato.dataContrato && <div>Contrato: {formatData(contrato.dataContrato)}</div>}
              {contrato.dataEmissao && <div>Emissão: {formatData(contrato.dataEmissao)}</div>}
              {contrato.responsavelSistema && <div>Cadastrado por: {contrato.responsavelSistema}</div>}
            </div>
          </div>
        </div>
      </aside>

      <style jsx global>{`
        @keyframes fadein { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slidein { from { transform: translateX(100%) } to { transform: translateX(0) } }
      `}</style>
    </>
  );
}
