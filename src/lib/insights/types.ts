/**
 * Contrato dos insights — todos retornam o mesmo shape.
 * Permite a UI tratá-los uniformemente sem conhecer a regra.
 */
import type { Severidade } from "@/lib/utils/cores";
import type { LucideIcon } from "lucide-react";

export interface Insight {
  /** id estável pro React key. */
  id: string;
  /** Título curto, ex: "Concentração de risco". */
  titulo: string;
  /** Texto explicativo (1-2 frases), ex: "Corretor X representa 42% das vendas". */
  texto: string;
  /** Severidade pra cor (default: cinza). */
  severidade?: Severidade;
  /** Ícone customizado (default: Lightbulb). */
  icon?: LucideIcon;
  /** Prioridade (maior aparece primeiro). */
  prioridade?: number;
}

/** Cada regra exporta uma função que pode retornar null se não há insight relevante. */
export type RegraInsight<T> = (dados: T) => Insight | null;
