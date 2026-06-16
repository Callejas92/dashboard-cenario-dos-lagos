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

    // Vários conjuntos de parâmetros — descobre o contrato pelo erro 400 ou pelo 200.
    const tentativas: Record<string, unknown>[] = [
      { empresa: 2, obra: "01VEN" },
      { empresa: 2, obra: "01VEN", dataInicial: "01/01/2026", dataFinal: "31/12/2026" },
      { empresa: 2, obra: "01VEN", dataInicio: "2026-01-01", dataFim: "2026-12-31" },
      { empresa: 2, obra: "01VEN", dataInicialRecebimento: "01/01/2026", dataFinalRecebimento: "31/12/2026" },
      { empresa: 2, obra: "01VEN", dataIni: "01/01/2026", dataFim: "31/12/2026" },
      { codigoEmpresa: 2, codigoObra: "01VEN", dataInicial: "01/01/2026", dataFinal: "31/12/2026" },
      { empresa: 2, obra: "01VEN", dataInicial: "2026-01-01", dataFinal: "2026-12-31", numeroVenda: 0 },
    ];

    const resultados: unknown[] = [];
    for (const params of tentativas) {
      try {
        const res = await uauFetch(token, EP, params, 15000);
        // Sucesso! mostra estrutura do 1o registro de dado (achar campos de DATA)
        const arr = Array.isArray(res) ? res : [];
        const dataRow = arr.find((r) => r && typeof r === "object" && typeof (r as Record<string, unknown>).Empresa_prc !== "string");
        const sample = dataRow || arr[1] || arr[0] || res;
        resultados.push({ params: Object.keys(params), OK: true, total: Array.isArray(res) ? res.length : "n/a", campos: sample && typeof sample === "object" ? Object.keys(sample as object) : typeof sample });
      } catch (e) {
        resultados.push({ params: Object.keys(params), OK: false, erro: (e instanceof Error ? e.message : String(e)).slice(0, 280) });
      }
    }
    out.tentativas = resultados;
  } catch (e) {
    out.erroGeral = e instanceof Error ? e.message : String(e);
  }
  return NextResponse.json(out);
}
