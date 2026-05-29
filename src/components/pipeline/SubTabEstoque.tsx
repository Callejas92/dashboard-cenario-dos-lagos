"use client";

/**
 * Sub-tab Pipeline > Estoque.
 *
 *  - Cards top: Total / Disponíveis / Vendidos / Em Venda (sem "Fora de Venda")
 *  - Distribuição por classificação (barras horizontais)
 *  - Distribuição por quadra (barras horizontais)
 *  - Tabela de lotes com filtros básicos
 */
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Home, Search } from "lucide-react";
import KpiMedium from "@/components/shared/KpiMedium";
import { SkeletonCard } from "@/components/shared/Skeleton";
import LoadingCard from "@/components/shared/LoadingCard";
import { formatBRL, formatBRLCompact, formatInt, truncate } from "@/lib/utils/formatters";
import { PROJETO } from "@/lib/constants/projeto";
import { corMeta } from "@/lib/utils/cores";

interface Unidade {
  identificador: string;
  quadra: string;
  lote: string;
  status: string;
  area: number;
  valorTotal: number;
  classificacao: string;
  rua?: string;
}
interface UauResp {
  summary?: { total?: number; disponivel?: number; vendido?: number; emVenda?: number; foraDeVenda?: number; vgvTotal?: number; vgvVendido?: number };
  unidades?: Unidade[];
}

function classify(status: string): "vendido" | "emVenda" | "disponivel" | "foraDeVenda" {
  const s = (status || "").toLowerCase();
  if (s.includes("vendid") || s.includes("contrato")) return "vendido";
  if (s.includes("reservad") || s.includes("pré-venda") || s.includes("pre-venda") || s.includes("em venda")) return "emVenda";
  if (s.includes("bloquead") || s.includes("fora")) return "foraDeVenda";
  return "disponivel";
}

const COR_STATUS: Record<string, string> = {
  vendido: "#10b981",
  emVenda: "#f59e0b",
  disponivel: "#4285f4",
  foraDeVenda: "#6b7280",
};

