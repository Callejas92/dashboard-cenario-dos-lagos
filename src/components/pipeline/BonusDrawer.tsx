"use client";

/**
 * Drawer lateral com o detalhe do BÔNUS de uma venda (focado, sem fetch extra).
 * Mostra: status, entrada/sinal (o gatilho), e bônus corretor/imobiliária com datas.
 * Click no fundo ou ESC fecha. Mesmo visual do ContratoDrawer.
 */
import { useEffect } from "react";
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

export default function BonusDrawer({ bonus, plano, onClose }: { bonus: BonusItemDrawer | null; plano?: PlanoPagamento; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!bonus) return null;

  const cor = STATUS_COR[bonus.status] || "#6b7280";
  const label = STATUS_LABEL[bonus.status] || bonus.status;
  const imobNome = bonus.imobiliariaNomeFantasia || bonus.imobiliariaRazaoSocial || "—";
  const statusLinha = (pago: boolean, data: string) =>
    pago ? `Pago em ${formatData(data)}` : bonus.entradaQuitada ? "Liberado — a pagar" : "Aguardando entrada/sinal";

  const cardStyle = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.6rem 0.9rem" } as const;
  const tituloSecao = { fontSize: "0.7rem", color: "var(--text-dim)", fontWeight: 700 as const, textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: "0.4rem" };

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
                    <span style={{ color: "var(--text-muted)" }}>Parcelas · {plano.parcelasQtd}× {formatBRL(plano.parcelasValor)}</span>
                    <span style={{ color: "var(--text)", fontWeight: 600 }}>{formatBRL(plano.parcelasQtd * plano.parcelasValor)}</span>
                  </div>
                ) : null}
                {plano.balaoQtd > 0 ? (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", padding: "0.15rem 0" }}>
                    <span style={{ color: "var(--text-muted)" }}>Balão · {plano.balaoQtd}× {formatBRL(plano.balaoValor)}</span>
                    <span style={{ color: "var(--text)", fontWeight: 600 }}>{formatBRL(plano.balaoQtd * plano.balaoValor)}</span>
                  </div>
                ) : null}
                {plano.outros > 0 ? (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", padding: "0.15rem 0" }}>
                    <span style={{ color: "var(--text-muted)" }}>Outros (comissão/taxas)</span>
                    <span style={{ color: "var(--text)", fontWeight: 600 }}>{formatBRL(plano.outros)}</span>
                  </div>
                ) : null}
              </div>
              {plano.sinal > 0 && bonus.valorTotal > plano.sinal ? (
                <div style={{ marginTop: "0.4rem", padding: "0.5rem 0.7rem", background: "#dc262615", border: "1px solid #dc262640", borderRadius: "0.4rem", fontSize: "0.72rem", color: "#dc2626", lineHeight: 1.4 }}>
                  ⚠ Bônus de {formatBRL(bonus.valorTotal)} é <strong>maior que a entrada/sinal</strong> de {formatBRL(plano.sinal)} — avalie antes de pagar.
                </div>
              ) : null}
            </div>
          ) : null}

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
