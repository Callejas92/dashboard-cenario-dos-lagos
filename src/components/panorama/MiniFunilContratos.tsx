"use client";

/**
 * Linha 2 do Panorama — mini-funil de contratos.
 *
 * 6 estágios horizontais com qtd + valor. Click → leva pra Pipeline filtrada.
 *
 * Mapping de statusOriginal do Eggs CRM → estágio do funil:
 *   GERADO            → "Gerado"
 *   CONFERIDO         → "Conferido"
 *   ENVIADO PARA ASSINATURA → "Enviado p/ Ass."
 *   ASSINADO          → "Assinado"
 *   FATURADO          → "Faturado"
 *   ENTREGUE AO INCORPORADOR → "Entregue"
 *   CANCELADO         → ignorado (não conta no funil ativo)
 */
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { SkeletonCard } from "@/components/shared/Skeleton";
import TooltipDefinicao from "@/components/shared/TooltipDefinicao";
import { formatBRLCompact, formatInt } from "@/lib/utils/formatters";

interface CrmContratosResp {
  contratos?: { loteId: string; valor: number; status: string; statusOriginal?: string; cancelado: boolean }[];
}

interface EstagioFunil {
  key: string;
  label: string;
  statusMatch: string[];
  cor: string;
}

// Só estágios reais hoje. FATURADO/ENTREGUE são adicionados quando o ERP passar a usar.
const ESTAGIOS: EstagioFunil[] = [
  { key: "enviado",   label: "Enviado p/ Ass.", statusMatch: ["ENVIADO PARA ASSINATURA"], cor: "#4285f4" },
  { key: "assinado",  label: "Assinado",       statusMatch: ["ASSINADO"],                 cor: "#10b981" },
];

export default function MiniFunilContratos() {
  const router = useRouter();
  const { data, isLoading } = useSWR<CrmContratosResp>("/api/crm/contratos");

  if (isLoading) return <SkeletonCard height={120} />;

  const contratos = (data?.contratos || []).filter((c) => !c.cancelado);
  const agrupado = ESTAGIOS.map((e) => {
    const itens = contratos.filter((c) =>
      e.statusMatch.includes((c.status || "").toUpperCase().trim()),
    );
    return {
      ...e,
      qtd: itens.length,
      valor: itens.reduce((s, c) => s + (c.valor || 0), 0),
    };
  });

  const totalQtd = agrupado.reduce((s, e) => s + e.qtd, 0);
  const totalValor = agrupado.reduce((s, e) => s + e.valor, 0);
  const maxQtd = Math.max(1, ...agrupado.map((e) => e.qtd));

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "0.75rem",
        padding: "1rem 1.25rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "0.875rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>
          <TooltipDefinicao texto="Estágios do funil de venda no CRM Eggs. Cancelados são excluídos.">
            <span>Funil de Contratos</span>
          </TooltipDefinicao>
        </div>
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          {formatInt(totalQtd)} contratos · {formatBRLCompact(totalValor)} em pipeline
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
          gap: "0.5rem",
        }}
      >
        {agrupado.map((e) => {
          const pctAltura = (e.qtd / maxQtd) * 100;
          return (
            <button
              key={e.key}
              onClick={() => router.push(`/pipeline?estagio=${e.key}`)}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.3rem",
                padding: "0.5rem 0.6rem",
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: "0.375rem",
                cursor: "pointer",
                textAlign: "left",
                transition: "background 0.15s",
              }}
              onMouseEnter={(ev) => { ev.currentTarget.style.background = "var(--border)"; }}
              onMouseLeave={(ev) => { ev.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.02em" }}>
                {e.label}
              </div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: e.cor, lineHeight: 1 }}>
                {e.qtd}
              </div>
              <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
                {formatBRLCompact(e.valor)}
              </div>
              <div
                aria-hidden="true"
                style={{
                  height: "3px",
                  width: "100%",
                  background: "var(--border)",
                  borderRadius: "9999px",
                  overflow: "hidden",
                }}
              >
                <div style={{ height: "100%", width: `${pctAltura}%`, background: e.cor }} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
