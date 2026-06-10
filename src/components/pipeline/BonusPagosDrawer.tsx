"use client";

/**
 * Painel lateral "Bônus Pago" — histórico do que já foi pago (corretor R$3k / imob R$1k),
 * com total e datas. Só visualização; marcar/desmarcar continua nos cards da lista.
 */
import { useEffect } from "react";
import { X, CheckCircle2, Award } from "lucide-react";
import { formatBRL, formatData } from "@/lib/utils/formatters";

interface BonusPagoItem {
  loteId: string;
  clienteNome: string;
  corretorNome: string;
  imobiliariaNomeFantasia?: string;
  imobiliariaRazaoSocial: string;
  valorCorretora: number;
  valorImobiliaria: number;
  pagamento: { pagoCorretora: boolean; dataPagoCorretora: string; pagoImobiliaria: boolean; dataPagoImobiliaria: string };
}

export default function BonusPagosDrawer({ bonus, onClose }: { bonus: BonusPagoItem[]; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const pagos = bonus.filter((b) => b.pagamento && (b.pagamento.pagoCorretora || b.pagamento.pagoImobiliaria));
  const ultimaData = (b: BonusPagoItem) =>
    [b.pagamento.dataPagoCorretora, b.pagamento.dataPagoImobiliaria].filter(Boolean).sort().reverse()[0] || "";
  pagos.sort((a, b) => ultimaData(b).localeCompare(ultimaData(a)) || a.loteId.localeCompare(b.loteId));

  let totalPago = 0, qtdPartes = 0;
  for (const b of pagos) {
    if (b.pagamento.pagoCorretora) { totalPago += b.valorCorretora; qtdPartes++; }
    if (b.pagamento.pagoImobiliaria) { totalPago += b.valorImobiliaria; qtdPartes++; }
  }

  const linhaPaga = (label: string, nome: string, valor: number, pago: boolean, data: string) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: "0.74rem", padding: "0.1rem 0" }}>
      <span style={{ color: pago ? "var(--text-muted)" : "var(--text-dim)" }}>{label}: {nome}</span>
      {pago ? (
        <span style={{ color: "#10b981", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.25rem", whiteSpace: "nowrap" }}>
          <CheckCircle2 size={11} /> {formatBRL(valor)} · {formatData(data)}
        </span>
      ) : (
        <span style={{ color: "var(--text-dim)", whiteSpace: "nowrap" }}>pendente</span>
      )}
    </div>
  );

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9998, animation: "fadein 0.15s ease" }} />
      <aside role="dialog" aria-label="Bônus pago" className="drawer-mobile" style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: "100%", maxWidth: "480px", background: "var(--bg-secondary, #fff)", borderLeft: "1px solid var(--border)", zIndex: 9999, overflowY: "auto", boxShadow: "-8px 0 32px rgba(0,0,0,0.35)", animation: "slidein 0.2s ease" }}>
        <div style={{ position: "sticky", top: 0, background: "var(--bg-secondary, #fff)", borderBottom: "1px solid var(--border)", padding: "0.75rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 1 }}>
          <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Award size={16} /> Bônus pago
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ padding: "0.4rem", background: "transparent", border: 0, color: "var(--text-muted)", cursor: "pointer" }}><X size={18} /></button>
        </div>

        <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ padding: "0.75rem 0.9rem", background: "#10b98110", border: "1px solid #10b98140", borderRadius: "0.5rem" }}>
            <div style={{ fontSize: "0.68rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total pago</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#10b981" }}>{formatBRL(totalPago)}</div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{qtdPartes} pagamento{qtdPartes === 1 ? "" : "s"} · {pagos.length} venda{pagos.length === 1 ? "" : "s"}</div>
          </div>

          {pagos.length === 0 ? (
            <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-dim)", fontSize: "0.82rem", fontStyle: "italic" }}>
              Nenhum bônus pago ainda. Anote &quot;pago&quot; na planilha (Status Corretor / Status Imob) — aparece aqui em até 5 min.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {pagos.map((b) => (
                <div key={b.loteId} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.55rem 0.8rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text)" }}>{b.loteId}</span>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{b.clienteNome}</span>
                  </div>
                  <div style={{ marginTop: "0.3rem" }}>
                    {linhaPaga("Corretor", b.corretorNome || "—", b.valorCorretora, b.pagamento.pagoCorretora, b.pagamento.dataPagoCorretora)}
                    {linhaPaga("Imob", b.imobiliariaNomeFantasia || b.imobiliariaRazaoSocial || "—", b.valorImobiliaria, b.pagamento.pagoImobiliaria, b.pagamento.dataPagoImobiliaria)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
