/**
 * LTV do corretor — FONTE ÚNICA do cálculo (usada pelo CorretorDrawer e pela
 * coluna "LTV ajustado" do ranking). Não duplicar esta conta em componente.
 *
 *  LTV líquido  = Mangaba gerado − (bônus + comissões 6,5%)
 *  Qualidade    = 50% autorizado(≥1,5% pago) + 30% adimplência + 20% não-cancelamento
 *  LTV ajustado = LTV líquido × qualidade%
 *
 * Mangaba por lote firme: valorPrincipal do ERP UAU; lote ainda fora do ERP
 * (venda recente) é estimado por valor × FATOR_MANGABA — assim custo e valor
 * cobrem os MESMOS lotes.
 */
import { COMISSAO_TOTAL_PCT, FATOR_MANGABA } from "@/lib/constants/negocio";

export interface ContratoLtv { loteId: string; valor: number; cancelado: boolean; corretor?: { nome: string } }
export interface BonusLtv { loteId: string; autorizado?: boolean; valorTotal: number }
export interface VendaUauLtv { identificadorUnidade: string; valorPrincipal: number }
export interface ParcelaLtv { identificadorUnidade: string; status: string; tipoParcela?: string }

export interface LtvResultado {
  firmes: number;
  canceladas: number;
  vgv: number;
  ticket: number;
  custoBonus: number;
  custoComissao: number;
  custoTotal: number;
  pctAutorizado: number;
  pctCancel: number;
  // Dependentes do UAU (só válidos quando uauPronto=true)
  uauPronto: boolean;
  mangaba: number;
  inadLotes: number;
  pctInad: number;
  ltvLiquido: number;
  qualidade: number;
  ltvAjustado: number;
}

export function calcularLtvCorretor(
  corretorNome: string,
  contratos: ContratoLtv[],
  bonus: BonusLtv[],
  vendasUau: VendaUauLtv[] | null,
  parcelas: ParcelaLtv[] | null,
): LtvResultado {
  const meus = contratos.filter((c) => c.corretor?.nome === corretorNome);
  const firmes = meus.filter((c) => !c.cancelado);
  const canceladas = meus.filter((c) => c.cancelado);
  const loteIds = new Set(firmes.map((c) => c.loteId));
  const vgv = firmes.reduce((s, c) => s + (c.valor || 0), 0);

  const bonusMeus = bonus.filter((b) => loteIds.has(b.loteId));
  const custoBonus = bonusMeus.reduce((s, b) => s + (b.valorTotal || 0), 0);
  const custoComissao = vgv * COMISSAO_TOTAL_PCT;
  const custoTotal = custoBonus + custoComissao;

  // Regra ATUAL do bônus: autorizado = cliente pagou ≥1,5% do contrato.
  const qtdAutorizado = bonusMeus.filter((b) => b.autorizado === true).length;
  const pctAutorizado = firmes.length ? qtdAutorizado / firmes.length : 0;
  const pctCancel = meus.length ? canceladas.length / meus.length : 0;

  const r: LtvResultado = {
    firmes: firmes.length,
    canceladas: canceladas.length,
    vgv,
    ticket: firmes.length ? vgv / firmes.length : 0,
    custoBonus,
    custoComissao,
    custoTotal,
    pctAutorizado,
    pctCancel,
    uauPronto: !!vendasUau && !!parcelas,
    mangaba: 0,
    inadLotes: 0,
    pctInad: 0,
    ltvLiquido: 0,
    qualidade: 0,
    ltvAjustado: 0,
  };
  if (!r.uauPronto) return r;

  const vmap = new Map((vendasUau || []).map((v) => [v.identificadorUnidade, v]));
  for (const c of firmes) {
    const v = vmap.get(c.loteId);
    r.mangaba += v?.valorPrincipal && v.valorPrincipal > 0 ? v.valorPrincipal : (c.valor || 0) * FATOR_MANGABA;
  }
  // Inadimplência = parcelas vencidas que NÃO são entrada/sinal (E/S) — entrada
  // atrasada já pesa no "autorizado"; contar aqui penalizaria 2x e divergiria
  // da aba Financeiro.
  const vencidos = new Set(
    (parcelas || [])
      .filter((p) => p.status === "vencida" && p.tipoParcela !== "E" && p.tipoParcela !== "S" && loteIds.has(p.identificadorUnidade))
      .map((p) => p.identificadorUnidade),
  );
  r.inadLotes = vencidos.size;
  r.pctInad = firmes.length ? vencidos.size / firmes.length : 0;
  r.ltvLiquido = r.mangaba - custoTotal;
  r.qualidade = Math.max(0, Math.round(100 * (pctAutorizado * 0.5 + (1 - r.pctInad) * 0.3 + (1 - pctCancel) * 0.2)));
  r.ltvAjustado = r.ltvLiquido * (r.qualidade / 100);
  return r;
}
