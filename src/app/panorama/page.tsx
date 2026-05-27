/**
 * Panorama — aba default do dashboard v2.
 *
 * Mobile-first. Decisão em 5/15/30 segundos (Few + Knaflic).
 *
 * 6 linhas:
 *   1. KPIs gigantes (VGV, VSO, Velocidade)
 *   2. Mini-funil de contratos
 *   3. Velocidade em 4 janelas temporais
 *   4. Saúde do marketing (4 KPIs médios)
 *   5. Alertas condicionais
 *   6. Insights (curiosidades automáticas)
 */
import LayoutV2 from "@/components/shared/LayoutV2";
import LinhaKpisGigantes from "@/components/panorama/LinhaKpisGigantes";
import MiniFunilContratos from "@/components/panorama/MiniFunilContratos";
import VelocidadeVendas from "@/components/panorama/VelocidadeVendas";
import SaudeMarketing from "@/components/panorama/SaudeMarketing";
import ListaAlertas from "@/components/panorama/ListaAlertas";
import BlocoInsights from "@/components/panorama/BlocoInsights";

export const metadata = {
  title: "Panorama · Cenário dos Lagos",
};

export default function PanoramaPage() {
  return (
    <LayoutV2>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <LinhaKpisGigantes />
        <MiniFunilContratos />
        <VelocidadeVendas />
        <SaudeMarketing />
        <ListaAlertas />
        <BlocoInsights />
      </div>
    </LayoutV2>
  );
}
