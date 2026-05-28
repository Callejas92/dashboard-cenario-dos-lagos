"use client";

/**
 * Drawer lateral com detalhe completo de um contrato.
 * Click no fundo OU ESC fecha.
 */
import { useEffect } from "react";
import useSWR from "swr";
import { X, Phone, Mail, User, Calendar, DollarSign, Briefcase, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatBRL, formatBRLCompact, formatData } from "@/lib/utils/formatters";

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

interface FinancRespMin {
  parcelasAReceber?: { identificadorUnidade: string; status: "vencida" | "em_dia"; valor: number; diasAtraso: number; dataVencimento: string; numeroParcela: number; tipoParcela?: string }[];
}

export default function ContratoDrawer({
  contrato,
  onClose,
}: {
  contrato: Contrato | null;
  onClose: () => void;
}) {
  // Busca financeiro pra cruzar com lote (já está em cache global do SWR)
  const { data: financ } = useSWR<FinancRespMin>("/api/uau/financeiro");

  // ESC fecha
  useEffect(() => {
    if (!contrato) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [contrato, onClose]);

  if (!contrato) return null;

  // Filtra parcelas desse lote
  const parcelasDoLote = (financ?.parcelasAReceber || []).filter(
    (p) => p.identificadorUnidade === contrato.loteId,
  );
  const vencidasDoLote = parcelasDoLote.filter((p) => p.status === "vencida");
  const emDiaDoLote = parcelasDoLote.filter((p) => p.status === "em_dia");
  const totalVencido = vencidasDoLote.reduce((s, p) => s + p.valor, 0);
  const totalEmDia = emDiaDoLote.reduce((s, p) => s + p.valor, 0);
  const maxAtraso = vencidasDoLote.reduce((m, p) => Math.max(m, p.diasAtraso), 0);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
          zIndex: 40, animation: "fadein 0.15s ease",
        }}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-label="Detalhe do contrato"
        style={{
          position: "fixed", right: 0, top: 0, bottom: 0,
          width: "100%", maxWidth: "440px",
          background: "var(--surface)", borderLeft: "1px solid var(--border)",
          zIndex: 41, overflowY: "auto",
          boxShadow: "-8px 0 24px rgba(0,0,0,0.15)",
          animation: "slidein 0.2s ease",
        }}
      >
        {/* Header */}
        <div style={{
          position: "sticky", top: 0, background: "var(--surface)",
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
          {/* Valor + status */}
          <div style={{ padding: "0.75rem 1rem", background: "var(--bg, transparent)", border: "1px solid var(--border)", borderRadius: "0.5rem" }}>
            <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginBottom: "0.25rem" }}>VALOR CONTRATADO</div>
            <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--text)" }}>{formatBRL(contrato.valor)}</div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.5rem", display: "flex", gap: "0.75rem" }}>
              <span>{contrato.metragem.toFixed(0)} m²</span>
              <span>•</span>
              <span>{contrato.digital ? "Contrato Digital" : "Contrato Físico"}</span>
            </div>
            <div style={{ marginTop: "0.5rem" }}>
              <span style={{
                fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.6rem",
                background: "var(--border)", color: "var(--text)", borderRadius: "9999px",
              }}>
                {contrato.statusOriginal}
              </span>
            </div>
          </div>

          {/* Cliente */}
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

          {/* Corretor */}
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

          {/* Imobiliária */}
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

          {/* Status financeiro */}
          <div>
            <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <DollarSign size={11} /> Status financeiro
            </div>
            {parcelasDoLote.length === 0 ? (
              <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontStyle: "italic" }}>
                Sem parcelas no UAU (venda recente — aguardando lançamento do financeiro).
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {vencidasDoLote.length > 0 ? (
                  <div style={{ padding: "0.5rem 0.75rem", background: "#dc262615", border: "1px solid #dc262640", borderRadius: "0.375rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", color: "#dc2626", fontWeight: 700, fontSize: "0.8rem" }}>
                      <AlertTriangle size={12} /> Inadimplente
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                      {vencidasDoLote.length} parcela{vencidasDoLote.length > 1 ? "s" : ""} vencida{vencidasDoLote.length > 1 ? "s" : ""} · {formatBRLCompact(totalVencido)}
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginTop: "0.15rem" }}>
                      atraso máximo {maxAtraso} dia{maxAtraso === 1 ? "" : "s"}
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: "0.5rem 0.75rem", background: "#10b98115", border: "1px solid #10b98140", borderRadius: "0.375rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", color: "#10b981", fontWeight: 700, fontSize: "0.8rem" }}>
                      <CheckCircle2 size={12} /> Em dia
                    </div>
                  </div>
                )}
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "grid", gap: "0.15rem" }}>
                  <div>{parcelasDoLote.length} parcela{parcelasDoLote.length === 1 ? "" : "s"} em aberto · {formatBRLCompact(totalVencido + totalEmDia)}</div>
                  {emDiaDoLote.length > 0 && (
                    <div>{emDiaDoLote.length} em dia · {formatBRLCompact(totalEmDia)}</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Datas */}
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
