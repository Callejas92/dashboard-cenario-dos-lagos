"use client";

/**
 * Sub-tab Pipeline > Contratos (default).
 *
 *  - Funil grande horizontal (6 estágios) com qtd, valor, % do total
 *  - Filtros: tipo (Físico/Digital), corretor, busca livre
 *  - Tabela de contratos
 *  - Click numa linha → drawer lateral com detalhe completo
 *  - Alerta "parados >7 dias em Enviado p/ Assinatura"
 */
import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Search, Download, Filter, AlertTriangle } from "lucide-react";
import KpiSmall from "@/components/shared/KpiSmall";
import { SkeletonCard } from "@/components/shared/Skeleton";
import LoadingCard from "@/components/shared/LoadingCard";
import { formatBRLCompact, formatBRL, formatInt, formatData, truncate } from "@/lib/utils/formatters";
import ContratoDrawer from "./ContratoDrawer";

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
  cancelado: boolean;
  responsavelSistema?: string;
  corretor: { nome: string; cpf: string; creci: string; telefone: string; email: string };
  imobiliaria: { razaoSocial: string; nomeFantasia: string; cnpj: string };
  dataContrato?: string;
  dataEmissao?: string;
}
interface CrmContratosResp {
  contratos?: Contrato[];
  porCorretor?: { nome: string; lotes: number; valorTotal: number }[];
}

// Estágios reais do CRM Eggs hoje (Mai/26). FATURADO/ENTREGUE não estão sendo usados ainda.
// Reativar conforme o ERP/comercial passar a alimentar esses estados.
const ESTAGIOS = [
  { key: "enviado",   label: "Enviado p/ Ass.", match: ["ENVIADO PARA ASSINATURA"],    cor: "#4285f4" },
  { key: "assinado",  label: "Assinado",       match: ["ASSINADO"],                    cor: "#10b981" },
] as const;

function statusToEstagio(status: string): typeof ESTAGIOS[number] | undefined {
  const up = (status || "").toUpperCase().trim();
  return ESTAGIOS.find((e) => (e.match as readonly string[]).includes(up));
}

