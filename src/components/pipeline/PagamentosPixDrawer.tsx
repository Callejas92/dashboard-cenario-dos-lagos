"use client";

/**
 * Painel lateral de pagamentos por PIX — agregado POR RECEBEDOR.
 *  - Corretor (PF) → R$ 3k por bônus · Imobiliária (externa) → R$ 1k por bônus
 *  - Coluna PIX editável (salva por CPF/CNPJ em /api/pix)
 *  - "Já pago" = automático dos bônus marcados pagos · "A pagar" = autorizado (≥1,5%) ainda não pago
 */
import { useEffect, useState } from "react";
import useSWR, { mutate } from "swr";
import { X, CheckCircle2, Clock, Wallet } from "lucide-react";
import { formatBRL } from "@/lib/utils/formatters";
import { authFetch } from "@/lib/client-auth";

const NOMES_IMOBILIARIA = ["EGGS", "GESTÃO", "GESTAO", "INTELIGENCIA EM VENDAS"];
const isImob = (nome: string) => {
  const u = (nome || "").toUpperCase();
  return NOMES_IMOBILIARIA.some((n) => u.includes(n));
};

export interface BonusPixItem {
  corretorNome: string;
  corretorCpf?: string;
  imobiliariaRazaoSocial: string;
  imobiliariaNomeFantasia?: string;
  imobiliariaCnpj?: string;
  autorizado?: boolean;
  entradaQuitada?: boolean;
  valorCorretora: number;
  valorImobiliaria: number;
  status: string;
  cancelado?: boolean;
  pagamento: { pagoCorretora: boolean; pagoImobiliaria: boolean; isento?: boolean };
}

interface Recebedor {
  doc: string;
  nome: string;
  tipo: "corretor" | "imobiliaria";
  jaPagoQtd: number;
  jaPagoVal: number;
  aPagarQtd: number;
  aPagarVal: number;
}

