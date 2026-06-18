"use client";

/**
 * Scorecard / "LTV" de um corretor.
 *  - Rápido (CRM + bônus): vendas firmes/canceladas, VGV, ticket, custo (bônus + comissão 6,5%), % autorizado.
 *  - UAU (lazy, ao abrir): Mangaba gerado, inadimplência dos clientes → LTV líquido, qualidade e LTV ajustado.
 *
 * Qualidade (0-100) = 50% vendas autorizadas (cliente pagou ≥1,5% — regra atual do bônus)
 *                   + 30% adimplência + 20% não-cancelamento.
 * LTV líquido = Mangaba gerado − (bônus + comissões). LTV ajustado = líquido × qualidade%.
 */
import { useEffect } from "react";
import useSWR from "swr";
import { X, User, CheckCircle2, AlertTriangle, TrendingUp } from "lucide-react";
import { formatBRL, formatBRLCompact, formatData } from "@/lib/utils/formatters";

interface ContratoMin {
  loteId: string;
  valor: number;
  cancelado: boolean;
  corretor?: { nome: string; creci?: string };
  imobiliaria?: { razaoSocial?: string };
  dataContrato?: string;
}
interface BonusMin { loteId: string; entradaQuitada: boolean; autorizado?: boolean; valorTotal: number }
interface UauVendasResp { vendas?: { identificadorUnidade: string; valorPrincipal: number; valorRecebido: number }[] }
interface FinancResp { parcelasAReceber?: { identificadorUnidade: string; status: string; valor: number; tipoParcela?: string }[] }

import { calcularLtvCorretor } from "@/lib/calculations/ltv";

