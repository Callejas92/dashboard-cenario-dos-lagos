// Debug: lista TODOS os campos retornados por ConsultarResumoVenda pra 1 venda específica.
// Objetivo: ver se existe campo "valor efetivo" / "valor com desconto" no UAU.
import { NextResponse } from "next/server";
import { authenticate, isUauConfigured, uauFetch } from "@/lib/uau-auth";

export const maxDuration = 60;

export async function GET() {
  if (!isUauConfigured()) return NextResponse.json({ error: "UAU não configurado" }, { status: 503 });
  const token = await authenticate();

  // Q7-L88 RAVS = venda 14 (planilha mostra VV 435k vs Eggs 521k = desconto 86k)
  // Q2-L23 Wesley = venda ? (planilha mostra VV 414k vs Eggs 521k = desconto 86k)
  // Vamos testar várias vendas pra capturar exemplos com desconto.
  const numVendas = [14, 11, 32, 22]; // Q7-L88, Q7-L90, Q6-L75, Q2-L29
  const results = [];

  for (const num of numVendas) {
    try {
      const raw = await uauFetch(token, "Venda/ConsultarResumoVenda", {
        codigoObra: "01VEN", codigoEmpresa: 2, numeroVenda: num,
      }, 15000);
      results.push({ numVenda: num, raw });
    } catch (e) {
      results.push({ numVenda: num, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ results });
}