export default function PagamentosPixDrawer({ bonus, onClose }: { bonus: BonusPixItem[]; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const { data: pixData } = useSWR<{ pix?: Record<string, string> }>("/api/pix");
  const pixMap = pixData?.pix || {};
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState<string | null>(null);

  // ── Agrega por recebedor ──
  const corretores = new Map<string, Recebedor>();
  const imobs = new Map<string, Recebedor>();
  for (const b of bonus) {
    if (b.pagamento?.isento || b.cancelado) continue;
    // Estrito: só a regra atual (≥1,5% pago) autoriza — nunca cai pra entradaQuitada (regra antiga).
    const aut = b.autorizado === true;
    // Corretor R$3k (só PF real, não imobiliária atuando como corretor)
    if (b.corretorNome && !isImob(b.corretorNome)) {
      const doc = (b.corretorCpf || b.corretorNome).trim();
      const r = corretores.get(doc) || { doc, nome: b.corretorNome, tipo: "corretor" as const, jaPagoQtd: 0, jaPagoVal: 0, aPagarQtd: 0, aPagarVal: 0 };
      if (b.pagamento?.pagoCorretora) { r.jaPagoQtd++; r.jaPagoVal += b.valorCorretora; }
      else if (aut) { r.aPagarQtd++; r.aPagarVal += b.valorCorretora; }
      corretores.set(doc, r);
    }
    // Imobiliária R$1k (só externa — Eggs/Gestão não recebem bônus)
    if (b.imobiliariaRazaoSocial && !isImob(b.imobiliariaRazaoSocial)) {
      const doc = (b.imobiliariaCnpj || b.imobiliariaRazaoSocial).trim();
      const nome = b.imobiliariaNomeFantasia || b.imobiliariaRazaoSocial;
      const r = imobs.get(doc) || { doc, nome, tipo: "imobiliaria" as const, jaPagoQtd: 0, jaPagoVal: 0, aPagarQtd: 0, aPagarVal: 0 };
      if (b.pagamento?.pagoImobiliaria) { r.jaPagoQtd++; r.jaPagoVal += b.valorImobiliaria; }
      else if (aut) { r.aPagarQtd++; r.aPagarVal += b.valorImobiliaria; }
      imobs.set(doc, r);
    }
  }
  const ordena = (a: Recebedor, b: Recebedor) => b.aPagarVal - a.aPagarVal || b.jaPagoVal - a.jaPagoVal || a.nome.localeCompare(b.nome);
  const listaCorr = Array.from(corretores.values()).sort(ordena);
  const listaImob = Array.from(imobs.values()).sort(ordena);
  const todos = [...listaCorr, ...listaImob];

  const totJaPagoQtd = todos.reduce((s, r) => s + r.jaPagoQtd, 0);
  const totJaPagoVal = todos.reduce((s, r) => s + r.jaPagoVal, 0);
  const totAPagarQtd = todos.reduce((s, r) => s + r.aPagarQtd, 0);
  const totAPagarVal = todos.reduce((s, r) => s + r.aPagarVal, 0);

  async function salvarPix(doc: string, pix: string) {
    setSalvando(doc);
    try {
      const res = await authFetch("/api/pix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ doc, pix }) });
      if (res.status === 401) alert("Sessão expirada — recarregue a página e faça login de novo.");
      // Read-your-writes: aplica o mapa devolvido direto (blob pode servir velho ~60s)
      const j = await res.json().catch(() => null);
      if (j?.pixMap) await mutate("/api/pix", { pix: j.pixMap }, { revalidate: false });
      else await mutate("/api/pix");
    } finally {
      setSalvando(null);
    }
  }

  const cardTotal = (label: string, qtd: number, val: number, cor: string, Icon: typeof Clock) => (
    <div style={{ flex: 1, padding: "0.75rem 0.9rem", background: `${cor}10`, border: `1px solid ${cor}40`, borderRadius: "0.5rem" }}>
      <div style={{ fontSize: "0.68rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "0.3rem" }}><Icon size={11} /> {label}</div>
      <div style={{ fontSize: "1.25rem", fontWeight: 700, color: cor }}>{formatBRL(val)}</div>
      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{qtd} bônus</div>
    </div>
  );

  const renderSecao = (titulo: string, lista: Recebedor[]) => (
    <div>
      <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>
        {titulo} <span style={{ color: "var(--text-muted)" }}>({lista.length})</span>
      </div>
      {lista.length === 0 ? (
        <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", fontStyle: "italic", padding: "0.4rem 0" }}>nenhum</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {lista.map((r) => {
            const pixVal = editing[r.doc] ?? pixMap[r.doc] ?? "";
            return (
              <div key={r.doc} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.6rem 0.8rem" }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text)" }}>{r.nome}</div>
                <input
                  value={pixVal}
                  placeholder="Chave PIX (CPF, e-mail, telefone, aleatória)"
                  onChange={(e) => setEditing((s) => ({ ...s, [r.doc]: e.target.value }))}
                  onBlur={(e) => { if ((e.target.value.trim()) !== (pixMap[r.doc] || "")) salvarPix(r.doc, e.target.value.trim()); }}
                  style={{ width: "100%", marginTop: "0.35rem", padding: "0.35rem 0.5rem", fontSize: "0.78rem", background: "var(--bg-secondary, #fff)", border: "1px solid var(--border)", borderRadius: "0.35rem", color: "var(--text)" }}
                />
                <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.45rem", fontSize: "0.75rem" }}>
                  <span style={{ color: r.aPagarVal > 0 ? "#f59e0b" : "var(--text-dim)", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.25rem" }}>
                    <Clock size={11} /> A pagar: {r.aPagarQtd} · {formatBRL(r.aPagarVal)}
                  </span>
                  <span style={{ color: r.jaPagoVal > 0 ? "#10b981" : "var(--text-dim)", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.25rem" }}>
                    <CheckCircle2 size={11} /> Pago: {r.jaPagoQtd} · {formatBRL(r.jaPagoVal)}
                  </span>
                  {salvando === r.doc ? <span style={{ color: "var(--text-dim)", fontSize: "0.7rem" }}>salvando…</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9998, animation: "fadein 0.15s ease" }} />
      <aside role="dialog" aria-label="Pagamentos por PIX" className="drawer-mobile" style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: "100%", maxWidth: "480px", background: "var(--bg-secondary, #fff)", borderLeft: "1px solid var(--border)", zIndex: 9999, overflowY: "auto", boxShadow: "-8px 0 32px rgba(0,0,0,0.35)", animation: "slidein 0.2s ease" }}>
        <div style={{ position: "sticky", top: 0, background: "var(--bg-secondary, #fff)", borderBottom: "1px solid var(--border)", padding: "0.75rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 1 }}>
          <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Wallet size={16} /> Pagamentos por PIX
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ padding: "0.4rem", background: "transparent", border: 0, color: "var(--text-muted)", cursor: "pointer" }}><X size={18} /></button>
        </div>

        <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            {cardTotal("A pagar", totAPagarQtd, totAPagarVal, "#f59e0b", Clock)}
            {cardTotal("Já pago", totJaPagoQtd, totJaPagoVal, "#10b981", CheckCircle2)}
          </div>
          <div style={{ fontSize: "0.68rem", color: "var(--text-dim)", lineHeight: 1.4 }}>
            Corretor recebe R$ 3.000/bônus · imobiliária R$ 1.000/bônus. &quot;A pagar&quot; = autorizado (≥1,5% pago) ainda não pago. &quot;Pago&quot; vem automático do que você marca na lista. O PIX é salvo por CPF/CNPJ.
          </div>
          {renderSecao("Corretores", listaCorr)}
          {renderSecao("Imobiliárias", listaImob)}
        </div>
      </aside>
    </>
  );
}
