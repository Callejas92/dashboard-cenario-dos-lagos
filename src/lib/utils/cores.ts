/**
 * Cores semânticas — princípio Stephen Few/Cole Knaflic.
 *
 * SÓ usar essas cores no V2. Sem gradiente, sombra, 3D, ou cor decorativa.
 *
 * Estados (semantica):
 *  - verde  → ✅ meta atingida / saudável
 *  - amarelo → 🟡 atenção / próximo do limite
 *  - vermelho → 🔴 alerta / fora da meta
 *  - cinza → ⚪ neutro / sem julgamento
 *
 * As cores são definidas em duas formas:
 *  - VALUE: cor sólida do texto/borda
 *  - BG: fundo translúcido (~12% opacity) pra pills/badges
 */

export const CORES = {
  verde:    { value: "#10b981", bg: "rgba(16, 185, 129, 0.12)",  bgHover: "rgba(16, 185, 129, 0.18)"  },
  amarelo:  { value: "#f59e0b", bg: "rgba(245, 158, 11, 0.12)",  bgHover: "rgba(245, 158, 11, 0.18)"  },
  vermelho: { value: "#dc2626", bg: "rgba(220, 38, 38, 0.12)",   bgHover: "rgba(220, 38, 38, 0.18)"   },
  cinza:    { value: "#6b7280", bg: "rgba(107, 114, 128, 0.12)", bgHover: "rgba(107, 114, 128, 0.18)" },
} as const;

export type Severidade = "verde" | "amarelo" | "vermelho" | "cinza";

/** Classifica inadimplência: ≤3% verde, 3-5% amarelo, >5% vermelho. */
export function corInadimplencia(percent: number): Severidade {
  if (percent <= 0.03) return "verde";
  if (percent <= 0.05) return "amarelo";
  return "vermelho";
}

/** Classifica meta atingida: ≥100% verde, 70-99% amarelo, <70% vermelho. */
export function corMeta(realizado: number, meta: number): Severidade {
  if (meta <= 0) return "cinza";
  const ratio = realizado / meta;
  if (ratio >= 1) return "verde";
  if (ratio >= 0.7) return "amarelo";
  return "vermelho";
}

/** Inversa: pra métricas onde MENOR é melhor (CAC, inadimplência). */
export function corMetaInversa(realizado: number, metaMaxima: number): Severidade {
  if (metaMaxima <= 0) return "cinza";
  const ratio = realizado / metaMaxima;
  if (ratio <= 0.7) return "verde";
  if (ratio <= 1) return "amarelo";
  return "vermelho";
}

/** Helper pra pegar config completa da cor. */
export function cor(severidade: Severidade) {
  return CORES[severidade];
}
