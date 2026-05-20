// Inspeção: campos de ConsultarResumoVenda + parcelasportipo
import { NextResponse } from "next/server";
import { authenticate, isUauConfigured, uauFetch } from "@/lib/uau-auth";

export const maxDuration = 60;

export async function GET() {
  if (!isUauConfigured()) return NextResponse.json({ error: "UAU não configurado" }, { status: 503 });
  const token = await authenticate();

  // Pega resumo de algumas vendas para inspecionar
  const numVendas = [40, 41, 42, 11, 19];
  const results = await Promise.all(
    numVendas.map(async (numVen) => {
      try {
        const res = await uauFetch(token, "Venda/ConsultarResumoVenda", {
          codigoObra: "01VEN", codigoEmpresa: 2, numeroVenda: numVen,
        }, 10000);
        return { numVen, ok: true, raw: res };
      } catch (e) {
        return { numVen, ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    })
  );

  // Soma de todas as parcelas (em aberto) pra comparar
  let parcelasRaw: unknown = null;
  try {
    parcelasRaw = await uauFetch(token, "Venda/BuscarParcelasAReceber", { empresa: 2, obra: "01VEN" }, 30000);
  } catch { /* ignore */ }

  const todasParcelas: Record<string, unknown>[] = Array.isArray(parcelasRaw) ? (parcelasRaw as Record<string, unknown>[]) : [];
  const parcelasValidas = todasParcelas.filter((p) => typeof p.Empresa_prc === "number");
  const totalParcelasAberto = parcelasValidas.reduce((s, p) => s + (Number(p.Valor_Prc) || 0), 0);

  return NextResponse.json({
    totalParcelasEmAberto: totalParcelasAberto,
    qtdParcelasEmAberto: parcelasValidas.length,
    resumosVendas: results,
  });
}
