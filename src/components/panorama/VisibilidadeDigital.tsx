"use client";

/**
 * Visibilidade digital — o "caminho até a venda", honesto (sem inventar atribuição).
 *
 * Agrupado: TE VEEM (alcance/tráfego/seguidores) → DEMONSTRAM INTERESSE (leads, WhatsApp)
 * → COMPRAM DIRETO (venda direta, editável). O tráfego orgânico+direto é o termômetro de
 * marca; o WhatsApp é a ponte pro corretor (o resto fecha pelo canal — funil escuro).
 */
import { useState } from "react";
import useSWR from "swr";
import { Radio, Pencil, Check, X } from "lucide-react";
import { authFetch } from "@/lib/client-auth";
import { formatInt } from "@/lib/utils/formatters";

interface MetaResp { totals?: { reach?: number; impressions?: number } }
interface GoogleResp { totals?: { impressions?: number } }
interface IgResp { perfil?: { seguidores?: number }; metricas?: { engagementRate?: number } }
interface GaResp { configured?: boolean; overview?: { sessions?: number }; sources?: { channel: string; sessions: number }[]; eventos?: { nome: string; qtd: number }[]; whatsappPorBotao?: { source: string; cliques: number }[] }
interface VdResp { valor?: number }

const ORG_DIR = new Set(["Organic Search", "Organic Social", "Direct"]);
const NAO_DEF = /not.?set|não def|nao def/i;
const fmt = (v: number | null | undefined) => (v == null ? "…" : formatInt(v));

export default function VisibilidadeDigital() {
  const { data: meta } = useSWR<MetaResp>("/api/meta-ads");
  const { data: goog } = useSWR<GoogleResp>("/api/google-ads");
  const { data: ig } = useSWR<IgResp>("/api/instagram");
  const { data: ga } = useSWR<GaResp>("/api/analytics");
  const { data: vd, mutate: mutateVd } = useSWR<VdResp>("/api/venda-digital");

  const [editando, setEditando] = useState(false);
  const [valorEdit, setValorEdit] = useState("");
  const [salvando, setSalvando] = useState(false);

  const reach = meta?.totals?.reach;
  const imprGoogle = goog?.totals?.impressions;
  const segIg = ig?.perfil?.seguidores;
  const engIg = ig?.metricas?.engagementRate;
  const gaSessions = ga?.configured ? ga?.overview?.sessions : undefined;
  const orgDir = ga?.sources ? ga.sources.filter((s) => ORG_DIR.has(s.channel)).reduce((a, s) => a + s.sessions, 0) : undefined;
  const ev = (nome: string) => ga?.eventos?.find((e) => e.nome === nome)?.qtd;
  const leadsSite = ga?.eventos ? (ev("generate_lead") ?? 0) : undefined;
  const whats = ga?.eventos ? (ev("click_whatsapp") ?? 0) : undefined;
  const shares = ga?.eventos ? (ev("book_share") ?? 0) : undefined;
  const waBotoes = (ga?.whatsappPorBotao || []).filter((b) => b.source && !NAO_DEF.test(b.source));
  const vendaDireta = vd?.valor;

  async function salvar() {
    const n = Number(valorEdit);
    if (!Number.isFinite(n) || n < 0) { setEditando(false); return; }
    setSalvando(true);
    try {
      const r = await authFetch("/api/venda-digital", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valor: n }) });
      if (r.ok) { const j = await r.json(); await mutateVd({ valor: j.valor }, { revalidate: false }); }
    } catch { /* ignora */ } finally { setSalvando(false); setEditando(false); }
  }

  const M = ({ n, label, cor }: { n: string; label: string; cor?: string }) => (
    <span style={{ fontSize: "0.92rem", color: "var(--text)" }}>
      <b style={{ color: cor || "var(--text)", fontWeight: 700 }}>{n}</b>{" "}
      <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>{label}</span>
    </span>
  );
  const grupoLabel = (txt: string) => (
    <div style={{ fontSize: "0.62rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.3rem" }}>{txt}</div>
  );

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
      <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.875rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <Radio size={12} />
        <span>Digital — o caminho até a venda</span>
        <span style={{ marginLeft: "auto", fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>últimos 30 dias</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
        <div>
          {grupoLabel("1 · te veem")}
          <div style={{ display: "flex", gap: "0.4rem 1.1rem", flexWrap: "wrap" }}>
            <M n={fmt(reach)} label="alcance (Meta)" />
            <M n={fmt(gaSessions)} label={orgDir != null ? `visitas (${formatInt(orgDir)} orgânico+direto)` : "visitas ao site"} />
            <M n={fmt(segIg)} label={engIg != null ? `seguidores (${engIg}% eng)` : "seguidores IG"} />
            <M n={fmt(imprGoogle)} label="impressões (Google)" />
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.6rem" }}>
          {grupoLabel("2 · demonstram interesse")}
          <div style={{ display: "flex", gap: "0.4rem 1.1rem", flexWrap: "wrap", alignItems: "baseline" }}>
            <M n={fmt(leadsSite)} label="leads no site" />
            <span>
              <M n={fmt(whats)} label="cliques no WhatsApp" cor="#3b82f6" />
              <span style={{ fontSize: "0.66rem", color: "var(--text-dim)", marginLeft: "0.3rem" }}>{waBotoes.length ? `· ${waBotoes.length} botões` : "· por botão: coletando"}</span>
            </span>
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.6rem" }}>
          {grupoLabel("3 · compram direto pelo digital")}
          {editando ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
              <input type="number" min={0} autoFocus value={valorEdit} onChange={(e) => setValorEdit(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") salvar(); if (e.key === "Escape") setEditando(false); }} style={{ width: 54, fontSize: "1rem", fontWeight: 700, background: "var(--bg-secondary, #fff)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "0.3rem", padding: "0.1rem 0.3rem" }} />
              <button onClick={salvar} disabled={salvando} title="Salvar" style={{ background: "transparent", border: "none", color: "#10b981", cursor: "pointer", padding: 2 }}><Check size={15} /></button>
              <button onClick={() => setEditando(false)} title="Cancelar" style={{ background: "transparent", border: "none", color: "#dc2626", cursor: "pointer", padding: 2 }}><X size={15} /></button>
            </span>
          ) : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
              <M n={fmt(vendaDireta)} label={`venda${(vendaDireta ?? 0) === 1 ? "" : "s"} fechada${(vendaDireta ?? 0) === 1 ? "" : "s"} direto pelo digital`} cor="#3b82f6" />
              <button onClick={() => { setValorEdit(String(vendaDireta ?? "")); setEditando(true); }} title="Editar" style={{ background: "transparent", border: "none", color: "var(--text-dim)", cursor: "pointer", padding: 0, display: "inline-flex" }}><Pencil size={12} /></button>
            </span>
          )}
        </div>
      </div>

      <div style={{ marginTop: "0.75rem", padding: "0.5rem 0.75rem", background: "#3b82f614", borderRadius: "0.375rem", fontSize: "0.74rem", color: "var(--text)", lineHeight: 1.5 }}>
        Muita gente vê e <strong>{fmt(whats)} clicam no WhatsApp</strong>, mas só <strong>{fmt(vendaDireta)}</strong> fecha direto. O digital gera o interesse, o <strong>corretor fecha</strong> — por isso a maioria não aparece como "venda digital" (o funil escuro). O tráfego orgânico+direto é o sinal de marca pegando.{shares != null && shares > 0 ? ` ${shares} compartilharam o book.` : ""}
      </div>
    </div>
  );
}
