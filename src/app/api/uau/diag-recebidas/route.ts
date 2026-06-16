/**
 * TEMPORÁRIO — descobrir os parâmetros de Venda/BuscarParcelasRecebidas (existe: 400).
 * Usa a auth do app. Retorna estrutura + erros completos. REMOVER após investigar.
 */
import { NextResponse } from "next/server";
import { authenticate, uauFetch } from "@/lib/uau-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EP = "Venda/BuscarParcelasRecebidas";

export async function GET() {
  const out: Record<string, unknown> = {};
  try {
    const token = await authenticate();

    // Contrato descoberto: {empresa, obra, num_ven}. Testa com vendas reais e dumpa estrutura.
    const resultados: unknown[] = [];
    for (const numVen of [59, 52, 60]) {
      try {
        const res = await uauFetch(token, EP, { empresa: 2, obra: "01VEN", num_ven: numVen }, 15000);
        const arr = Array.isArray(res) ? res : [];
        // pula linha de schema (valores tipo "System.Int32...")
        const dataRow = arr.find((r) => r && typeof r === "object" && Object.values(r as object).some((v) => typeof v === "number"));
        const sample = (dataRow || arr[0]) as Record<string, unknown> | undefined;
        // mostra campos + os que parecem DATA com um valor de exemplo
        const campos = sample ? Object.keys(sample) : [];
        const camposData: Record<string, unknown> = {};
        if (sample) for (const k of campos) if (/dat|venc|pag|baixa|receb/i.test(k)) camposData[k] = sample[k];
        resultados.push({ num_ven: numVen, OK: true, total: arr.length, campos, camposData });
      } catch (e) {
        resultados.push({ num_ven: numVen, OK: false, erro: (e instanceof Error ? e.message : String(e)).slice(0, 200) });
      }
    }
    out.tentativas = resultados;
  } catch (e) {
    out.erroGeral = e instanceof Error ? e.message : String(e);
  }
  return NextResponse.json(out);
}
