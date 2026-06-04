"use client";

/**
 * Admin · Status das integrações (Fase 5 — MVP).
 * Mostra, por integração: status (ok/erro/configurado/não configurado) + última sincronização.
 * Fonte: /api/admin/status (checa cada integração ao vivo + lê última sync dos caches).
 */
import useSWR from "swr";
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw, Server } from "lucide-react";

interface Integ {
  nome: string;
  grupo: string;
  configurado: boolean;
  ok: boolean | null;
  detalhe: string;
  ultimaSync: string | null;
}
interface Resp {
  integracoes?: Integ[];
  geradoEm?: string;
}

function statusInfo(i: Integ) {
  if (!i.configurado) return { cor: "#6b7280", bg: "#6b728015", label: "Não configurado", Icon: XCircle };
  if (i.ok === false) return { cor: "#dc2626", bg: "#dc262615", label: "Erro", Icon: XCircle };
  if (i.ok === true) return { cor: "#10b981", bg: "#10b98115", label: "OK", Icon: CheckCircle2 };
  return { cor: "#f59e0b", bg: "#f59e0b15", label: "Configurado", Icon: AlertTriangle };
}

function quando(iso: string | null): string {
  if (!iso) return "sem registro";
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "agora mesmo";
  if (diffMin < 60) return `há ${diffMin} min`;
  if (diffMin < 1440) return `há ${Math.floor(diffMin / 60)}h`;
  return d.toLocaleString("pt-BR");
}

export default function AdminStatusPanel() {
  const { data, isLoading, mutate, isValidating } = useSWR<Resp>("/api/admin/status");
  const integ = data?.integracoes || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <Server size={16} style={{ color: "var(--text-dim)" }} />
        <h2 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text)" }}>Status das Integrações</h2>
        <button
          onClick={() => mutate()}
          disabled={isValidating}
          style={{
            marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.3rem",
            fontSize: "0.72rem", color: "var(--text-muted)", background: "var(--surface)",
            border: "1px solid var(--border)", borderRadius: "0.375rem", padding: "0.3rem 0.6rem", cursor: "pointer",
          }}
        >
          <RefreshCw size={12} style={{ animation: isValidating ? "spin 1s linear infinite" : "none" }} />
          {isValidating ? "checando…" : "atualizar"}
        </button>
      </div>

      {isLoading ? (
        <div style={{ padding: "1.5rem", color: "var(--text-dim)", fontStyle: "italic", fontSize: "0.85rem" }}>
          Checando integrações ao vivo… (pode levar alguns segundos)
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "0.75rem" }}>
          {integ.map((i) => {
            const s = statusInfo(i);
            return (
              <div
                key={i.nome}
                style={{
                  background: "var(--surface)", border: "1px solid var(--border)",
                  borderRadius: "0.625rem", padding: "0.875rem 1rem",
                  display: "flex", flexDirection: "column", gap: "0.5rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
                  <div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text)" }}>{i.nome}</div>
                    <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.03em" }}>{i.grupo}</div>
                  </div>
                  <span style={{
                    display: "flex", alignItems: "center", gap: "0.25rem", whiteSpace: "nowrap",
                    fontSize: "0.68rem", fontWeight: 700, color: s.cor, background: s.bg,
                    padding: "0.2rem 0.5rem", borderRadius: "9999px",
                  }}>
                    <s.Icon size={11} /> {s.label}
                  </span>
                </div>

                {i.detalhe && (
                  <div style={{ fontSize: "0.7rem", color: i.ok === false ? "#dc2626" : "var(--text-muted)" }}>{i.detalhe}</div>
                )}

                <div style={{ fontSize: "0.68rem", color: "var(--text-dim)", borderTop: "1px solid var(--border)", paddingTop: "0.4rem" }}>
                  última sincronização: <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>{quando(i.ultimaSync)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Legenda */}
      <div style={{ fontSize: "0.66rem", color: "var(--text-dim)", display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
        <span>🟢 OK — respondendo</span>
        <span>🟡 Configurado — não testado ao vivo</span>
        <span>🔴 Erro / não configurado</span>
        {data?.geradoEm && <span style={{ marginLeft: "auto" }}>checado {quando(data.geradoEm)}</span>}
      </div>

      <style jsx global>{`@keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