export default function CorretorDrawer({ corretorNome, contratos, bonus, onClose }: {
  corretorNome: string | null;
  contratos: ContratoMin[];
  bonus: BonusMin[];
  onClose: () => void;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const { data: uauVendas } = useSWR<UauVendasResp>("/api/uau/vendas");
  const { data: financ } = useSWR<FinancResp>("/api/uau/financeiro");

  if (!corretorNome) return null;

  const meus = contratos.filter((c) => c.corretor?.nome === corretorNome);
  const firmes = meus.filter((c) => !c.cancelado);
  const creci = meus.find((c) => c.corretor?.creci)?.corretor?.creci || "";
  const imob = meus.find((c) => c.imobiliaria?.razaoSocial)?.imobiliaria?.razaoSocial || "";
  const ultimaVenda = firmes.reduce((m, c) => (c.dataContrato && c.dataContrato > m ? c.dataContrato : m), "");

  // Cálculo compartilhado (mesma conta da coluna LTV do ranking) — lib/calculations/ltv.ts.
  // parcelas ?? [] (não null): LTV não depende de /uau/financeiro (504 frio + parcelas
  // vazias hoje). Com vendas presente (cache), uauPronto=true e o LTV aparece. Igual SubTabCorretores.
  const ltv = calcularLtvCorretor(corretorNome, contratos, bonus, uauVendas?.vendas ?? null, financ?.parcelasAReceber ?? []);
  const { vgv, ticket, custoBonus, custoComissao, custoTotal, uauPronto, mangaba, inadLotes, pctInad, ltvLiquido, qualidade, ltvAjustado } = ltv;
  const pctQuitada = ltv.pctAutorizado;
  const pctCancel = ltv.pctCancel;

  const card = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.7rem 0.9rem" } as const;
  const titulo = { fontSize: "0.7rem", color: "var(--text-dim)", fontWeight: 700 as const, textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: "0.4rem" };
  const linha = { display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: "0.8rem", padding: "0.15rem 0" } as const;
  const lbl = { color: "var(--text-muted)" } as const;
  const val = { color: "var(--text)", fontWeight: 600 } as const;
  const corQual = qualidade >= 70 ? "#10b981" : qualidade >= 45 ? "#f59e0b" : "#dc2626";

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9998, animation: "fadein 0.15s ease" }} />
      <aside role="dialog" aria-label="Scorecard do corretor" className="drawer-mobile" style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: "100%", maxWidth: "460px", background: "var(--bg-secondary, #fff)", borderLeft: "1px solid var(--border)", zIndex: 9999, overflowY: "auto", boxShadow: "-8px 0 32px rgba(0,0,0,0.35)", animation: "slidein 0.2s ease" }}>
        <div style={{ position: "sticky", top: 0, background: "var(--bg-secondary, #fff)", borderBottom: "1px solid var(--border)", padding: "0.75rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 1 }}>
          <div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "0.3rem" }}><User size={11} /> Corretor</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text)" }}>{corretorNome}</div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{creci ? `CRECI ${creci}` : ""}{imob ? `${creci ? " · " : ""}${imob}` : ""}</div>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ padding: "0.4rem", background: "transparent", border: 0, color: "var(--text-muted)", cursor: "pointer" }}><X size={18} /></button>
        </div>

        <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* LTV ajustado — destaque */}
          <div style={{ padding: "0.875rem 1rem", background: uauPronto ? `${corQual}10` : "var(--surface)", border: `1px solid ${uauPronto ? corQual + "40" : "var(--border)"}`, borderRadius: "0.5rem" }}>
            <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "0.3rem" }}><TrendingUp size={11} /> LTV ajustado (valor × qualidade)</div>
            {uauPronto ? (
              <>
                <div style={{ fontSize: "1.6rem", fontWeight: 700, color: ltvAjustado >= 0 ? "var(--text)" : "#dc2626" }}>{formatBRL(ltvAjustado)}</div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>LTV líquido {formatBRLCompact(ltvLiquido)} × qualidade {qualidade}/100</div>
              </>
            ) : (
              <div style={{ fontSize: "0.85rem", color: "var(--text-dim)", fontStyle: "italic", marginTop: "0.3rem" }}>calculando com Mangaba e inadimplência… (ERP UAU, ~40s)</div>
            )}
          </div>

          {/* Vendas */}
          <div>
            <div style={titulo}>Vendas</div>
            <div style={card}>
              <div style={linha}><span style={lbl}>Firmes × canceladas</span><span style={val}>{ltv.firmes} × {ltv.canceladas}</span></div>
              <div style={linha}><span style={lbl}>VGV gerado</span><span style={val}>{formatBRL(vgv)}</span></div>
              <div style={linha}><span style={lbl}>Ticket médio</span><span style={val}>{formatBRL(ticket)}</span></div>
              {ultimaVenda ? <div style={linha}><span style={lbl}>Última venda</span><span style={val}>{formatData(ultimaVenda)}</span></div> : null}
            </div>
          </div>

          {/* Custo + valor líquido */}
          <div>
            <div style={titulo}>Custo × valor (Mangaba)</div>
            <div style={card}>
              <div style={linha}><span style={lbl}>Bônus pagos/previstos</span><span style={val}>{formatBRL(custoBonus)}</span></div>
              <div style={linha}><span style={lbl}>Comissões (6,5%)</span><span style={val}>{formatBRL(custoComissao)}</span></div>
              <div style={{ ...linha, borderTop: "1px solid var(--border)", marginTop: "0.2rem", paddingTop: "0.3rem" }}><span style={lbl}>Custo total</span><span style={val}>{formatBRL(custoTotal)}</span></div>
              <div style={linha}><span style={lbl}>Mangaba gerado</span><span style={val}>{uauPronto ? formatBRL(mangaba) : "…"}</span></div>
              <div style={{ ...linha, borderTop: "1px solid var(--border)", marginTop: "0.2rem", paddingTop: "0.3rem" }}><span style={{ ...lbl, fontWeight: 700, color: "var(--text)" }}>LTV líquido</span><span style={{ ...val, fontWeight: 700, color: uauPronto ? (ltvLiquido >= 0 ? "#10b981" : "#dc2626") : "var(--text)" }}>{uauPronto ? formatBRL(ltvLiquido) : "…"}</span></div>
            </div>
          </div>

          {/* Qualidade */}
          <div>
            <div style={titulo}>Qualidade da carteira</div>
            <div style={card}>
              <div style={linha}><span style={lbl}>Autorizado (≥1,5% pago)</span><span style={val}>{(pctQuitada * 100).toFixed(0)}% das vendas</span></div>
              <div style={linha}><span style={lbl}>Clientes inadimplentes</span><span style={val}>{uauPronto ? `${(pctInad * 100).toFixed(0)}% (${inadLotes})` : "…"}</span></div>
              <div style={linha}><span style={lbl}>Cancelamento</span><span style={val}>{(pctCancel * 100).toFixed(0)}%</span></div>
              <div style={{ ...linha, borderTop: "1px solid var(--border)", marginTop: "0.2rem", paddingTop: "0.3rem" }}>
                <span style={{ ...lbl, fontWeight: 700, color: "var(--text)" }}>Qualidade</span>
                <span style={{ fontWeight: 700, color: uauPronto ? corQual : "var(--text)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  {uauPronto ? <>{qualidade >= 70 ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />} {qualidade}/100</> : "…"}
                </span>
              </div>
            </div>
            <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", marginTop: "0.35rem", lineHeight: 1.4 }}>
              Qualidade = 50% autorizado (≥1,5% pago) + 30% adimplência + 20% não-cancelamento. LTV líquido = Mangaba − (bônus + comissões).
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