export default function SubTabContratos() {
  const params = useSearchParams();
  const estagioInicial = params.get("estagio") || "todos";

  const { data, isLoading } = useSWR<CrmContratosResp>("/api/crm/contratos");
  const [filtroEstagio, setFiltroEstagio] = useState<string>(estagioInicial);
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "digital" | "fisico">("todos");
  const [filtroCorretor, setFiltroCorretor] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [drawerContrato, setDrawerContrato] = useState<Contrato | null>(null);

  // Sincroniza filtro com query string ao montar
  useEffect(() => {
    if (params.get("estagio") && params.get("estagio") !== filtroEstagio) {
      setFiltroEstagio(params.get("estagio") || "todos");
    }
  }, [params, filtroEstagio]);

  const contratosBase = useMemo(() => {
    return (data?.contratos || []).filter((c) => !c.cancelado);
  }, [data]);

  // Funil: contagem + valor por estágio
  const funil = useMemo(() => {
    const total = contratosBase.length;
    const totalValor = contratosBase.reduce((s, c) => s + (c.valor || 0), 0);
    return ESTAGIOS.map((e) => {
      const itens = contratosBase.filter((c) => statusToEstagio(c.statusOriginal)?.key === e.key);
      const qtd = itens.length;
      const valor = itens.reduce((s, c) => s + (c.valor || 0), 0);
      return {
        ...e,
        qtd,
        valor,
        pctQtd: total > 0 ? qtd / total : 0,
        pctValor: totalValor > 0 ? valor / totalValor : 0,
      };
    });
  }, [contratosBase]);

  // Lista de corretores únicos
  const corretores = useMemo(() => {
    const set = new Set<string>();
    for (const c of contratosBase) {
      if (c.corretor?.nome) set.add(c.corretor.nome);
    }
    return Array.from(set).sort();
  }, [contratosBase]);

  // Aplicação de filtros + busca
  const contratosFiltrados = useMemo(() => {
    const termo = busca.toLowerCase().trim();
    return contratosBase.filter((c) => {
      if (filtroEstagio !== "todos") {
        if (statusToEstagio(c.statusOriginal)?.key !== filtroEstagio) return false;
      }
      if (filtroTipo === "digital" && !c.digital) return false;
      if (filtroTipo === "fisico" && c.digital) return false;
      if (filtroCorretor && c.corretor?.nome !== filtroCorretor) return false;
      if (termo) {
        const hay = `${c.loteId} ${c.cliente} ${c.corretor?.nome} ${c.imobiliaria?.razaoSocial}`.toLowerCase();
        if (!hay.includes(termo)) return false;
      }
      return true;
    });
  }, [contratosBase, filtroEstagio, filtroTipo, filtroCorretor, busca]);

  // Alerta: contratos parados >7 dias em "Enviado para Assinatura"
  const hoje = Date.now();
  const seteDias = 7 * 24 * 60 * 60 * 1000;
  const parados = useMemo(() => {
    return contratosBase.filter((c) => {
      if (statusToEstagio(c.statusOriginal)?.key !== "enviado") return false;
      if (!c.dataContrato) return false;
      const t = new Date(c.dataContrato + "T12:00:00").getTime();
      return Number.isFinite(t) && (hoje - t) > seteDias;
    });
  }, [contratosBase, hoje]);

  if (isLoading || !data) return <LoadingCard height={500} label="Carregando contratos" hint="CRM Eggs pode demorar até 15s no primeiro acesso" />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Funil horizontal grande */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
        <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.875rem" }}>
          Funil · {formatInt(contratosBase.length)} contratos · {formatBRLCompact(contratosBase.reduce((s, c) => s + c.valor, 0))} em pipeline
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.5rem" }}>
          {funil.map((e) => {
            const ativo = filtroEstagio === e.key;
            return (
              <button
                key={e.key}
                onClick={() => setFiltroEstagio(ativo ? "todos" : e.key)}
                style={{
                  display: "flex", flexDirection: "column", gap: "0.3rem",
                  padding: "0.625rem 0.75rem",
                  background: ativo ? e.cor + "15" : "transparent",
                  border: `1px solid ${ativo ? e.cor : "var(--border)"}`,
                  borderRadius: "0.5rem", cursor: "pointer", textAlign: "left",
                  transition: "all 0.15s",
                }}
              >
                <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.02em" }}>
                  {e.label}
                </div>
                <div style={{ fontSize: "1.4rem", fontWeight: 700, color: e.cor, lineHeight: 1 }}>
                  {e.qtd}
                </div>
                <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
                  {formatBRLCompact(e.valor)} · {(e.pctQtd * 100).toFixed(0)}%
                </div>
                <div aria-hidden style={{ height: "3px", width: "100%", background: "var(--border)", borderRadius: "9999px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${e.pctQtd * 100}%`, background: e.cor }} />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Alerta contratos parados */}
      {parados.length > 0 && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: "0.75rem",
          padding: "0.75rem 1rem", background: "#f59e0b15",
          borderLeft: "4px solid #f59e0b", borderRadius: "0.5rem",
        }}>
          <AlertTriangle size={16} style={{ color: "#f59e0b", flexShrink: 0, marginTop: "0.125rem" }} />
          <div style={{ fontSize: "0.8rem" }}>
            <strong style={{ color: "#f59e0b" }}>{parados.length} contrato{parados.length > 1 ? "s" : ""} parado{parados.length > 1 ? "s" : ""}</strong>{" "}
            há mais de 7 dias em "Enviado para Assinatura". Considere acompanhar com o cliente.
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
              {parados.slice(0, 5).map((p) => p.loteId).join(", ")}
              {parados.length > 5 ? ` +${parados.length - 5}` : ""}
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "0.75rem 1rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: "240px", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Search size={14} style={{ color: "var(--text-dim)" }} />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar lote, cliente, corretor…"
              style={{
                flex: 1, fontSize: "0.85rem", color: "var(--text)",
                background: "transparent", border: 0, outline: "none",
              }}
            />
          </div>

          <Filter size={12} style={{ color: "var(--text-dim)" }} />

          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value as "todos" | "digital" | "fisico")}
            style={{
              fontSize: "0.75rem", padding: "0.3rem 0.5rem", borderRadius: "0.375rem",
              background: "var(--bg, transparent)", border: "1px solid var(--border)", color: "var(--text)",
            }}
          >
            <option value="todos">Todos os tipos</option>
            <option value="digital">Digital</option>
            <option value="fisico">Físico</option>
          </select>

          <select
            value={filtroCorretor}
            onChange={(e) => setFiltroCorretor(e.target.value)}
            style={{
              fontSize: "0.75rem", padding: "0.3rem 0.5rem", borderRadius: "0.375rem",
              background: "var(--bg, transparent)", border: "1px solid var(--border)", color: "var(--text)",
              maxWidth: "240px",
            }}
          >
            <option value="">Todos os corretores</option>
            {corretores.map((c) => (
              <option key={c} value={c}>{truncate(c, 35)}</option>
            ))}
          </select>

          {(filtroEstagio !== "todos" || filtroTipo !== "todos" || filtroCorretor || busca) && (
            <button
              onClick={() => { setFiltroEstagio("todos"); setFiltroTipo("todos"); setFiltroCorretor(""); setBusca(""); }}
              style={{ fontSize: "0.7rem", color: "var(--text-dim)", background: "transparent", border: "1px solid var(--border)", padding: "0.25rem 0.5rem", borderRadius: "0.375rem", cursor: "pointer" }}
            >
              limpar
            </button>
          )}
        </div>
      </div>

      {/* Resumo + tabela */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem 1.25rem" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "0.875rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            {formatInt(contratosFiltrados.length)} contrato{contratosFiltrados.length === 1 ? "" : "s"}{filtroEstagio !== "todos" ? ` em "${ESTAGIOS.find((e) => e.key === filtroEstagio)?.label}"` : ""}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Total: {formatBRLCompact(contratosFiltrados.reduce((s, c) => s + c.valor, 0))}
          </div>
        </div>

        {contratosFiltrados.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-dim)", fontSize: "0.85rem" }}>
            Nenhum contrato com esses filtros.
          </div>
        ) : (
          <div className="mobile-scroll-x" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: "0.8rem", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--text-dim)", fontSize: "0.7rem", textTransform: "uppercase", fontWeight: 600 }}>
                  <th style={{ padding: "0.5rem 0.25rem" }}>Lote</th>
                  <th style={{ padding: "0.5rem 0.25rem" }}>Cliente</th>
                  <th style={{ padding: "0.5rem 0.25rem" }}>Corretor</th>
                  <th style={{ padding: "0.5rem 0.25rem" }}>Estágio</th>
                  <th style={{ padding: "0.5rem 0.25rem" }}>Tipo</th>
                  <th style={{ padding: "0.5rem 0.25rem", textAlign: "right" }}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {contratosFiltrados.slice(0, 100).map((c) => {
                  const est = statusToEstagio(c.statusOriginal);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setDrawerContrato(c)}
                      style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", transition: "background 0.1s" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--border)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <td style={{ padding: "0.5rem 0.25rem", fontWeight: 700, color: "var(--text)" }}>{c.loteId}</td>
                      <td style={{ padding: "0.5rem 0.25rem", color: "var(--text)" }}>
                        <div>{truncate(c.cliente || "—", 32)}</div>
                        {c.clienteTipo && (
                          <span style={{ fontSize: "0.6rem", color: "var(--text-dim)" }}>{c.clienteTipo}</span>
                        )}
                      </td>
                      <td style={{ padding: "0.5rem 0.25rem", color: "var(--text-muted)" }}>
                        {truncate(c.corretor?.nome || "—", 28)}
                      </td>
                      <td style={{ padding: "0.5rem 0.25rem" }}>
                        {est && (
                          <span style={{
                            fontSize: "0.65rem", fontWeight: 700,
                            padding: "0.15rem 0.5rem", borderRadius: "9999px",
                            background: est.cor + "15", color: est.cor,
                            whiteSpace: "nowrap",
                          }}>
                            {est.label}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "0.5rem 0.25rem", color: "var(--text-muted)", fontSize: "0.75rem" }}>
                        {c.digital ? "Digital" : "Físico"}
                      </td>
                      <td style={{ padding: "0.5rem 0.25rem", textAlign: "right", fontWeight: 600, color: "var(--text)" }}>
                        {formatBRLCompact(c.valor)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {contratosFiltrados.length > 100 && (
              <div style={{ padding: "0.5rem", textAlign: "center", color: "var(--text-dim)", fontSize: "0.7rem" }}>
                Mostrando 100 de {contratosFiltrados.length}. Use filtros pra reduzir.
              </div>
            )}
          </div>
        )}
      </div>

      <ContratoDrawer contrato={drawerContrato} onClose={() => setDrawerContrato(null)} />
    </div>
  );
}
