"use client";

/**
 * Sub-navegação interna da aba Marketing.
 * Sincroniza com query string ?tab=X.
 */
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback } from "react";
import { Megaphone, Target, Instagram, Users } from "lucide-react";

export type MarketingTab = "painel" | "digital" | "organico" | "crm";

const SUB_TABS: { id: MarketingTab; label: string; icon: typeof Megaphone }[] = [
  { id: "painel",   label: "Painel",        icon: Megaphone },
  { id: "digital",  label: "Mídia Digital", icon: Target },
  { id: "organico", label: "Orgânico",      icon: Instagram },
  { id: "crm",      label: "CRM / Leads",   icon: Users },
];

export function useActiveTab(): MarketingTab {
  const params = useSearchParams();
  const tab = (params.get("tab") || "painel") as MarketingTab;
  return SUB_TABS.some((t) => t.id === tab) ? tab : "painel";
}

export default function MarketingNav() {
  const router = useRouter();
  const pathname = usePathname();
  const active = useActiveTab();

  const setTab = useCallback((id: MarketingTab) => {
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
