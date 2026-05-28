"use client";

/**
 * Sub-tab Marketing > CRM / Leads.
 *
 *  - 4 KPIs (Total / Novos / Em atendimento / Arquivados)
 *  - Gráfico "Leads por dia" (corrige D7 do briefing)
 *  - Distribuição "Por Fonte" (max 4 fatias, sem pizza)
 *  - Distribuição "Por Atendente/Corretor"
 *  - Tabela leads recentes
 *  - Alerta: leads sem atendimento >24h
 *
 * IMPORTANTE: NÃO mostrar "taxa conversão CRM→venda" (briefing).
 * Vendas vêm por corretor fora do CRM.
 */
import { useMemo } from "react";
import useSWR from "swr";
import { Users, AlertTriangle, Phone, Clock } from "lucide-react";
import KpiMedium from "@/components/shared/KpiMedium";
import LoadingCard from "@/components/shared/LoadingCard";
import { formatInt, formatPct, formatData, formatTempoRelativo, truncate } from "@/lib/utils/formatters";

interface Lead {
  id?: string;
  nome?: string;
  telefone?: string;
  email?: string;
  fonte?: string;
  corretor?: string;
  status?: string;
  statusAlias?: string;
  criadoEm?: string;
  atualizadoEm?: string;
}
interface CrmResp {
  totalLeads?: number;
  novos?: number;
  emAtendimento?: number;
  convertidos?: number;
  porFonte?: { fonte: string; qtd: number }[];
  porCorretor?: { corretor: string; qtd: number }[];
  porStatus?: { status: string; qtd: number }[];
  porDia?: { data: string; qtd: number }[];
  leads?: Lead[];
}