export default function SubTabEstoque() {
  const { data, isLoading } = useSWR<UauResp>("/api/uau");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "vendido" | "emVenda" | "disponivel" | "foraDeVenda">("todos");
  const [filtroClass, setFiltroClass] = useState<string>("");
  const [filtroQuadra, setFiltroQuadra] = useState<string>("");
  const [busca, setBusca] = useState("");

  const unidades = data?.unidades || [];

  // KPIs do summary (já confiável — vem da API que exclui investidor)
  const summary = data?.summary || {};

  // Distribuição por classificação
  const porClassificacao = useMemo(() => {
    const map = new Map<string, { total: number; vendido: number }>();
    for (const u of unidades) {
      const k = u.classificacao || "—";
      let v = map.get(k);
      if (!v) { v = { total: 0, vendido: 0 }; map.set(k, v); }
      v.total++;
      if (classify(u.status) === "vendido") v.vendido++;
    }
    return Array.from(map.entries())
      .map(([nome, v]) => ({ nome, total: v.total, vendido: v.vendido, pctVendido: v.total > 0 ? v.vendido / v.total : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [unidades]);

  // Distribuição por quadra
  const porQuadra = useMemo(() => {
    const map = new Map<string, { total: number; vendido: number }>();
    for (const u of unidades) {
      const k = u.quadra || "—";
      let v = map.get(k);
      if (!v) { v = { total: 0, vendido: 0 }; map.set(k, v); }
      v.total++;
      if (classify(u.status) === "vendido") v.vendido++;
    }
    return Array.from(map.entries())
      .map(([nome, v]) => ({ nome, total: v.total, vendido: v.vendido, pctVendido: v.total > 0 ? v.vendido / v.total : 0 }))
      .sort((a, b) => {
        const na = parseInt(a.nome.replace(/\D/g, "")) || 0;
        const nb = parseInt(b.nome.replace(/\D/g, "")) || 0;
        return na - nb;
      });
  }, [unidades]);

  const classificacoes = useMemo(() => Array.from(new Set(unidades.map((u) => u.classificacao).filter(Boolean))).sort(), [unidades]);
  const quadras = useMemo(() => Array.from(new Set(unidades.map((u) => u.quadra).filter(Boolean))).sort((a, b) => (parseInt(a.replace(/\D/g, "")) || 0) - (parseInt(b.replace(/\D/g, "")) || 0)), [unidades]);

  // Aplicação dos filtros
  const lotesFiltrados = useMemo(() => {
    const termo = busca.toLowerCase().trim();
    return unidades.filter((u) => {
      if (filtroStatus !== "todos" && classify(u.status) !== filtroStatus) return false;
      if (filtroClass && u.classificacao !== filtroClass) return false;
      if (filtroQuadra && u.quadra !== filtroQuadra) return false;
      if (termo && !`${u.identificador} ${u.classificacao} ${u.rua}`.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [unidades, filtroStatus, filtroClass, filtroQuadra, busca]);

  if (isLoading || !data) return <LoadingCard height={500} label="Carregando estoque" hint="ERP UAU cold start pode demorar até 15s" />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0.625rem" }}>
        <KpiMedium
          label="Total lotes"
          valor={formatInt(summary.total ?? 0)}
          formula={`Total de lotes vendáveis. Lotes do investidor (39) são excluídos.\nConfigurado em PROJETO: ${PROJETO.LOTES_VENDAVEIS}.`}
          icon={<Home size={11} style={{ color: "var(--text-dim)" }} />}
        />
        <KpiMedium
          label="Disponíveis"
          valor={formatInt(summary.disponivel ?? 0)}
          severidade="cinza"
          formula="Lotes em status LIBERADA no CRM Eggs (prontos pra venda)."
          contexto={`${(((summary.disponivel ?? 0) / (summary.total ?? 1)) * 100).toFixed(0)}% do total`}
        />
        <KpiMedium
          label="Vendidos"
          valor={formatInt(summary.vendido ?? 0)}
          severidade={corMeta(summary.vendido ?? 0, PROJETO.LOTES_VENDAVEIS * 0.5)}
          formula={`Lotes em status VENDIDA ou CONTRATO no CRM Eggs.\n${formatBRLCompact(summary.vgvVendido ?? 0)} de VGV contratado.`}
          contexto={`${formatBRLCompact(summary.vgvVendido ?? 0)} VGV`}
        />
        <KpiMedium
          label="Em venda"
          valor={formatInt(summary.emVenda ?? 0)}
          severidade="amarelo"
          formula="Lotes em status RESERVADA, PRÉ-VENDA ou similar (negociação ativa)."
        />
      </div>

      {/* Distribuição por classificação */}
      {porClassificacao.length > 1 && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.75rem" }}>
            Por classificação
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {porClassificacao.map((c) => {
              const max = Math.max(...porClassificacao.map((x) => x.total));
              return (
                <div key={c.nome} style={{ display: "grid", gridTemplateColumns: "60px 1fr 120px", gap: "0.625rem", alignItems: "center" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text)", textAlign: "right", fontWeight: 600 }}>
                    {c.nome}
                  </div>
                  <div aria-hidden style={{ height: "18px", background: "var(--border)", borderRadius: "0.25rem", overflow: "hidden", position: "relative" }}>
                    <div style={{ position: "absolute", inset: 0, width: `${(c.total / max) * 100}%`, background: "#4285f4", borderRadius: "0.25rem" }} />
                    <div style={{ position: "absolute", inset: 0, width: `${(c.vendido / max) * 100}%`, background: "#10b981", borderRadius: "0.25rem" }} />
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                    {c.vendido}/{c.total} <span style={{ color: "#10b981", fontWeight: 600 }}>{(c.pctVendido * 100).toFixed(0)}%</span> vendido
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Distribuição por quadra */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
        <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.75rem" }}>
          Por quadra
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {porQuadra.map((q) => {
            const max = Math.max(...porQuadra.map((x) => x.total));
            return (
              <div key={q.nome} style={{ display: "grid", gridTemplateColumns: "50px 1fr 120px", gap: "0.625rem", alignItems: "center" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text)", textAlign: "right", fontWeight: 600 }}>
                  {q.nome}
                </div>
                <div aria-hidden style={{ height: "16px", background: "var(--border)", borderRadius: "0.25rem", overflow: "hidden", position: "relative" }}>
                  <div style={{ position: "absolute", inset: 0, width: `${(q.total / max) * 100}%`, background: "#4285f4", borderRadius: "0.25rem" }} />
                  <div style={{ position: "absolute", inset: 0, width: `${(q.vendido / max) * 100}%`, background: "#10b981", borderRadius: "0.25rem" }} />
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                  {q.vendido}/{q.total} ({(q.pctVendido * 100).toFixed(0)}%)
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filtros + tabela */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.625rem", alignItems: "center", marginBottom: "0.75rem" }}>
          <div style={{ flex: 1, minWidth: "200px", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Search size={13} style={{ color: "var(--text-dim)" }} />
            <input
              type="text" value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar lote…"
              style={{ flex: 1, fontSize: "0.825rem", color: "var(--text)", background: "transparent", border: 0, outline: "none" }}
            />
          </div>
          <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as "todos" | "vendido" | "emVenda" | "disponivel" | "foraDeVenda")} style={selectStyle}>
            <option value="todos">Todos status</option>
            <option value="disponivel">Disponíveis</option>
            <option value="vendido">Vendidos</option>
            <option value="emVenda">Em venda</option>
            <option value="foraDeVenda">Fora de venda</option>
          </select>
          <select value={filtroClass} onChange={(e) => setFiltroClass(e.target.value)} style={selectStyle}>
            <option value="">Todas classificações</option>
            {classificacoes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filtroQuadra} onChange={(e) => setFiltroQuadra(e.target.value)} style={selectStyle}>
            <option value="">Todas quadras</option>
            {quadras.map((q) => <option key={q} value={q}>{q}</option>)}
          </select>
        </div>

        <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginBottom: "0.5rem", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
          <span>{formatInt(lotesFiltrados.length)} lote{lotesFiltrados.length === 1 ? "" : "s"}</span>
          <span style={{ fontStyle: "italic" }}>valor = preço atual do CRM Eggs (espelho de vendas)</span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: "0.8rem", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--text-dim)", fontSize: "0.7rem", textTransform: "uppercase", fontWeight: 600 }}>
                <th style={{ padding: "0.5rem 0.25rem" }}>Lote</th>
                <th style={{ padding: "0.5rem 0.25rem" }}>Quadra</th>
                <th style={{ padding: "0.5rem 0.25rem" }}>Classif.</th>
                <th style={{ padding: "0.5rem 0.25rem" }}>Status</th>
                <th style={{ padding: "0.5rem 0.25rem", textAlign: "right" }}>Área</th>
                <th style={{ padding: "0.5rem 0.25rem", textAlign: "right" }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {lotesFiltrados.slice(0, 150).map((u) => {
                const cat = classify(u.status);
                const cor = COR_STATUS[cat];
                return (
                  <tr key={u.identificador} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "0.4rem 0.25rem", color: "var(--text)", fontWeight: 600 }}>{u.identificador}</td>
                    <td style={{ padding: "0.4rem 0.25rem", color: "var(--text-muted)" }}>{u.quadra}</td>
                    <td style={{ padding: "0.4rem 0.25rem", color: "var(--text-muted)" }}>{u.classificacao || "—"}</td>
                    <td style={{ padding: "0.4rem 0.25rem" }}>
                      <span style={{
                        fontSize: "0.65rem", fontWeight: 700, padding: "0.15rem 0.5rem", borderRadius: "9999px",
                        background: cor + "15", color: cor, whiteSpace: "nowrap",
                      }}>
                        {truncate(u.status, 14)}
                      </span>
                    </td>
                    <td style={{ padding: "0.4rem 0.25rem", textAlign: "right", color: "var(--text-muted)", fontSize: "0.75rem" }}>{u.area.toFixed(0)} m²</td>
                    <td className="tnum" style={{ padding: "0.4rem 0.25rem", textAlign: "right", color: "var(--text)", fontWeight: 600 }}>{formatBRL(u.valorTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {lotesFiltrados.length > 150 && (
            <div style={{ padding: "0.5rem", textAlign: "center", color: "var(--text-dim)", fontSize: "0.7rem" }}>
              Mostrando 150 de {lotesFiltrados.length}.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  fontSize: "0.75rem", padding: "0.3rem 0.5rem", borderRadius: "0.375rem",
  background: "var(--bg, transparent)", border: "1px solid var(--border)", color: "var(--text)",
};
