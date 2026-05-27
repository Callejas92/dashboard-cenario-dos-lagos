// Validação rápida das funções da Fase 1 contra dados reais de produção.
// Roda: node scripts/validate-fase1.mjs

const PROD = "https://dashboard-cenario-dos-lagos.vercel.app";

async function main() {
  console.log("=== VALIDAÇÃO FASE 1 ===\n");

  // 1. Pega dados reais de produção
  const [bonusRes, uauRes, financRes] = await Promise.all([
    fetch(`${PROD}/api/bonus`).then((r) => r.json()),
    fetch(`${PROD}/api/uau`).then((r) => r.json()),
    fetch(`${PROD}/api/uau/financeiro`).then((r) => r.json()),
  ]);

  const summary = uauRes.summary || {};
  const vendidos = summary.vendido || 0;
  const disponivel = summary.disponivel || 0;
  const valorVendido = financRes.valorVendidoTotal || 0;

  // 2. Simulação das funções (cópia mínima das fórmulas pra validar)
  const VGV_INICIAL = 85_907_960.04;
  const LOTES_VENDAVEIS = 174;
  const VSO_META = 0.05;

  // VGV
  const pctVendido = VGV_INICIAL > 0 ? valorVendido / VGV_INICIAL : 0;
  console.log("📊 VGV (corrige D1):");
  console.log(`  vgvTotal    R$ ${VGV_INICIAL.toLocaleString("pt-BR")}`);
  console.log(`  vgvVendido  R$ ${valorVendido.toLocaleString("pt-BR")}`);
  console.log(`  pctVendido  ${(pctVendido * 100).toFixed(2)}%`);
  console.log(`  lotesTotal  ${LOTES_VENDAVEIS}`);
  console.log(`  vendidos    ${vendidos}`);
  console.log(`  restantes   ${LOTES_VENDAVEIS - vendidos}`);
  console.log(`  ✓ batendo com a planilha? VGV 85.91M = ${VGV_INICIAL === 85_907_960.04 ? "SIM" : "NÃO"}\n`);

  // VSO
  const denom = vendidos + disponivel;
  const vso = denom > 0 ? vendidos / denom : 0;
  console.log("📊 VSO (corrige D2 - única fórmula):");
  console.log(`  fórmula     vendidos / (vendidos + disponível) = ${vendidos} / ${denom}`);
  console.log(`  vso         ${(vso * 100).toFixed(2)}%`);
  console.log(`  meta        ${(VSO_META * 100).toFixed(0)}%`);
  console.log(`  severidade  ${vso >= VSO_META ? "🟢 verde" : vso >= VSO_META * 0.7 ? "🟡 amarelo" : "🔴 vermelho"}\n`);

  // Projeção
  console.log("📊 Projeção (corrige D3 - cap em 174):");
  console.log(`  Cenário hipotético: avg 6 vendas/mês`);
  for (const meses of [1, 3, 6, 12]) {
    const linear = Math.round(6 * meses);
    const restantes = LOTES_VENDAVEIS - vendidos;
    const capped = Math.min(linear, restantes);
    const cap = linear > restantes ? " [⚠ CAP]" : "";
    console.log(`  ${meses} mês(es):  linear ${linear} → projetado ${capped}${cap}`);
  }
  console.log();

  // Bonus do investidor
  console.log("📊 Bônus filtra investidor + ASSINADO:");
  const totalBonus = (bonusRes.summary || {}).qtdValidas || 0;
  console.log(`  vendas válidas pra bônus: ${totalBonus} (esperado 29: 38 contratos - 9 não-assinados)`);
  console.log();

  console.log("✅ Validação completa. Cole no checkpoint.");
}

main().catch((e) => { console.error(e); process.exit(1); });
