/**
 * Velocidade de vendas em janelas temporais.
 *
 * Pedido do Felipe (Panorama linha 3):
 *  - últimos 7 dias
 *  - últimos 30 dias
 *  - mês comercial atual (dia 15 → 14)
 *  - acumulado lançamento (DATA_LANCAMENTO até hoje)
 */
import { PROJETO } from "@/lib/constants/projeto";
import { getMesComercialAtual, type MesComercial } from "@/lib/utils/mesComercial";
import { corMeta, type Severidade } from "@/lib/utils/cores";

export interface VendaComData {
  dataVenda: string; // ISO yyyy-mm-dd
  valor: number;
}

export interface JanelaVelocidade {
  label: string;
  inicio: string;
  fim: string;
  qtdVendas: number;
  valorTotal: number;
}

export interface VelocidadeResultado {
  ultimos7d: JanelaVelocidade;
  ultimos30d: JanelaVelocidade;
  mesComercialAtual: JanelaVelocidade & { meta: number; severidade: Severidade };
  acumulado: JanelaVelocidade;
}

function hojeISO(): string {
  return new Date().toISOString().split("T")[0];
}

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

function contarJanela(vendas: VendaComData[], inicio: string, fim: string): { qtd: number; valor: number } {
  let qtd = 0, valor = 0;
  for (const v of vendas) {
    if (!v.dataVenda) continue;
    if (v.dataVenda >= inicio && v.dataVenda <= fim) {
      qtd++;
      valor += v.valor;
    }
  }
  return { qtd, valor };
}

export function calcularVelocidade(
  vendas: VendaComData[],
  mesComercial?: MesComercial,
): VelocidadeResultado {
  const hoje = hojeISO();
  const mc = mesComercial ?? getMesComercialAtual();

  const win7 = contarJanela(vendas, daysAgoISO(7), hoje);
  const win30 = contarJanela(vendas, daysAgoISO(30), hoje);
  const winMC = contarJanela(vendas, mc.inicioISO, mc.fimISO);
  const winAcum = contarJanela(vendas, PROJETO.DATA_LANCAMENTO, hoje);

  return {
    ultimos7d: { label: "últimos 7 dias", inicio: daysAgoISO(7), fim: hoje, qtdVendas: win7.qtd, valorTotal: win7.valor },
    ultimos30d: { label: "últimos 30 dias", inicio: daysAgoISO(30), fim: hoje, qtdVendas: win30.qtd, valorTotal: win30.valor },
    mesComercialAtual: {
      label: mc.labelCurto,
      inicio: mc.inicioISO,
      fim: mc.fimISO,
      qtdVendas: winMC.qtd,
      valorTotal: winMC.valor,
      meta: PROJETO.VELOCIDADE_ALVO_LOTES_MES,
      severidade: corMeta(winMC.qtd, PROJETO.VELOCIDADE_ALVO_LOTES_MES),
    },
    acumulado: { label: "desde lançamento", inicio: PROJETO.DATA_LANCAMENTO, fim: hoje, qtdVendas: winAcum.qtd, valorTotal: winAcum.valor },
  };
}
