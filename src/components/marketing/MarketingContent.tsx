"use client";

import MarketingNav, { useActiveTab } from "./MarketingNav";
import SubTabPainel from "./SubTabPainel";
import SubTabDigital from "./SubTabDigital";
import SubTabOrganico from "./SubTabOrganico";
import SubTabCrmLeads from "./SubTabCrmLeads";

export default function MarketingContent() {
  const tab = useActiveTab();
  return (
    <>
      <MarketingNav />
      {tab === "painel"   && <SubTabPainel />}
      {tab === "digital"  && <SubTabDigital />}
      {tab === "organico" && <SubTabOrganico />}
      {tab === "crm"      && <SubTabCrmLeads />}
    </>
  );
}
