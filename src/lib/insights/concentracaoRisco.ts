/**
 * Insight: concentração de risco em corretor.
 *
 * Regra: se algum corretor PF tem >40% das vendas, alerta.
 * Exclui imobiliárias (Eggs) — só corretores PF.
 */
import { AlertTriangle } from "lucide-react";
import type { Insight } from "./types";

export interface DadosConcentracao {
  vendasPorCorretor: { corretorNome: string; qtdVendas: number; cnpj?: string }[];
  totalVendas: number;
}

const NOMES_A_EXCLUIR = ["EGGS", "GESTÃO", "GESTAO", "INTELIGENCIA EM VENDAS"];

function isImobiliaria(nome: string): boolean {
  const upper = nome.toUpperCase();
  return NOMES_A_EXCLUIR.some((n) => upper.includes(n));
}

export function calcularConcentracaoRisco(dados: DadosConcentracao): Insight | null {
  if (dados.totalVendas === 0) return null;

  const corretoresPF = dados.vendasPorCorretor.filter((c) => !isImobiliaria(c.corretorNome));
  if (corretoresPF.length === 0) return null;

  const top = [...corretoresPF].sort((a, b) => b.qtdVendas - a.qtdVendas)[0];
  if (!top) return null;

  const pct = top.qtdVendas / dados.totalVendas;
  if (pct < 0.4) return null;

  const severidade = pct >= 0.6 ? "vermelho" : "amarelo";
  return {
    id: "concentracao-risco",
    titulo: "Concentração de risco",
    texto: `${top.corretorNome} representa ${(pct * 100).toFixed(0)}% das vendas (${top.qtdVendas} de ${dados.totalVendas}). Considere diversificar.`,
    severidade,
    icon: AlertTriangle,
    prioridade: 90,
  };
}
