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

    // Investidor (Tio Ico) é EXCLUÍDO de tudo — não existe nas métricas
    // Total real = 174, não 213
    const statusCounts: Record<string, number> = {};
    const lotesEnriquecidos: {
      loteId: string;
      bloco: string;
      unidade: string;
      valor: number;
      metragem: number;
      rua: string;
      status: string;
      statusId: number;
    }[] = [];

    let totalInvestidor = 0;
    for (const u of unidades) {
      const status = STATUS_MAP[u.id_situacao_unidade] || u.situacao_unidade || "DESCONHECIDO";
      const loteId = buildLoteId(u.bloco, u.unidade);

      // Pula lotes do investidor (não conta em nada)
      if (INVESTOR_LOTS.has(loteId)) {
        totalInvestidor++;
        continue;
      }

      lotesEnriquecidos.push({
        loteId,
        bloco: u.bloco,
        unidade: u.unidade,
        valor: u.valor,
        metragem: u.metragem,
        rua: u.rua || "",
        status,
        statusId: u.id_situacao_unidade,
      });

      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }

    const result = {
      configured: true,
      empreendimento: {
        id: empreendimento?.id_empreendimento,
        nome: empreendimento?.pessoaJuridica?.nome_fantasia,
        razaoSocial: empreendimento?.pessoaJuridica?.razao_social,
        cidade: empreendimento?.endereco?.cidade,
      },
      total: lotesEnriquecidos.length, // 174 (sem investidor)
      statusCounts,
      // Info apenas pra referência (nao usado nas metricas)
      _investidorExcluido: totalInvestidor,
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
