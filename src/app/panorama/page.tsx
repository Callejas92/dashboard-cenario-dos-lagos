/**
 * Panorama — aba default do dashboard v2.
 *
 * Mobile-first. Decisão em 5/15/30 segundos (Few + Knaflic).
 *
 * 7 linhas:
 *   1. KPIs gigantes (VGV, VSO, Velocidade)
 *   2. Mini-funil de contratos
 *   3. Velocidade em 4 janelas temporais
 *   4. Previsão de término (3 cenários)
 *   5. Saúde do marketing (4 KPIs médios)
 *   6. Alertas condicionais
 *   7. Insights (curiosidades automáticas)
 */
import LayoutV2 from "@/components/shared/LayoutV2";
import LinhaKpisGigantes from "@/components/panorama/LinhaKpisGigantes";
import MiniFunilContratos from "@/components/panorama/MiniFunilContratos";
import VelocidadeVendas from "@/components/panorama/VelocidadeVendas";
import VelocidadeNoTempo from "@/components/panorama/VelocidadeNoTempo";
import PrevisaoTermino from "@/components/panorama/PrevisaoTermino";
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
        <VelocidadeNoTempo />
        <PrevisaoTermino />
        <SaudeMarketing />
        <ListaAlertas />
        <BlocoInsights />
      </div>
    </LayoutV2>
  );
}
