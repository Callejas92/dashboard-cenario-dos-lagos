/**
 * Insight: perfil do lote médio vendido no mês comercial atual.
 *
 * Útil pra saber se a "demanda" do mês tá puxando lotes grandes/caros ou pequenos.
 */
import { Home } from "lucide-react";
import { formatBRLCompact } from "@/lib/utils/formatters";
import type { Insight } from "./types";

export interface DadosLoteMedio {
  vendasNoMes: { area: number; valor: number; classificacao?: string }[];
}

export function calcularLoteMedioMes(dados: DadosLoteMedio): Insight | null {
  const vendas = dados.vendasNoMes.filter((v) => v.area > 0 || v.valor > 0);
  if (vendas.length === 0) return null;

  const areaMedia = vendas.reduce((s, v) => s + v.area, 0) / vendas.length;
  const valorMedio = vendas.reduce((s, v) => s + v.valor, 0) / vendas.length;

  // Classificação mais comum
  const contClass = new Map<string, number>();
  for (const v of vendas) {
    const c = v.classificacao || "—";
    contClass.set(c, (contClass.get(c) ?? 0) + 1);
  }
  const classTop = Array.from(contClass.entries()).sort((a, b) => b[1] - a[1])[0];
  const classText = classTop && classTop[0] !== "—" ? `, classificação ${classTop[0]}` : "";

  return {
    id: "lote-medio-mes",
    titulo: "Perfil do lote vendido no mês",
    texto: `Média ${vendas.length} venda${vendas.length > 1 ? "s" : ""}: ${areaMedia.toFixed(0)} m²${classText}, ticket ${formatBRLCompact(valorMedio)}.`,
    severidade: "cinza",
    icon: Home,
    prioridade: 40,
  };
}
