"use client";

/**
 * Badge proativo no header: "🏆 N a pagar" — nº de bônus com entrada/sinal
 * quitada, prontos pra pagar. Visível em todas as telas; some quando zera.
 * Clica → vai pra aba Financeiro & Bônus. Fonte: /api/bonus (summary.qtdAPagar).
 */
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { Award } from "lucide-react";

interface BonusResp {
  summary?: { qtdAPagar?: number };
}

export default function BonusBadge() {
  const router = useRouter();
  const { data } = useSWR<BonusResp>("/api/bonus");
  const qtd = data?.summary?.qtdAPagar ?? 0;

  if (qtd <= 0) return null;

  return (
    <button
      onClick={() => router.push("/pipeline?tab=financeiro")}
      title={`${qtd} bônus liberado(s) pra pagar (entrada/sinal quitada)`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
        padding: "0.4rem 0.65rem",
        borderRadius: "9999px",
        background: "#f59e0b1a",
        color: "#f59e0b",
        border: "1px solid #f59e0b55",
        cursor: "pointer",
        fontSize: "0.78rem",
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      <Award size={13} />
      <span>{qtd}</span>
      <span className="bonus-badge-label">a pagar</span>
    </button>
  );
}
