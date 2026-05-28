"use client";

/**
 * Sub-tab Marketing > Orgânico.
 *
 *  - Instagram (seguidores, alcance, engagement, top posts/stories)
 *  - Site (GA4: visitas, fontes, top páginas, conversões)
 *  - WhatsApp (leads originados via wpp)
 */
import useSWR from "swr";
import { Instagram, Globe, MessageCircle, TrendingUp } from "lucide-react";
import KpiMedium from "@/components/shared/KpiMedium";
import KpiSmall from "@/components/shared/KpiSmall";
import LoadingCard from "@/components/shared/LoadingCard";
import { formatBRLCompact, formatInt, formatPct, truncate } from "@/lib/utils/formatters";

interface InstaResp {
  followers_count?: number;
  followers_change?: number;
  reach?: number;
  engagement?: number;
  top_posts?: { id?: string; caption?: string; likes?: number; comments?: number; reach?: number; media_type?: string; permalink?: string }[];
  top_stories?: { id?: string; caption?: string; reach?: number; impressions?: number }[];
}
interface GaResp {
  totals?: {
    sessions?: number;
    activeUsers?: number;
    averageSessionDuration?: number;
    conversions?: number;
    bounceRate?: number;
  };
  bySource?: { source?: string; sessions?: number }[];
  topPages?: { path?: string; views?: number }[];
}
interface WaResp {
  custoBRL?: number;
  conversas?: number;
  mensagensRecebidas?: number;
  daily?: Record<string, number>;
}

export default function SubTabOrganico() {
  const { data: insta, isLoading: lI } = useSWR<InstaResp>("/api/instagram");
  const { data: ga, isLoading: lG } = useSWR<GaResp>("/api/analytics");
  const { data: wa, isLoading: lW } = useSWR<WaResp>("/api/whatsapp");

  if (lI && lG && lW) {
    return <LoadingCard height={400} label="Carregando dados orgânicos" hint="Instagram + GA4 + WhatsApp Cloud" />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Instagram */}
      <SecaoInstagram insta={insta} loading={lI} />

      {/* Site */}
      <SecaoSite ga={ga} loading={lG} />

      {/* WhatsApp */}
      <SecaoWhatsApp wa={wa} loading={lW} />
    </div>
  );
}

