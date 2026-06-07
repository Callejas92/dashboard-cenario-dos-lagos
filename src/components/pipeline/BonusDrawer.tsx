"use client";

/**
 * Drawer lateral com o detalhe do BÔNUS de uma venda (focado, sem fetch extra).
 * Mostra: status, entrada/sinal (o gatilho), e bônus corretor/imobiliária com datas.
 * Click no fundo ou ESC fecha. Mesmo visual do ContratoDrawer.
 */
import { useEffect } from "react";
import useSWR from "swr";
import { X, Award, CheckCircle2, Clock } from "lucide-react";
import { formatBRL, formatData } from "@/lib/utils/formatters";

export interface BonusItemDrawer {
  loteId: string;
  clienteNome: string;
  valorContratado: number;
  corretorNome: string;
  imobiliariaRazaoSocial: string;
  imobiliariaNomeFantasia: string;
  entradaQtdTotal: number;
  entradaQtdPaga: number;
  entradaValorTotal: number;
  entradaValorPago: number;
  entradaQuitada: boolean;
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
}

const STATUS_LABEL: Record<string, string> = {
  a_pagar: "A pagar", pago_parcial: "Pago parcial", pago_total: "Pago",
  aguardando_entrada: "Aguardando entrada", isento: "Isento", revisar: "Revisar", cancelado_pago: "Cancelado (já pago)",
};
const STATUS_COR: Record<string, string> = {
  a_pagar: "#10b981", pago_parcial: "#f59e0b", pago_total: "#6b7280",
  aguardando_entrada: "#4285f4", isento: "#6b7280", revisar: "#f59e0b", cancelado_pago: "#6b7280",
};

export interface PlanoPagamento {
  sinal: number;
  parcelasQtd: number;
  parcelasValor: number;
  balaoQtd: number;
  balaoValor: number;
  outros: number;
  total: number;
}

interface UauVendasResp { vendas?: { identificadorUnidade: string; valorRecebido: number }[] }
interface FinancParcelasResp { parcelasAReceber?: { identificadorUnidade: string; valor: number; dataVencimento: string }[] }

