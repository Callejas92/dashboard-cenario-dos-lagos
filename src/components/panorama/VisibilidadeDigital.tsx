"use client";

/**
 * Visibilidade digital — quanto o digital GERA de alcance/tráfego/leads, honestamente.
 *
 * Mede VISIBILIDADE (não inventa atribuição): alcance pago (Meta), impressões (Google),
 * tráfego do site (GA4 — orgânico+direto = "marca pegando", sem ninguém reportar nada),
 * seguidores (IG) e leads. A "venda direta do digital" é editável (o corretor não reporta
 * origem, então só a venda que fechou DIRETO pelo digital é conhecida). O resto fecha pelo
 * canal — o "funil escuro", que não é atribuível.
 */
import { useState, type ReactNode } from "react";
import useSWR from "swr";
import { Radio, Pencil, Check, X } from "lucide-react";
import { authFetch } from "@/lib/client-auth";
import { formatInt } from "@/lib/utils/formatters";

interface MetaResp { totals?: { reach?: number; impressions?: number; clicks?: number; leads?: number } }
interface GoogleResp { totals?: { impressions?: number; clicks?: number; conversions?: number } }
interface IgResp { configured?: boolean; perfil?: { seguidores?: number }; metricas?: { engagementRate?: number } }
interface GaResp { configured?: boolean; overview?: { sessions?: number }; sources?: { channel: string; sessions: number }[] }
interface VdResp { valor?: number }

const ORG_DIR = new Set(["Organic Search", "Organic Social", "Direct"]);
const fmt = (v: number | undefined | null) => (v == null ? "…" : formatInt(v));

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
  const leadsDigital =
    meta?.totals || goog?.totals
      ? (meta?.totals?.leads ?? 0) + (goog?.totals?.conversions ?? 0)
      : undefined;
  const gaSessions = ga?.configured ? ga?.overview?.sessions : undefined;
  const orgDir = ga?.sources
    ? ga.sources.filter((s) => ORG_DIR.has(s.channel)).reduce((a, s) => a + s.sessions, 0)
    : undefined;
  const vendaDireta = vd?.valor;

  async function salvar() {
    const n = Number(valorEdit);
    if (!Number.isFinite(n) || n < 0) { setEditando(false); return; }
    setSalvando(true);
    try {
      const r = await authFetch("/api/venda-digital", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valor: n }),
      });
      if (r.ok) { const j = await r.json(); await mutateVd({ valor: j.valor }, { revalidate: false }); }
    } catch { /* ignora */ } finally { setSalvando(false); setEditando(false); }
  }

  const tile = (label: string, valor: ReactNode, sub?: string, destaque = false) => (
    <div style={{ background: destaque ? "#3b82f614" : "var(--bg-secondary, rgba(127,127,127,0.04))", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.7rem 0.85rem" }}>
      <div style={{ fontSize: "0.7rem", color: destaque ? "#3b82f6" : "var(--text-muted)", fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--text)", lineHeight: 1.1, marginTop: "0.15rem" }}>{valor}</div>
      {sub && <div style={{ fontSize: "0.66rem", color: "var(--text-dim)", marginTop: "0.1rem" }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
      <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.875rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <Radio size={12} />
        <span>Visibilidade digital</span>
        <span style={{ marginLeft: "auto", fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
          últimos 30 dias · mede alcance, não atribuição
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.6rem" }}>
        {tile("Alcance (Meta)", fmt(reach), reach != null ? "pessoas alcançadas" : "carregando")}
        {tile("Tráfego do site (GA4)", fmt(gaSessions), orgDir != null ? `${formatInt(orgDir)} orgânico+direto` : "sessões")}
        {tile("Impressões (Google)", fmt(imprGoogle), "anúncios")}
        {tile("Seguidores IG", fmt(segIg), engIg != null ? `${engIg}% engajamento` : "instagram")}
        {tile("Leads digitais", fmt(leadsDigital), "Meta + Google")}

        {/* Venda direta — editável */}
        <div style={{ background: "#3b82f614", border: "1px solid #3b82f640", borderRadius: "0.5rem", padding: "0.7rem 0.85rem" }}>
          <div style={{ fontSize: "0.7rem", color: "#3b82f6", fontWeight: 500, display: "flex", alignItems: "center", gap: "0.3rem" }}>
            Venda direta digital
            {!editando && (
              <button
                onClick={() => { setValorEdit(String(vendaDireta ?? "")); setEditando(true); }}
                title="Editar"
                style={{ background: "transparent", border: "none", color: "#3b82f6", cursor: "pointer", padding: 0, display: "inline-flex", marginLeft: "auto" }}
              >
                <Pencil size={11} />
              </button>
            )}
          </div>
          {editando ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", marginTop: "0.2rem" }}>
              <input
                type="number" min={0} autoFocus value={valorEdit}
                onChange={(e) => setValorEdit(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") salvar(); if (e.key === "Escape") setEditando(false); }}
                style={{ width: 56, fontSize: "1.1rem", fontWeight: 700, background: "var(--bg-secondary, #fff)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "0.3rem", padding: "0.1rem 0.3rem" }}
              />
              <button onClick={salvar} disabled={salvando} title="Salvar" style={{ background: "transparent", border: "none", color: "#10b981", cursor: "pointer", padding: 2 }}><Check size={15} /></button>
              <button onClick={() => setEditando(false)} title="Cancelar" style={{ background: "transparent", border: "none", color: "#dc2626", cursor: "pointer", padding: 2 }}><X size={15} /></button>
            </div>
          ) : (
            <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--text)", lineHeight: 1.1, marginTop: "0.15rem" }}>{fmt(vendaDireta)}</div>
          )}
          <div style={{ fontSize: "0.66rem", color: "var(--text-dim)", marginTop: "0.1rem" }}>fechou direto pelo digital</div>
        </div>
      </div>

      <div style={{ marginTop: "0.75rem", padding: "0.5rem 0.75rem", background: "#3b82f614", borderRadius: "0.375rem", fontSize: "0.74rem", color: "var(--text)", lineHeight: 1.5 }}>
        Muito alcance e {leadsDigital != null ? `~${formatInt(leadsDigital)} leads` : "leads"}, mas <strong>{fmt(vendaDireta)} venda{(vendaDireta ?? 0) === 1 ? "" : "s"} direta{(vendaDireta ?? 0) === 1 ? "" : "s"}</strong>. Não é falha do digital nem prova de sucesso — o resto fecha pelo canal (o &quot;funil escuro&quot;), e isso não é atribuível. Aqui medimos <strong>visibilidade</strong>; o tráfego <strong>orgânico+direto</strong> é o sinal de marca pegando, sem ninguém reportar nada.
      </div>
    </div>
  );
}
