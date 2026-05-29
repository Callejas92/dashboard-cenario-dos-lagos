"use client";

/**
 * Sub-navegação interna da aba Pipeline.
 * Sincroniza com query string ?tab=X pra permitir deep-link.
 */
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback } from "react";
import { FileText, Users, Home, DollarSign } from "lucide-react";

export type PipelineTab = "contratos" | "corretores" | "estoque" | "financeiro";

const SUB_TABS: { id: PipelineTab; label: string; icon: typeof FileText }[] = [
  { id: "contratos",  label: "Contratos",   icon: FileText },
  { id: "corretores", label: "Corretores",  icon: Users },
  { id: "estoque",    label: "Estoque",     icon: Home },
  { id: "financeiro", label: "Financeiro & Bônus", icon: DollarSign },
];

export function useActiveTab(): PipelineTab {
  const params = useSearchParams();
  const tab = (params.get("tab") || "contratos") as PipelineTab;
  return SUB_TABS.some((t) => t.id === tab) ? tab : "contratos";
}

export default function PipelineNav() {
  const router = useRouter();
  const pathname = usePathname();
  const active = useActiveTab();

  const setTab = useCallback((id: PipelineTab) => {
    const params = new URLSearchParams(window.location.search);
    params.set("tab", id);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname]);

  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: "0.25rem",
        borderBottom: "1px solid var(--border)",
        overflowX: "auto",
        marginBottom: "1rem",
        paddingBottom: "0.125rem",
      }}
    >
      {SUB_TABS.map(({ id, label, icon: Icon }) => {
        const ativo = id === active;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={ativo}
            onClick={() => setTab(id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
              padding: "0.5rem 0.875rem",
              fontSize: "0.825rem",
              fontWeight: ativo ? 700 : 500,
              color: ativo ? "var(--text)" : "var(--text-muted)",
              background: "transparent",
              border: 0,
              borderBottom: ativo ? "2px solid var(--text)" : "2px solid transparent",
              cursor: "pointer",
              whiteSpace: "nowrap",
              marginBottom: "-1px",
              transition: "color 0.15s",
            }}
          >
            <Icon size={13} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
