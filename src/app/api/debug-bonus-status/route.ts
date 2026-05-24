// Debug: mostra para cada venda ASSINADO Eggs:
//  - status no bonus atual
//  - parcelasportipo do UAU (E, S, P, B) com qtd paga/total
//  - valorRecebido + saldoDevedor
//  - se tem match UAU ou não
import { NextResponse } from "next/server";
import { authenticate, isUauConfigured, uauFetch } from "@/lib/uau-auth";
import { getContratosEggs } from "@/lib/eggs-contratos";
import { getBonusTracking } from "@/lib/bonus";
import investorData from "@/data/investor-lots.json";

export const maxDuration = 60;
const INVESTOR = new Set<string>(investorData.lots);

interface ParcelaPorTipo { tipoParcela: string; descricaoTipoParcela: string; quantidadeParcelaAPagar: number; quantidadeParcelaPaga: number; totalParcelaAPagar: number; totalParcelaPaga: number }

function extractMyTable(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw) && raw.length > 0 && (raw[0] as { MyTable?: unknown[] }).MyTable) {
    const t = (raw[0] as { MyTable: unknown[] }).MyTable;
    return Array.isArray(t) && t.length > 1 ? (t as Record<string, unknown>[]).slice(1) : [];
  }
  return [];
}

export async function GET() {
  if (!isUauConfigured()) return NextResponse.json({ error: "UAU não configurado" }, { status: 503 });
  const token = await authenticate();
  const now = new Date();
  const td = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${now.getFullYear()}`;

  // Pega vendas Eggs (ASSINADO) + bonus atual + espelho UAU
  const [contratos, bonusTracking, espelhoRaw] = await Promise.all([
    getContratosEggs(),
    getBonusTracking(),
    uauFetch(token, "Espelho/BuscaUnidadesDeAcordoComWhereDetalhado", {
      where: "WHERE Empresa_unid = 2 AND Vendido_unid = 1",
      retorna_venda: true,
      data_tabela_preco: td,
    }, 20000),
  ]);

  const STATUS_ELEGIVEL = new Set(["ASSINADO", "FATURADO", "ENTREGUE AO INCORPORADOR"]);
  const contratosValidos = contratos.filter((c) =>
    !INVESTOR.has(c.loteId) && !c.cancelado && STATUS_ELEGIVEL.has(c.statusOriginal)
  );

  // Map loteId → NumVen via Espelho
  const rows = extractMyTable(espelhoRaw);
  const loteToVenda = new Map<string, { numVen: number; obra: string; empresa: number }>();
  for (const r of rows) {
    const id = String(r.Identificador_unid || "");
    if (!id) continue;
    const numVen = Number(r.Num_Ven) || 0;
    if (numVen === 0) continue;
    loteToVenda.set(id, {
      numVen,
      obra: String(r.Obra_unid || "01VEN"),
      empresa: Number(r.Empresa_unid) || 2,
    });
  }

  // Map bonus por loteId pra status atual
  const bonusByLote = new Map(bonusTracking.bonus.map((b) => [b.loteId, b]));

  // Pra cada contrato, busca o resumo completo do UAU
  const detalhes = await Promise.all(
    contratosValidos.map(async (c) => {
      const uauInfo = loteToVenda.get(c.loteId);
      const bonusAtual = bonusByLote.get(c.loteId);

      if (!uauInfo) {
        return {
          loteId: c.loteId,
          cliente: c.cliente,
          statusEggs: c.statusOriginal,
          statusBonusAtual: bonusAtual?.status || "?",
          uau: { matched: false, numVen: 0 },
          parcelasportipo: [],
          totaisrecebido: null,
        };
      }

      try {
        const resumo = await uauFetch(token, "Venda/ConsultarResumoVenda", {
          codigoObra: uauInfo.obra, codigoEmpresa: uauInfo.empresa, numeroVenda: uauInfo.numVen,
        }, 10000);
        const data = Array.isArray(resumo) ? resumo[0] : resumo;
        const ptipo = (data as { parcelasportipo?: ParcelaPorTipo[] })?.parcelasportipo || [];
        const totRec = (data as { totaisrecebido?: { valorTotalRecebido?: number }[] })?.totaisrecebido?.[0] || null;

        return {
          loteId: c.loteId,
          cliente: c.cliente,
          statusEggs: c.statusOriginal,
          statusBonusAtual: bonusAtual?.status || "?",
          uau: { matched: true, numVen: uauInfo.numVen },
          parcelasportipo: ptipo.map((p) => ({
            tipo: p.tipoParcela,
            desc: p.descricaoTipoParcela,
            qtdPaga: p.quantidadeParcelaPaga,
            qtdAPagar: p.quantidadeParcelaAPagar,
            valorPago: p.totalParcelaPaga,
            valorAPagar: p.totalParcelaAPagar,
          })),
          totaisrecebido: totRec ? Number(totRec.valorTotalRecebido) || 0 : 0,
        };
      } catch (e) {
        return {
          loteId: c.loteId,
          cliente: c.cliente,
          statusEggs: c.statusOriginal,
          statusBonusAtual: bonusAtual?.status || "?",
          uau: { matched: true, numVen: uauInfo.numVen, error: String(e) },
          parcelasportipo: [],
          totaisrecebido: null,
        };
      }
    })
  );

  return NextResponse.json({
    total: detalhes.length,
    detalhes: detalhes.sort((a, b) => a.loteId.localeCompare(b.loteId)),
  });
}