export default function SubTabCrmLeads() {
  const { data, isLoading } = useSWR<CrmResp>("/api/crm");

  if (isLoading || !data) {
    return <LoadingCard height={400} label="Carregando leads do CRM" hint="Eggs CRM pode demorar 5-15s no primeiro acesso" />;
  }

  const total = data.totalLeads ?? 0;
  const novos = data.novos ?? 0;
  const emAtend = data.emAtendimento ?? 0;
  const arquivados = (data.porStatus || []).filter((s) => s.status?.toLowerCase().includes("arquiv") || s.status?.toLowerCase() === "perdido" || s.status?.toLowerCase() === "lost").reduce((sum, s) => sum + (s.qtd ?? 0), 0);

  // Leads sem atendimento >24h: status "Novo" com criadoEm > 24h
  const leadsSemAtendimento24h = useLeadsSemAtendimento(data.leads || []);

  // Por fonte ordenado (top 4 + outros)
  const fontesTop4 = useTop4Plus(data.porFonte || [], (x) => x.qtd);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* KPIs topo */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0.625rem" }}>
        <KpiMedium
          label="Total leads"
          valor={formatInt(total)}
          formula="Total de leads no CRM Eggs (desde lançamento)."
          icon={<Users size={11} style={{ color: "var(--text-dim)" }} />}
        />
        <KpiMedium
          label="Novos"
          valor={formatInt(novos)}
          severidade={novos > 0 ? "verde" : "cinza"}
          formula="Leads em status 'Novo' — ainda não foram atendidos."
        />
        <KpiMedium
          label="Em atendimento"
          valor={formatInt(emAtend)}
          formula="Leads em status 'In attendance' (negociação ativa)."
        />
        <KpiMedium
          label="Arquivados"
          valor={formatInt(arquivados)}
          severidade="cinza"
          formula="Leads marcados como 'Arquivado' ou 'Perdido'."
        />
      </div>

      {/* Alerta leads sem atendimento >24h */}
      {leadsSemAtendimento24h.length > 0 && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: "0.75rem",
          padding: "0.75rem 1rem", background: "#dc262615",
          borderLeft: "4px solid #dc2626", borderRadius: "0.5rem",
        }}>
          <AlertTriangle size={16} style={{ color: "#dc2626", flexShrink: 0, marginTop: "0.125rem" }} />
          <div style={{ fontSize: "0.825rem" }}>
            <strong style={{ color: "#dc2626" }}>{leadsSemAtendimento24h.length} lead{leadsSemAtendimento24h.length > 1 ? "s" : ""} sem atendimento há mais de 24h</strong>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
              {leadsSemAtendimento24h.slice(0, 3).map((l) => l.nome).join(", ")}
              {leadsSemAtendimento24h.length > 3 ? ` +${leadsSemAtendimento24h.length - 3}` : ""}
            </div>
          </div>
        </div>
      )}

      {/* Por Fonte + Por Atendente lado a lado */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
        <Distribuicao titulo="Leads por fonte" itens={fontesTop4} totalRef={total} />
        {(data.porCorretor || []).length > 0 && (
          <Distribuicao titulo="Leads por atendente" itens={useTop4Plus(data.porCorretor || [], (x) => x.qtd, "corretor")} totalRef={total} />
        )}
      </div>

      {/* Leads por dia (gráfico simples) */}
      <LeadsPorDia porDia={data.porDia || []} />

      {/* Tabela leads recentes */}
      <TabelaLeads leads={data.leads || []} />

      <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", textAlign: "right", fontStyle: "italic" }}>
        Fonte: CRM Eggs. NOTA: não cruzamos lead → venda (vendas vêm por corretor fora do CRM).
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function useLeadsSemAtendimento(leads: Lead[]): Lead[] {
  return useMemo(() => {
    const limite = Date.now() - 24 * 60 * 60 * 1000;
    return leads.filter((l) => {
      if (!l.criadoEm) return false;
      const status = (l.status || "").toLowerCase();
      if (status !== "novo" && status !== "new" && l.statusAlias !== "new") return false;
      const t = new Date(l.criadoEm).getTime();
      return Number.isFinite(t) && t < limite;
    });
  }, [leads]);
}

function useTop4Plus<T>(itens: T[], qtdFn: (x: T) => number, key?: keyof T): { nome: string; qtd: number }[] {
  return useMemo(() => {
    const sorted = [...itens].sort((a, b) => qtdFn(b) - qtdFn(a));
    if (sorted.length <= 4) {
      return sorted.map((x) => ({
        nome: String((x as Record<string, unknown>)[key as string] ?? (x as { fonte?: string }).fonte ?? "—"),
        qtd: qtdFn(x),
      }));
    }
    const top3 = sorted.slice(0, 3).map((x) => ({
      nome: String((x as Record<string, unknown>)[key as string] ?? (x as { fonte?: string }).fonte ?? "—"),
      qtd: qtdFn(x),
    }));
    const outros = sorted.slice(3).reduce((s, x) => s + qtdFn(x), 0);
    return [...top3, { nome: "Outros", qtd: outros }];
  }, [itens, qtdFn, key]);
}

function Distribuicao({ titulo, itens, totalRef }: { titulo: string; itens: { nome: string; qtd: number }[]; totalRef: number }) {
  const total = itens.reduce((s, i) => s + i.qtd, 0) || totalRef || 1;
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
      <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.625rem" }}>
        {titulo}
      </div>
      {itens.length === 0 ? (
        <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>—</div>
      ) : (
        itens.map((it) => {
          const pct = it.qtd / total;
          return (
            <div key={it.nome} style={{ display: "grid", gridTemplateColumns: "minmax(110px, 140px) 1fr 60px", gap: "0.5rem", alignItems: "center", padding: "0.2rem 0" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text)", fontWeight: 600 }}>{truncate(it.nome, 16)}</div>
              <div style={{ height: "12px", background: "var(--border)", borderRadius: "9999px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct * 100}%`, background: "#4285f4", borderRadius: "9999px" }} />
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textAlign: "right" }}>
                {formatInt(it.qtd)} <span style={{ color: "var(--text-dim)" }}>({formatPct(pct, { casas: 0 })})</span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function LeadsPorDia({ porDia }: { porDia: { data: string; qtd: number }[] }) {
  const ultimos30 = porDia.slice(-30);
  const max = Math.max(1, ...ultimos30.map((d) => d.qtd));
  const total = ultimos30.reduce((s, d) => s + d.qtd, 0);
  const media = ultimos30.length > 0 ? total / ultimos30.length : 0;

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem", alignItems: "baseline" }}>
        <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Leads por dia · últimos 30 dias
        </div>
        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
          {formatInt(total)} no período · média {media.toFixed(1)}/dia
        </div>
      </div>

      {ultimos30.length === 0 ? (
        <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Sem dados.</div>
      ) : (
        <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "80px" }}>
          {ultimos30.map((d) => (
            <div
              key={d.data}
              title={`${formatData(d.data)}: ${d.qtd} leads`}
              style={{
                flex: 1,
                background: "#10b981",
                height: `${(d.qtd / max) * 100}%`,
                minHeight: d.qtd > 0 ? "3px" : "1px",
                borderRadius: "2px 2px 0 0",
                opacity: d.qtd === 0 ? 0.3 : 1,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TabelaLeads({ leads }: { leads: Lead[] }) {
  const recentes = [...leads].sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || "")).slice(0, 20);
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem", overflowX: "auto" }}>
      <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
        Últimos 20 leads
      </div>
      {recentes.length === 0 ? (
        <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Sem leads ainda.</div>
      ) : (
        <table style={{ width: "100%", fontSize: "0.8rem", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--text-dim)", fontSize: "0.65rem", textTransform: "uppercase", fontWeight: 600 }}>
              <th style={{ padding: "0.4rem 0.2rem" }}>Nome</th>
              <th style={{ padding: "0.4rem 0.2rem" }}>Contato</th>
              <th style={{ padding: "0.4rem 0.2rem" }}>Fonte</th>
              <th style={{ padding: "0.4rem 0.2rem" }}>Atendente</th>
              <th style={{ padding: "0.4rem 0.2rem" }}>Status</th>
              <th style={{ padding: "0.4rem 0.2rem" }}>Criado</th>
            </tr>
          </thead>
          <tbody>
            {recentes.map((l) => (
              <tr key={l.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "0.4rem 0.2rem", color: "var(--text)", fontWeight: 600 }}>{truncate(l.nome || "—", 20)}</td>
                <td style={{ padding: "0.4rem 0.2rem", color: "var(--text-muted)", fontSize: "0.7rem" }}>
                  {l.telefone && <div style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}><Phone size={9} />{l.telefone}</div>}
                  {l.email && <div>{truncate(l.email, 22)}</div>}
                </td>
                <td style={{ padding: "0.4rem 0.2rem", color: "var(--text-muted)", fontSize: "0.7rem" }}>{l.fonte || "—"}</td>
                <td style={{ padding: "0.4rem 0.2rem", color: "var(--text-muted)", fontSize: "0.7rem" }}>{truncate(l.corretor || "—", 16)}</td>
                <td style={{ padding: "0.4rem 0.2rem" }}>
                  <span style={{
                    fontSize: "0.6rem", fontWeight: 700, padding: "0.1rem 0.4rem", borderRadius: "9999px",
                    background: l.statusAlias === "new" ? "#10b98115" : l.statusAlias === "lost" ? "#6b728015" : "#f59e0b15",
                    color: l.statusAlias === "new" ? "#10b981" : l.statusAlias === "lost" ? "#6b7280" : "#f59e0b",
                  }}>
                    {l.status || "—"}
                  </span>
                </td>
                <td style={{ padding: "0.4rem 0.2rem", color: "var(--text-muted)", fontSize: "0.7rem" }}>
                  {l.criadoEm && (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
                      <Clock size={9} />{formatTempoRelativo(l.criadoEm)}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
