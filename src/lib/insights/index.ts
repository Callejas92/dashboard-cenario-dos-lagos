/**
 * Insights aggregator — agrupa tudo numa estrutura única.
 *
 * V1 → só insights tipo A (estado atual, sem histórico).
 *
 * V2 (// TODO):
 *  - taxaConversaoFunil → precisa série temporal de contratos por estágio
 *  - tempoMedioAssinatura → precisa histórico de transição entre estágios
 *  - ritmoCorretor → precisa snapshots semanais de vendas por corretor
 *
 * Pra implementar V2: cron diário grava snapshot.
 */
export * from "./types";
export { calcularConcentracaoRisco } from "./concentracaoRisco";
export { calcularLoteMedioMes } from "./loteMedioMes";
export { calcularBudgetConsumido } from "./budgetConsumido";
export { calcularBonusComprometido } from "./bonusComprometido";
export { calcularVelocidadeMes } from "./velocidadeMes";

// TODO V2 (precisa de histórico/snapshots):
// export { calcularTaxaConversaoFunil } from "./taxaConversaoFunil";
// export { calcularTempoMedioAssinatura } from "./tempoMedioAssinatura";
// export { calcularRitmoCorretor } from "./ritmoCorretor";
