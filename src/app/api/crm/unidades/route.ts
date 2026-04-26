import { NextResponse } from "next/server";
import investorData from "@/data/investor-lots.json";

const EGGS_API = "https://api.eggs.app/api/v1/Espelhovendaitem/unidades";
const INVESTOR_LOTS = new Set<string>(investorData.lots);

// Mapeamento de status do Eggs CRM
const STATUS_MAP: Record<number, string> = {
  1: "LIBERADA",
  2: "BLOQUEADA",
  3: "VENDIDA",
  4: "RESERVADA",
  5: "CONTRATO",
  6: "PRÉ-VENDA",
};

interface EggsUnidade {
  id_espelho_venda_item: number;
  bloco: string;
  unidade: string;
  valor: number;
  metragem: number;
  id_situacao_unidade: number;
  situacao_unidade: string;
  rua?: string;
}

interface EggsEmpreendimento {
  id_empreendimento: number;
  pessoaJuridica?: { cnpj?: string; razao_social?: string; nome_fantasia?: string };
  endereco?: { uf?: string; cidade?: string; bairro?: string; logradouro?: string };
  unidades: EggsUnidade[];
}

interface EggsResponse {
  id_incorporador_grupo?: number;
  nome?: string;
  empreendimentos?: EggsEmpreendimento[];
}

// Cache 2 min (estoque muda rápido)
let cache: { data: unknown; timestamp: number } | null = null;
const CACHE_TTL = 2 * 60 * 1000;

// Converte bloco/unidade do Eggs ("01"/"001") para nosso formato ("Q1-L1")
function buildLoteId(bloco: string, unidade: string): string {
  const q = parseInt(bloco) || 0;
  const l = parseInt(unidade) || 0;
  return `Q${q}-L${l}`;
}

export async function GET() {
  const token = process.env.CRM_EGGS_TOKEN?.trim();
  const empreendimentoId = process.env.CRM_EGGS_EMPREENDIMENTO_ID?.trim() || "10362";

  if (!token) {
    return NextResponse.json({
      configured: false,
      message: "CRM_EGGS_TOKEN não configurado.",
    });
  }

  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  try {
    const url = `${EGGS_API}?idsempreendimento=${empreendimentoId}`;
    const res = await fetch(url, {
      headers: { token_autorizacao: token },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Eggs API ${res.status}: ${text.slice(0, 200)}`);
    }

    const data: EggsResponse | EggsResponse[] = await res.json();
    const root = Array.isArray(data) ? data[0] : data;
    const empreendimento = root?.empreendimentos?.[0];
    const unidades = empreendimento?.unidades || [];

    // Status counts (excluindo investidor para os reais)
    const statusCounts: Record<string, number> = {};
    const statusCountsInvestidor: Record<string, number> = {};
    const lotesEnriquecidos: {
      loteId: string;
      bloco: string;
      unidade: string;
      valor: number;
      metragem: number;
      rua: string;
      status: string;
      statusId: number;
      isInvestidor: boolean;
    }[] = [];

    for (const u of unidades) {
      const status = STATUS_MAP[u.id_situacao_unidade] || u.situacao_unidade || "DESCONHECIDO";
      const loteId = buildLoteId(u.bloco, u.unidade);
      const isInvestidor = INVESTOR_LOTS.has(loteId);

      lotesEnriquecidos.push({
        loteId,
        bloco: u.bloco,
        unidade: u.unidade,
        valor: u.valor,
        metragem: u.metragem,
        rua: u.rua || "",
        status,
        statusId: u.id_situacao_unidade,
        isInvestidor,
      });

      if (isInvestidor) {
        statusCountsInvestidor[status] = (statusCountsInvestidor[status] || 0) + 1;
      } else {
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      }
    }

    // Total geral por status (com investidor)
    const statusCountsTotal: Record<string, number> = {};
    for (const s of Object.values(STATUS_MAP)) {
      statusCountsTotal[s] = (statusCounts[s] || 0) + (statusCountsInvestidor[s] || 0);
    }

    const result = {
      configured: true,
      empreendimento: {
        id: empreendimento?.id_empreendimento,
        nome: empreendimento?.pessoaJuridica?.nome_fantasia,
        razaoSocial: empreendimento?.pessoaJuridica?.razao_social,
        cidade: empreendimento?.endereco?.cidade,
      },
      total: unidades.length,
      // Sem investidor (para KPIs reais)
      statusCounts,
      // Investidor à parte (39 lotes Tio Ico)
      investidor: {
        total: Object.values(statusCountsInvestidor).reduce((s, n) => s + n, 0),
        statusCounts: statusCountsInvestidor,
      },
      // Geral (todos juntos, como o CRM mostra)
      statusCountsTotal,
      lotes: lotesEnriquecidos,
      fetchedAt: new Date().toISOString(),
    };

    cache = { data: result, timestamp: Date.now() };
    return NextResponse.json(result);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("CRM Unidades error:", errMsg);
    return NextResponse.json({
      configured: true,
      error: errMsg,
      total: 0,
      statusCounts: {},
      lotes: [],
    }, { status: 200 });
  }
}
