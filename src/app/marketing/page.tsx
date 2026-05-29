/**
 * Marketing — Fase 4 do redesign.
 *
 * Sub-tabs internas via ?tab=:
 *  - painel (default): Cenario_Marketing.xlsx
 *  - digital: Meta + Google consolidado
 *  - organico: Instagram + Site + WhatsApp
 *  - crm: Eggs CRM (leads)
 */
import { Suspense } from "react";
import LayoutV2 from "@/components/shared/LayoutV2";
import MarketingContent from "@/components/marketing/MarketingContent";
import LoadingCard from "@/components/shared/LoadingCard";

export const metadata = { title: "Marketing · Cenário dos Lagos" };

export default function MarketingPage() {
  return (
    <LayoutV2>
      <Suspense fallback={<LoadingCard height={400} label="Inicializando..." />}>
        <MarketingContent />
      </Suspense>
    </LayoutV2>
  );
}
