/**
 * Projeção de vendas — limitada ao estoque disponível.
 *
 * Corrige D3: dashboard atual projeta 480 lotes em 12 meses, mas o estoque
 * total vendável é 174. Projeção tem que ser cap em (174 - vendidos).
 *
 * Método: média ponderada dos últimos N meses + cap absoluto no estoque.
 */
import { PROJETO } from "@/lib/constants/projeto";

export interface VendasMensais {
  mes: string;     // "2026-05"
  vendas: number;
  valor: number;
}

export interface ProjecaoInput {
  /** Histórico ordenado, mais recente no fim. */
  vendasMensais: VendasMensais[];
  /** Lotes já vendidos (pra cap). */
  lotesVendidos: number;
  /** Horizonte em meses (default: [1, 3, 6, 12]). */
  horizontes?: number[];
}

export interface ProjecaoItem {
  meses: number;
  periodo: string;            // "1 mês" / "3 meses"
  vendasProjetadas: number;   // limitado ao estoque
  vendasProjetadasLinear: number; // sem cap (informativo)
  valorProjetado: number;
  estouEstoque: boolean;      // true se atingiu o limite
}

export function calcularProjecao(input: ProjecaoInput): ProjecaoItem[] {
  const horizontes = input.horizontes ?? [1, 3, 6, 12];
  const recent = input.vendasMensais.filter((m) => m.vendas > 0).slice(-6);

  if (recent.length === 0) {
    return horizontes.map((m) => ({
      meses: m,
      periodo: m === 1 ? "1 mês" : `${m} meses`,
      vendasProjetadas: 0,
      vendasProjetadasLinear: 0,
      valorProjetado: 0,
      estouEstoque: false,
    }));
  }

  // Pesos crescentes — meses recentes pesam mais
  const weights = [1, 1.5, 2, 2.5, 3, 4].slice(-recent.length);
  const totalW = weights.reduce((a, b) => a + b, 0);
  const avgVendas = recent.reduce((s, m, i) => s + m.vendas * weights[i], 0) / totalW;
  const avgValor = recent.reduce((s, m, i) => s + m.valor * weights[i], 0) / totalW;

  const lotesRestantes = Math.max(0, PROJETO.LOTES_VENDAVEIS - input.lotesVendidos);
  const valorMedio = avgVendas > 0 ? avgValor / avgVendas : PROJETO.VALOR_MEDIO_LOTE;

  return horizontes.map((meses) => {
    const linear = Math.round(avgVendas * meses);
    const capped = Math.min(linear, lotesRestantes);
    return {
      meses,
      periodo: meses === 1 ? "1 mês" : `${meses} meses`,
      vendasProjetadas: capped,
      vendasProjetadasLinear: linear,
      valorProjetado: Math.round(capped * valorMedio),
      estouEstoque: linear > lotesRestantes,
    };
  });
}