function SecaoInstagram({ insta, loading }: { insta: InstaResp | undefined; loading: boolean }) {
  return (
    <section>
      <h2 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <Instagram size={14} style={{ color: "#E1306C" }} /> Instagram
      </h2>

      {loading || !insta ? (
        <LoadingCard height={120} label="Instagram" hint="conectando..." />
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.625rem" }}>
            <KpiMedium
              label="Seguidores"
              valor={formatInt(insta.followers_count ?? 0)}
              severidade={(insta.followers_change ?? 0) > 0 ? "verde" : (insta.followers_change ?? 0) < 0 ? "vermelho" : "cinza"}
              formula="Seguidores atuais da conta @cenariodoslagos."
              contexto={typeof insta.followers_change === "number" ? `${insta.followers_change > 0 ? "+" : ""}${insta.followers_change} no período` : undefined}
              icon={<TrendingUp size={11} style={{ color: "var(--text-dim)" }} />}
            />
            <KpiMedium
              label="Alcance"
              valor={formatInt(insta.reach ?? 0)}
              formula="Pessoas únicas alcançadas pelas postagens."
            />
            <KpiMedium
              label="Engagement"
              valor={formatInt(insta.engagement ?? 0)}
              formula="Total de interações (likes + comentários + saves) no período."
            />
            <KpiMedium
              label="Top posts"
              valor={String(insta.top_posts?.length ?? 0)}
              formula="Quantidade de posts no período exibidos abaixo."
            />
          </div>

          {/* Top 3 posts */}
          {(insta.top_posts?.length ?? 0) > 0 && (
            <div style={{ marginTop: "0.875rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
              <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
                Top 3 posts
              </div>
              {insta.top_posts!.slice(0, 3).map((p) => (
                <div key={p.id} style={{ padding: "0.5rem 0", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", gap: "1rem", fontSize: "0.8rem" }}>
                  <a href={p.permalink} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text)", textDecoration: "none", flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{truncate(p.caption || "(sem caption)", 70)}</div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>{p.media_type || "—"}</div>
                  </a>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    ♥ {formatInt(p.likes ?? 0)} · 💬 {formatInt(p.comments ?? 0)}
                    {typeof p.reach === "number" && <> · 👁 {formatInt(p.reach)}</>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function SecaoSite({ ga, loading }: { ga: GaResp | undefined; loading: boolean }) {
  return (
    <section>
      <h2 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <Globe size={14} /> Site
      </h2>

      {loading || !ga ? (
        <LoadingCard height={120} label="Site (GA4)" hint="conectando ao Google Analytics..." />
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.625rem" }}>
            <KpiMedium
              label="Visitas"
              valor={formatInt(ga.totals?.sessions ?? 0)}
              formula="Total de sessões no GA4 no período."
            />
            <KpiMedium
              label="Visitantes únicos"
              valor={formatInt(ga.totals?.activeUsers ?? 0)}
              formula="Usuários ativos únicos no GA4."
            />
            <KpiMedium
              label="Conversões"
              valor={formatInt(ga.totals?.conversions ?? 0)}
              formula="Conversões registradas no GA4 (formulários, contatos, etc)."
              severidade={(ga.totals?.conversions ?? 0) > 0 ? "verde" : "cinza"}
            />
            <KpiMedium
              label="Taxa de rejeição"
              valor={ga.totals?.bounceRate ? formatPct(ga.totals.bounceRate / 100) : "—"}
              formula="Taxa de bounce do GA4 (% sessões que saíram sem interagir)."
              severidade={(ga.totals?.bounceRate ?? 100) < 40 ? "verde" : (ga.totals?.bounceRate ?? 100) < 60 ? "amarelo" : "vermelho"}
            />
          </div>

          {/* Fontes */}
          {ga.bySource && ga.bySource.length > 0 && (
            <div style={{ marginTop: "0.875rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
              <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
                Fontes de tráfego
              </div>
              {ga.bySource.slice(0, 8).map((s) => {
                const total = (ga.bySource || []).reduce((sum, x) => sum + (x.sessions ?? 0), 0);
                const pct = total > 0 ? (s.sessions ?? 0) / total : 0;
                return (
                  <div key={s.source} style={{ display: "grid", gridTemplateColumns: "120px 1fr 80px", gap: "0.5rem", alignItems: "center", padding: "0.25rem 0" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text)", fontWeight: 600 }}>{truncate(s.source || "—", 15)}</div>
                    <div style={{ height: "8px", background: "var(--border)", borderRadius: "9999px", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct * 100}%`, background: "#10b981", borderRadius: "9999px" }} />
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textAlign: "right" }}>
                      {formatInt(s.sessions ?? 0)} <span style={{ color: "var(--text-dim)" }}>({formatPct(pct, { casas: 0 })})</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Top páginas */}
          {ga.topPages && ga.topPages.length > 0 && (
            <div style={{ marginTop: "0.625rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
              <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
                Top 5 páginas
              </div>
              {ga.topPages.slice(0, 5).map((p) => (
                <div key={p.path} style={{ display: "flex", justifyContent: "space-between", padding: "0.3rem 0", fontSize: "0.75rem" }}>
                  <span style={{ color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{truncate(p.path || "/", 50)}</span>
                  <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>{formatInt(p.views ?? 0)} views</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function SecaoWhatsApp({ wa, loading }: { wa: WaResp | undefined; loading: boolean }) {
  return (
    <section>
      <h2 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <MessageCircle size={14} style={{ color: "#25D366" }} /> WhatsApp
      </h2>

      {loading || !wa ? (
        <LoadingCard height={120} label="WhatsApp" hint="conectando..." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.625rem" }}>
          <KpiSmall
            label="Conversas"
            valor={formatInt(wa.conversas ?? 0)}
            formula="Conversas únicas iniciadas no WhatsApp Business no período."
          />
          <KpiSmall
            label="Mensagens recebidas"
            valor={formatInt(wa.mensagensRecebidas ?? 0)}
            formula="Total de mensagens entrantes."
          />
          <KpiSmall
            label="Custo"
            valor={formatBRLCompact(wa.custoBRL ?? 0)}
            formula="Custo do WhatsApp Business API (sessões pagas)."
          />
        </div>
      )}
    </section>
  );
}
