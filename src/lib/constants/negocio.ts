/**
 * REGRAS DE NEGÓCIO — fonte única (NÃO duplicar estes números em outros arquivos).
 *
 * Antes desta centralização, o fator Mangaba (0,935) existia em 3 lugares e a
 * comissão (6,5%) em outros 3 — mudou um acordo, esquecia um lugar, dashboard
 * divergia. Se algum valor mudar, muda AQUI e o projeto inteiro acompanha.
 *
 * Premissas estratégicas (VGV, metas, mês comercial) ficam em ./projeto.ts —
 * aqui é só a mecânica de comissões/bônus.
 */

// ── Comissões sobre o valor do contrato ─────────────────────────────────────
export const COMISSAO_IMOB_PCT = 0.05;   // 5% — imobiliária parceira
export const COMISSAO_EGGS_PCT = 0.015;  // 1,5% — Eggs (gestão de vendas)
export const COMISSAO_TOTAL_PCT = COMISSAO_IMOB_PCT + COMISSAO_EGGS_PCT; // 6,5%

// Fator "Mangaba": fração do contrato que sobra pra Mangaba após comissões.
// Usado pra ESTIMAR o principal líquido quando a venda ainda não está no ERP UAU
// (lá o valorPrincipal real tem prioridade).
export const FATOR_MANGABA = 1 - COMISSAO_TOTAL_PCT; // 0,935

// ── Bônus por venda válida ──────────────────────────────────────────────────
export const BONUS_CORRETORA = 3000;
export const BONUS_IMOBILIARIA = 1000;
export const BONUS_TOTAL_POR_VENDA = BONUS_CORRETORA + BONUS_IMOBILIARIA; // R$ 4.000

// Autorização do bônus: cliente pagou >= 1,5% do contrato (valor recebido no ERP,
// "o que veio pra Mangaba"). Regra definida pelo Felipe em jun/2026.
export const PCT_AUTORIZACAO = 0.015;