export default function BonusDrawer({ bonus, plano, onClose }: { bonus: BonusItemDrawer | null; plano?: PlanoPagamento; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ERP UAU (lento): valor recebido + cronograma p/ projetar quando o pago chega a 7,5%.
  const { data: uauVendas } = useSWR<UauVendasResp>("/api/uau/vendas");
  const { data: financ } = useSWR<FinancParcelasResp>("/api/uau/financeiro");

  if (!bonus) return null;

  const cor = STATUS_COR[bonus.status] || "#6b7280";
  const label = STATUS_LABEL[bonus.status] || bonus.status;
  const imobNome = bonus.imobiliariaNomeFantasia || bonus.imobiliariaRazaoSocial || "—";
  const statusLinha = (pago: boolean, data: string) =>
    pago ? `Pago em ${formatData(data)}` : bonus.entradaQuitada ? "Liberado — a pagar" : "Aguardando entrada/sinal";

  const cardStyle = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.6rem 0.9rem" } as const;
  const tituloSecao = { fontSize: "0.7rem", color: "var(--text-dim)", fontWeight: 700 as const, textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: "0.4rem" };

  // ── Meta 7,5%: quando o pago chega a 7,5% do contrato (referência p/ liberar o bônus) ──
  const valorRecebido = (uauVendas?.vendas || []).find((v) => v.identificadorUnidade === bonus.loteId)?.valorRecebido;
  const pago = valorRecebido ?? bonus.entradaValorPago;
  const meta75 = 0.075 * bonus.valorContratado;
  const pct = bonus.valorContratado > 0 ? (pago / bonus.valorContratado) * 100 : 0;
  const atingiu75 = pago >= meta75;
  const uauPronto = !!uauVendas && !!financ;
  let dataMeta: string | null = null;
  if (!atingiu75 && financ) {
    const parc = (financ.parcelasAReceber || [])
      .filter((p) => p.identificadorUnidade === bonus.loteId)
      .slice()
      .sort((a, b) => (a.dataVencimento < b.dataVencimento ? -1 : 1));
    let run = pago;
    for (const p of parc) { run += p.valor; if (run >= meta75) { dataMeta = p.dataVencimento; break; } }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9998, animation: "fadein 0.15s ease" }} />
      <aside
        role="dialog"
        aria-label="Detalhe do bônus"
        className="drawer-mobile"
        style={{
          position: "fixed", right: 0, top: 0, bottom: 0, width: "100%", maxWidth: "440px",
          background: "var(--bg-secondary, #ffffff)", borderLeft: "1px solid var(--border)",
          zIndex: 9999, overflowY: "auto", boxShadow: "-8px 0 32px rgba(0,0,0,0.35)", animation: "slidein 0.2s ease",
        }}
      >
        {/* Header */}
        <div style={{ position: "sticky", top: 0, background: "var(--bg-secondary, #ffffff)", borderBottom: "1px solid var(--border)", padding: "0.75rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 1 }}>
          <div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <Award size={11} /> Bônus
            </div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text)" }}>{bonus.loteId}</div>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ padding: "0.4rem", background: "transparent", border: 0, color: "var(--text-muted)", cursor: "pointer" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Status + cliente */}
          <div style={{ padding: "0.875rem 1rem", background: `${cor}10`, border: `1px solid ${cor}40`, borderRadius: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.7rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Status do bônus</span>
              <span style={{ fontSize: "0.72rem", fontWeight: 700, color: cor, background: `${cor}20`, padding: "0.2rem 0.55rem", borderRadius: "9999px" }}>{label}</span>
            </div>
            <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text)", marginTop: "0.4rem" }}>{bonus.clienteNome || "(sem nome)"}</div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>contrato {formatBRL(bonus.valorContratado)}</div>
          </div>

          {/* Entrada/Sinal — o gatilho */}
          <div>
            <div style={tituloSecao}>Entrada / Sinal (libera o bônus)</div>
            <div style={cardStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", fontWeight: 600, color: bonus.entradaQuitada ? "#10b981" : "#f59e0b" }}>
                {bonus.entradaQuitada ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                {bonus.entradaQuitada ? "Quitada — bônus liberado" : "Ainda não quitada"}
                {bonus.pagamento.liberadoManual ? " (liberado manualmente)" : ""}
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>
                {bonus.entradaQtdPaga} de {bonus.entradaQtdTotal} parcela{bonus.entradaQtdTotal === 1 ? "" : "s"} paga{bonus.entradaQtdPaga === 1 ? "" : "s"}
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                {formatBRL(bonus.entradaValorPago)} de {formatBRL(bonus.entradaValorTotal)}
              </div>
            </div>
          </div>

          {/* Forma de pagamento (plano contratado — Eggs) */}
          {plano && (plano.sinal > 0 || plano.parcelasQtd > 0 || plano.balaoQtd > 0) ? (
            <div>
              <div style={tituloSecao}>Forma de pagamento</div>
              <div style={cardStyle}>
                {plano.sinal > 0 ? (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", padding: "0.15rem 0" }}>
                    <span style={{ color: "var(--text-muted)" }}>Sinal / entrada</span>
                    <span style={{ color: "var(--text)", fontWeight: 600 }}>{formatBRL(plano.sinal)}</span>
                  </div>
                ) : null}
                {plano.parcelasQtd > 0 ? (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", padding: "0.15rem 0" }}>
                    <span style={{ color: "var(--text-muted)" }}>Parcelas · {plano.parcelasQtd}×</span>
                    <span style={{ color: "var(--text)", fontWeight: 600 }}>{formatBRL(plano.parcelasValor)}</span>
                  </div>
                ) : null}
                {plano.balaoQtd > 0 ? (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", padding: "0.15rem 0" }}>
                    <span style={{ color: "var(--text-muted)" }}>Balão · {plano.balaoQtd}×</span>
                    <span style={{ color: "var(--text)", fontWeight: 600 }}>{formatBRL(plano.balaoValor)}</span>
                  </div>
                ) : null}
                {plano.outros > 0 ? (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", padding: "0.15rem 0" }}>
                    <span style={{ color: "var(--text-muted)" }}>Outros (comissão/taxas)</span>
                    <span style={{ color: "var(--text)", fontWeight: 600 }}>{formatBRL(plano.outros)}</span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Meta 7,5% pago — referência pra liberar o bônus */}
          <div>
            <div style={tituloSecao}>Pra liberar o bônus (meta 7,5% pago)</div>
            {uauPronto ? (
              <>
                <div style={cardStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: "0.8rem", padding: "0.2rem 0" }}>
                    <span style={{ color: "var(--text-muted)" }}>Valor pago total</span>
                    <span style={{ color: "var(--text)", fontWeight: 700 }}>{formatBRL(pago)} <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>· {pct.toFixed(1)}% do contrato</span></span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", padding: "0.15rem 0" }}>
                    <span style={{ color: "var(--text-muted)" }}>Meta 7,5% (libera o bônus)</span>
                    <span style={{ color: "var(--text)", fontWeight: 600 }}>{formatBRL(meta75)}</span>
                  </div>
                  <div style={{ fontSize: "0.8rem", fontWeight: 600, marginTop: "0.3rem", color: atingiu75 ? "#10b981" : "#f59e0b", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    {atingiu75 ? (
                      <><CheckCircle2 size={13} /> Já passou de 7,5% — ok pra pagar</>
                    ) : dataMeta ? (
                      <><Clock size={13} /> Chega a 7,5% por volta de {formatData(dataMeta)}</>
                    ) : (
                      <><Clock size={13} /> Sem cronograma no UAU pra projetar</>
                    )}
                  </div>
                </div>
                {!atingiu75 ? (
                  <div style={{ marginTop: "0.4rem", padding: "0.5rem 0.7rem", background: "#dc262615", border: "1px solid #dc262640", borderRadius: "0.4rem", fontSize: "0.72rem", color: "#dc2626", lineHeight: 1.4 }}>
                    ⚠ Pago {pct.toFixed(1)}% — ainda <strong>abaixo de 7,5%</strong>. Avalie antes de pagar o bônus de {formatBRL(bonus.valorTotal)}.
                  </div>
                ) : null}
              </>
            ) : (
              <div style={{ ...cardStyle, fontSize: "0.78rem", color: "var(--text-dim)", fontStyle: "italic" }}>
                calculando pelas próximas parcelas… (ERP UAU, pode levar ~40s)
              </div>
            )}
          </div>

          {/* Bônus corretora + imobiliária */}
          <div>
            <div style={tituloSecao}>Bônus (total {formatBRL(bonus.valorTotal)})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={cardStyle}>
                <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", textTransform: "uppercase" }}>Corretor · {formatBRL(bonus.valorCorretora)}</div>
                <div style={{ fontSize: "0.85rem", color: "var(--text)", marginTop: "0.1rem" }}>{bonus.corretorNome || "(sem corretor)"}</div>
                <div style={{ fontSize: "0.72rem", color: bonus.pagamento.pagoCorretora ? "#10b981" : "var(--text-muted)", marginTop: "0.2rem" }}>
                  {statusLinha(bonus.pagamento.pagoCorretora, bonus.pagamento.dataPagoCorretora)}
                </div>
              </div>
              <div style={cardStyle}>
                <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", textTransform: "uppercase" }}>Imobiliária · {formatBRL(bonus.valorImobiliaria)}</div>
                <div style={{ fontSize: "0.85rem", color: "var(--text)", marginTop: "0.1rem" }}>{imobNome}</div>
                <div style={{ fontSize: "0.72rem", color: bonus.pagamento.pagoImobiliaria ? "#10b981" : "var(--text-muted)", marginTop: "0.2rem" }}>
                  {statusLinha(bonus.pagamento.pagoImobiliaria, bonus.pagamento.dataPagoImobiliaria)}
                </div>
              </div>
            </div>
          </div>

          {bonus.pagamento.observacao ? (
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic" }}>Obs: {bonus.pagamento.observacao}</div>
          ) : null}
        </div>
      </aside>
    </>
  );
}
