"use client";

/**
 * Sub-tab Marketing > Mídia Digital.
 *
 * Consolida Meta + Google Ads (canais com leads via API).
 * Outdoor/Rádio/Jornal/Evento ficam no Painel (offline, vem do Excel).
 *
 * Fonte: /api/canais com período = lançamento até hoje.
 */
import useSWR from "swr";
import { Target, TrendingDown } from "lucide-react";
import KpiMedium from "@/components/shared/KpiMedium";
import LoadingCard from "@/components/shared/LoadingCard";
import { buildKey } from "@/lib/cache/tabCache";
import { PROJETO } from "@/lib/constants/projeto";
import { formatBRLCompact, formatInt, formatPct } from "@/lib/utils/formatters";

interface Canal { investimento?: number; leads?: number; vendas?: number }
interface CanaisResp {
  canais?: Record<string, Canal>;
  kpis?: { totalInvestimento?: number; totalLeads?: number; cpl?: number };
}

const CANAIS_DIGITAIS = ["Meta Ads", "Google Ads", "WhatsApp", "Site"] as const;

export default function SubTabDigital() {
  const hoje = new Date().toISOString().split("T")[0];
  const key = buildKey("/api/canais", { from: PROJETO.DATA_LANCAMENTO, to: hoje });
  const { data, isLoading } = useSWR<CanaisResp>(key);

  if (isLoading || !data) {
    return <LoadingCard height={300} label="Carregando Mídia Digital" hint="Meta Ads + Google Ads + GA4 podem demorar 10-15s" />;
  }

  const canais = data.canais || {};
  const digitaisPorNome = Object.fromEntries(
    CANAIS_DIGITAIS.map((nome) => [nome, canais[nome] || { investimento: 0, leads: 0, vendas: 0 }]),
  );

  const totalInv = CANAIS_DIGITAIS.reduce((s, c) => s + (canais[c]?.investimento ?? 0), 0);
  const totalLeads = CANAIS_DIGITAIS.reduce((s, c) => s + (canais[c]?.leads ?? 0), 0);
  const cpl = totalLeads > 0 ? totalInv / totalLeads : 0;

  // Ordenado por investimento
  const ranking = CANAIS_DIGITAIS
    .map((nome) => ({ nome, ...digitaisPorNome[nome] }))
    .filter((c) => (c.investimento ?? 0) > 0 || (c.leads ?? 0) > 0)
    .sort((a, b) => (b.investimento ?? 0) - (a.investimento ?? 0));

  // Top + Bottom canal (por CPL — quanto menor melhor)
  const comCpl = ranking
    .filter((c) => (c.investimento ?? 0) > 0 && (c.leads ?? 0) > 0)
    .map((c) => ({ ...c, cpl: (c.investimento ?? 0) / (c.leads ?? 1) }))
    .sort((a, b) => a.cpl - b.cpl);
  const topCanal = comCpl[0];
  const bottomCanal = comCpl[comCpl.length - 1];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* KPIs consolidados */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.625rem" }}>
        <KpiMedium
          label="Investimento digital"
          valor={formatBRLCompact(totalInv)}
          formula={`Soma de Meta + Google + WhatsApp + Site no período desde lançamento.\nNão inclui mídia offline (essa fica no Painel via Excel).`}
          icon={<Target size={11} style={{ color: "var(--text-dim)" }} />}
        />
        <KpiMedium
          label="Leads digitais"
          valor={formatInt(totalLeads)}
          formula="Leads originados em canais digitais segundo o CRM Eggs."
        />
        <KpiMedium
          label="CPL médio digital"
          valor={cpl > 0 ? formatBRLCompact(cpl) : "—"}
          formula={`Investimento ÷ leads = ${formatBRLCompact(totalInv)} ÷ ${totalLeads}.\nQuanto custou cada lead em canais digitais.`}
          severidade={cpl < 100 ? "verde" : cpl < 200 ? "amarelo" : "vermelho"}
          contexto={`R$ ${cpl.toFixed(0)} por lead`}
        />
        <KpiMedium
          label="% do total MKT"
          valor={data.kpis?.totalInvestimento ? formatPct(totalInv / data.kpis.totalInvestimento) : "—"}
          formula="Quanto da minha grana de marketing total foi pra mídia digital."
        />
      </div>

      {/* Top / Bottom canal */}
      {topCanal && bottomCanal && topCanal.nome !== bottomCanal.nome && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.875rem" }}>
          <div style={{ padding: "1rem 1.25rem", background: "#10b98115", border: "1px solid #10b98140", borderRadius: "0.75rem" }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#10b981", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem" }}>
              🏆 Melhor canal (menor CPL)
            </div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#10b981" }}>{topCanal.nome}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
              {formatBRLCompact(topCanal.cpl)} por lead · {formatInt(topCanal.leads ?? 0)} leads · {formatBRLCompact(topCanal.investimento ?? 0)} investido
            </div>
          </div>

          <div style={{ padding: "1rem 1.25rem", background: "#dc262615", border: "1px solid #dc262640", borderRadius: "0.75rem" }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#dc2626", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem" }}>
              <TrendingDown size={11} style={{ display: "inline" }} /> Pior canal (maior CPL)
            </div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#dc2626" }}>{bottomCanal.nome}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
              {formatBRLCompact(bottomCanal.cpl)} por lead · {formatInt(bottomCanal.leads ?? 0)} leads · {formatBRLCompact(bottomCanal.investimento ?? 0)} investido
            </div>
          </div>
        </div>
      )}

      {/* Tabela canais ranking */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
        <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.75rem" }}>
          Canais digitais · ranking por investimento
        </div>

        {ranking.length === 0 ? (
          <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Sem dados de canais digitais ainda.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: "0.8rem", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--text-dim)", fontSize: "0.7rem", textTransform: "uppercase", fontWeight: 600 }}>
                  <th style={{ padding: "0.5rem 0.25rem" }}>Canal</th>
                  <th style={{ padding: "0.5rem 0.25rem", textAlign: "right" }}>Investimento</th>
                  <th style={{ padding: "0.5rem 0.25rem", textAlign: "right" }}>Leads</th>
                  <th style={{ padding: "0.5rem 0.25rem", textAlign: "right" }}>CPL</th>
                  <th style={{ padding: "0.5rem 0.25rem", textAlign: "right" }}>% do investimento digital</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((c) => {
                  const cplCanal = (c.leads ?? 0) > 0 ? (c.investimento ?? 0) / (c.leads ?? 1) : 0;
                  const pct = totalInv > 0 ? (c.investimento ?? 0) / totalInv : 0;
                  return (
                    <tr key={c.nome} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "0.5rem 0.25rem", color: "var(--text)", fontWeight: 600 }}>{c.nome}</td>
                      <td style={{ padding: "0.5rem 0.25rem", textAlign: "right", color: "var(--text)", fontWeight: 600 }}>
                        {formatBRLCompact(c.investimento ?? 0)}
                      </td>
                      <td style={{ padding: "0.5rem 0.25rem", textAlign: "right", color: "var(--text-muted)" }}>
                        {formatInt(c.leads ?? 0)}
                      </td>
                      <td style={{ padding: "0.5rem 0.25rem", textAlign: "right", color: "var(--text-muted)" }}>
                        {cplCanal > 0 ? formatBRLCompact(cplCanal) : "—"}
                      </td>
                      <td style={{ padding: "0.5rem 0.25rem", textAlign: "right" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "flex-end" }}>
                          <div style={{ width: "60px", height: "6px", background: "var(--border)", borderRadius: "9999px", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${pct * 100}%`, background: "#4285f4" }} />
                          </div>
                          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", minWidth: "40px" }}>
                            {formatPct(pct, { casas: 0 })}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", textAlign: "right", fontStyle: "italic" }}>
        Fonte: Meta Ads API + Google Ads API + WhatsApp Cloud + CRM Eggs (leads). Período: desde lançamento.
      </div>
    </div>
  );
}
