/**
 * Inadimplência — agregação POR CLIENTE, não por parcela.
 *
 * Corrige D8: "Top Parcelas Vencidas" mostrava lista de parcelas (8 linhas iguais
 * pro mesmo cliente). Briefing pede: agregar por cliente.
 *
 * Resultado: "Cliente X tem 8 parcelas atrasadas, R$ Y total, telefone Z".
 */
import { PROJETO } from "@/lib/constants/projeto";
import { corInadimplencia, type Severidade } from "@/lib/utils/cores";

export interface ParcelaVencida {
  identificadorUnidade: string;
  chaveVenda: string;            // empresa-numVenda
  numeroParcela: number;
  dataVencimento: string;
  valor: number;
  diasAtraso: number;
  tipoParcela: string;           // P/E/B/S
  clienteCodigo: number;
  clienteNome: string;
}

export interface ClienteInadimplente {
  clienteCodigo: number;
  clienteNome: string;
  qtdParcelas: number;
  valorTotal: number;
  diasAtrasoMaximo: number;
  diasAtrasoMedio: number;
  lotesEnvolvidos: string[];     // ["Q1-L9", "Q1-L10"]
  primeiraVencida: string;       // data ISO da primeira parcela vencida
}

export interface InadimplenciaInput {
  parcelasVencidas: ParcelaVencida[];
  totalAbertoEmDia: number;      // soma valor das parcelas em dia
}

export interface InadimplenciaResultado {
  totalVencido: number;
  totalEmDia: number;
  totalAberto: number;
  percentual: number;            // vencido / aberto
  severidade: Severidade;
  qtdParcelasVencidas: number;
  qtdClientesInadimplentes: number;
  porCliente: ClienteInadimplente[];
}

export function calcularInadimplencia(input: InadimplenciaInput): InadimplenciaResultado {
  // Agrupa parcelas por código de cliente (fallback: nome se código=0)
  const grupo = new Map<string, ClienteInadimplente>();

  for (const p of input.parcelasVencidas) {
    const chave = p.clienteCodigo > 0 ? `cod-${p.clienteCodigo}` : `nome-${p.clienteNome || p.chaveVenda}`;
    let item = grupo.get(chave);
    if (!item) {
      item = {
        clienteCodigo: p.clienteCodigo,
        clienteNome: p.clienteNome,
        qtdParcelas: 0,
        valorTotal: 0,
        diasAtrasoMaximo: 0,
        diasAtrasoMedio: 0,
        lotesEnvolvidos: [],
        primeiraVencida: p.dataVencimento,
      };
      grupo.set(chave, item);
    }
    item.qtdParcelas++;
    item.valorTotal += p.valor;
    if (p.diasAtraso > item.diasAtrasoMaximo) item.diasAtrasoMaximo = p.diasAtraso;
    if (!item.lotesEnvolvidos.includes(p.identificadorUnidade)) {
      item.lotesEnvolvidos.push(p.identificadorUnidade);
    }
    if (p.dataVencimento < item.primeiraVencida) item.primeiraVencida = p.dataVencimento;
  }

  // Calcula média de dias de atraso por cliente
  const porCliente = Array.from(grupo.values()).map((c) => {
    const parcelasCliente = input.parcelasVencidas.filter(
      (p) => (p.clienteCodigo > 0 && p.clienteCodigo === c.clienteCodigo) ||
             (p.clienteCodigo === 0 && p.clienteNome === c.clienteNome),
    );
    const somaDias = parcelasCliente.reduce((s, p) => s + p.diasAtraso, 0);
    c.diasAtrasoMedio = parcelasCliente.length > 0 ? Math.round(somaDias / parcelasCliente.length) : 0;
    return c;
  }).sort((a, b) => b.valorTotal - a.valorTotal);

  const totalVencido = input.parcelasVencidas.reduce((s, p) => s + p.valor, 0);
  const totalAberto = totalVencido + input.totalAbertoEmDia;
  const percentual = totalAberto > 0 ? totalVencido / totalAberto : 0;

  return {
    totalVencido,
    totalEmDia: input.totalAbertoEmDia,
    totalAberto,
    percentual,
    severidade: corInadimplencia(percentual),
    qtdParcelasVencidas: input.parcelasVencidas.length,
    qtdClientesInadimplentes: porCliente.length,
    porCliente,
  };
}

/** Util pra mostrar tooltip da meta de inadimplência. */
export function descricaoMetaInadimplencia(): string {
  return `verde até ${(PROJETO.INADIMPLENCIA_VERDE_MAX * 100).toFixed(0)}% · amarelo até ${(PROJETO.INADIMPLENCIA_AMARELO_MAX * 100).toFixed(0)}% · vermelho acima`;
}
