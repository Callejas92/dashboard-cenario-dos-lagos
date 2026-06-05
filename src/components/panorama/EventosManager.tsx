"use client";

/**
 * Gatilho discreto + modal pra cadastrar/remover eventos (marcadores dos gráficos).
 * Lê/escreve em /api/eventos (Vercel Blob). Mutate() faz os gráficos atualizarem na hora.
 */
import { useState, type CSSProperties } from "react";
import useSWR from "swr";
import { CalendarPlus, X, Trash2 } from "lucide-react";
import { COR_TIPO_EVENTO, type TipoEvento } from "@/lib/constants/eventos";

interface Evento {
  id: string;
  data: string;
  nome: string;
  tipo: TipoEvento;
}
interface Resp {
  eventos?: Evento[];
}

const TIPOS_FORM: { v: TipoEvento; label: string }[] = [
  { v: "midia", label: "Mídia" },
  { v: "evento", label: "Evento" },
  { v: "imobiliaria", label: "Imobiliária" },
  { v: "outro", label: "Outro" },
];

const fmtLabel = (iso: string) => {
  const p = iso.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0].slice(2)}` : iso;
};

const triggerStyle: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "0.25rem",
  fontSize: "0.7rem", color: "var(--text-dim)", background: "transparent",
  border: "1px solid var(--border)", borderRadius: "9999px",
  padding: "0.15rem 0.5rem", cursor: "pointer",
  textTransform: "none", letterSpacing: 0, fontWeight: 500, whiteSpace: "nowrap",
};
const overlayStyle: CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 1000, padding: "1rem",
};
const cardStyle: CSSProperties = {
  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem",
  width: "100%", maxWidth: 460, maxHeight: "85vh", overflow: "auto",
  padding: "1rem 1.1rem", boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
  // o modal é filho do cabeçalho do gráfico (uppercase): reseta pra texto normal
  textTransform: "none", letterSpacing: "normal",
};
const inputStyle: CSSProperties = {
  background: "var(--bg-secondary, rgba(127,127,127,0.06))", color: "var(--text)",
  border: "1px solid var(--border)", borderRadius: "0.4rem", padding: "0.35rem 0.5rem",
  fontSize: "0.78rem",
};

export default function EventosManager() {
  const { data, mutate } = useSWR<Resp>("/api/eventos");
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [dataEv, setDataEv] = useState("");
  const [tipo, setTipo] = useState<TipoEvento>("midia");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  const eventos = data?.eventos || [];

  async function adicionar() {
    setErro("");
    if (!dataEv) return setErro("Escolha a data.");
    if (!nome.trim()) return setErro("Dê um nome ao evento.");
    setBusy(true);
    try {
      const r = await fetch("/api/eventos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: dataEv, nome: nome.trim(), tipo }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErro(j?.error || "Falha ao salvar.");
      else {
        setNome("");
        setDataEv("");
        await mutate();
      }
    } catch {
      setErro("Falha de conexão.");
    } finally {
      setBusy(false);
    }
  }

  async function remover(id: string) {
    setBusy(true);
    setErro("");
    try {
      const r = await fetch("/api/eventos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (r.ok) await mutate();
      else setErro("Falha ao remover.");
    } catch {
      setErro("Falha de conexão.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} title="Adicionar / remover eventos" style={triggerStyle}>
        <CalendarPlus size={11} /> evento
      </button>

      {open && (
        <div style={overlayStyle} onClick={() => setOpen(false)}>
          <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
              <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text)" }}>Eventos nos gráficos</span>
              <button onClick={() => setOpen(false)} style={{ background: "transparent", border: "none", color: "var(--text-dim)", cursor: "pointer", padding: 2 }}>
                <X size={16} />
              </button>
            </div>

            {/* Lista */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", marginBottom: "0.875rem" }}>
              {eventos.length === 0 ? (
                <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", fontStyle: "italic", padding: "0.5rem 0" }}>Nenhum evento ainda.</div>
              ) : (
                eventos.map((e) => (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.78rem", padding: "0.3rem 0", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 9999, background: COR_TIPO_EVENTO[e.tipo] || "#64748b", flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, color: "var(--text-muted)", minWidth: 62 }}>{fmtLabel(e.data)}</span>
                    <span style={{ flex: 1, color: "var(--text)" }}>{e.nome}</span>
                    {e.id === "lancamento" ? (
                      <span style={{ fontSize: "0.62rem", color: "var(--text-dim)", fontStyle: "italic" }}>fixo</span>
                    ) : (
                      <button onClick={() => remover(e.id)} disabled={busy} style={{ display: "inline-flex", alignItems: "center", background: "transparent", border: "none", color: "#dc2626", cursor: "pointer", padding: "0.35rem 0.5rem", margin: "-0.25rem 0", borderRadius: "0.3rem", opacity: busy ? 0.5 : 1 }} title="Remover">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Formulário */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "center" }}>
              <input type="date" value={dataEv} onChange={(e) => setDataEv(e.target.value)} style={inputStyle} />
              <input type="text" placeholder="nome do evento" value={nome} maxLength={40} onChange={(e) => setNome(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 120 }} />
              <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoEvento)} style={inputStyle}>
                {TIPOS_FORM.map((t) => (
                  <option key={t.v} value={t.v}>{t.label}</option>
                ))}
              </select>
              <button onClick={adicionar} disabled={busy} style={{ background: "#10b981", color: "#fff", border: "none", borderRadius: "0.4rem", padding: "0.4rem 0.8rem", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
                {busy ? "salvando…" : "adicionar"}
              </button>
            </div>

            {erro && <div style={{ fontSize: "0.72rem", color: "#dc2626", marginTop: "0.5rem" }}>{erro}</div>}
            <div style={{ fontSize: "0.66rem", color: "var(--text-dim)", marginTop: "0.6rem", lineHeight: 1.4 }}>
              Viram linhas verticais nos gráficos de vendas. Cores: <span style={{ color: COR_TIPO_EVENTO.midia }}>Mídia</span> · <span style={{ color: COR_TIPO_EVENTO.evento }}>Evento</span> · <span style={{ color: COR_TIPO_EVENTO.imobiliaria }}>Imobiliária</span> · <span style={{ color: COR_TIPO_EVENTO.outro }}>Outro</span>.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
