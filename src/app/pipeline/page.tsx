/**
 * Pipeline — Fase 3 do redesign.
 *
 * Sub-tabs internas via ?tab=:
 *  - contratos (default): funil + tabela + drawer
 *  - corretores: performance por corretor (excluindo Eggs)
 *  - estoque: distribuição de lotes
 *  - financeiro: financeiro + bônus
 */
import { Suspense } from "react";
import LayoutV2 from "@/components/shared/LayoutV2";
import PipelineContent from "@/components/pipeline/PipelineContent";
import { SkeletonCard } from "@/components/shared/Skeleton";

export const metadata = { title: "Pipeline · Cenário dos Lagos" };

export default function PipelinePage() {
  return (
    <LayoutV2>
      <Suspense fallback={<SkeletonCard height={400} />}>
        <PipelineContent />
      </Suspense>
    </LayoutV2>
  );
}
