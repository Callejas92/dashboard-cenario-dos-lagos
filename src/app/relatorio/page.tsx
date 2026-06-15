/**
 * Relatório Mensal Comercial — mês comercial 15 → 14.
 *
 * Página printável: seletor de mês, 4 seções (vendas+meta, acumulado+VSO,
 * ranking, financeiro atual). Mês fechado = oficial congelado; em curso = ao vivo.
 */
import LayoutV2 from "@/components/shared/LayoutV2";
import RelatorioMensalView from "@/components/relatorio/RelatorioMensalView";

export const metadata = {
  title: "Relatório · Cenário dos Lagos",
};

export default function RelatorioPage() {
  return (
    <LayoutV2>
      <RelatorioMensalView />
    </LayoutV2>
  );
}
