"use client";

/**
 * Roteador interno do Pipeline — escolhe sub-tab via query string.
 */
import PipelineNav, { useActiveTab } from "./PipelineNav";
import SubTabContratos from "./SubTabContratos";
import SubTabCorretores from "./SubTabCorretores";
import SubTabEstoque from "./SubTabEstoque";
import SubTabFinanceiro from "./SubTabFinanceiro";

export default function PipelineContent() {
  const tab = useActiveTab();
  return (
    <>
      <PipelineNav />
      {tab === "contratos"  && <SubTabContratos />}
      {tab === "corretores" && <SubTabCorretores />}
      {tab === "estoque"    && <SubTabEstoque />}
      {tab === "financeiro" && <SubTabFinanceiro />}
    </>
  );
}
