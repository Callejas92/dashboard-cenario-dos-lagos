/**
 * Contratos do Eggs CRM (PropostaContrato/Exportar)
 *
 * Retorna todos os contratos com seus 12 status possíveis:
 * Físico:  1 GERADO, 2 CONFERIDO, 3 ENVIADO, 4 ASSINADO, 5 FATURADO, 6 ENTREGUE, 7 CANCELADO
 * Digital: 8 GERADO, 9 CONFERIDO, 10 ENVIADO, 11 ASSINADO, 12 CANCELADO
 */
import { NextRequest, NextResponse } from "next/server";
import { getContratosEggs } from "@/lib/eggs-contratos";
import { cachedJson } from "@/lib/blob-cache";

const EGGS_API = "https://api.eggs.app/api/v1/PropostaContrato/Exportar";

// Status mapping
const STATUS_MAP: Record<number, { label: string; tipo: "fisico" | "digital"; isAtivo: boolean }> = {
  1: { label: "GERADO", tipo: "fisico", isAtivo: true },
  2: { label: "CONFERIDO", tipo: "fisico", isAtivo: true },
  3: { label: "ENVIADO PARA ASSINATURA", tipo: "fisico", isAtivo: true },
  4: { label: "ASSINADO", tipo: "fisico", isAtivo: true },
  5: { label: "FATURADO", tipo: "fisico", isAtivo: true },
  6: { label: "ENTREGUE AO INCORPORADOR", tipo: "fisico", isAtivo: true },
  7: { label: "CANCELADO", tipo: "fisico", isAtivo: false },
  8: { label: "GERADO", tipo: "digital", isAtivo: true },
  9: { label: "CONFERIDO", tipo: "digital", isAtivo: true },
  10: { label: "ENVIADO PARA ASSINATURA", tipo: "digital", isAtivo: true },
  11: { label: "ASSINADO", tipo: "digital", isAtivo: true },
  12: { label: "CANCELADO", tipo: "digital", isAtivo: false },
};

interface EggsContrato {
  id_proposta_contrato: number;
  bloco: string;
  unidade: string;
  valor_unidade: number;
  numero?: number;
  metragem?: number;
  digital: boolean;
  responsavel: string;
  id_usuario_responsavel?: number;
  responsavel_cancelou?: string;
  id_usuario_cancelou?: number;
  status: string;
  empresaVenda?: {
    razao_social?: string;
    nome_fantasia?: string;
    cnpj?: string;
  };
  corretor?: {
    nome?: string;
    cpf?: string;
    creci?: string;
    contato?: { telefone_1?: string; email?: string };
  };
}

interface ContratoEnriquecido {
  id: number;
  loteId: string; // formato Q{quadra}-L{lote}
  bloco: string;
  unidade: string;
  valor: number;
  metragem: number;
  digital: boolean;
  cliente: string;
  status: string;
  statusOriginal: string;
  cancelado: boolean;
  responsavelCancelou?: string;
  corretor: {
    nome: string;
    cpf: string;
    creci: string;
    telefone: string;
    email: string;
  };
  imobiliaria: {
    razaoSocial: string;
    nomeFantasia: string;
    cnpj: string;
  };
}

const CACHE_TTL = 10 * 60 * 1000; // cache no Blob (persiste entre instâncias serverless)

function buildLoteId(bloco: string, unidade: string): string {
  const q = parseInt(bloco) || 0;
  const l = parseInt(unidade) || 0;
  return `Q${q}-L${l}`;
}

export async function GET(request: NextRequest) {
  const token = process.env.CRM_EGGS_TOKEN?.trim();
  const empreendimentoId = process.env.CRM_EGGS_EMPREENDIMENTO_ID?.trim() || "10362";

  if (!token) {
    return NextResponse.json({ configured: false, message: "CRM_EGGS_TOKEN não configurado" });
  }

  try {
    const payload = await cachedJson("crm-contratos", CACHE_TTL, async () => {
    // Usa lib compartilhado (mesma função que o cross-sell usa)
    const contratos = await getContratosEggs();

    // Estatísticas: contagem por status
    const porStatus: Record<string, number> = {};
    const porStatusValor: Record<string, number> = {};
    let valorTotalAtivo = 0;
    let valorTotalCancelado = 0;

    for (const c of contratos) {
      porStatus[c.status] = (porStatus[c.status] || 0) + 1;
      porStatusValor[c.status] = (porStatusValor[c.status] || 0) + c.valor;
      if (c.cancelado) valorTotalCancelado += c.valor;
      else valorTotalAtivo += c.valor;
    }

    // Por corretor
    const porCorretorMap = new Map<string, { contratos: number; valorTotal: number; cancelados: number; assinados: number }>();
    for (const c of contratos) {
      const nome = c.corretor.nome || "Não atribuído";
      const cur = porCorretorMap.get(nome) || { contratos: 0, valorTotal: 0, cancelados: 0, assinados: 0 };
      cur.contratos++;
      if (!c.cancelado) cur.valorTotal += c.valor;
      if (c.cancelado) cur.cancelados++;
      if (c.status === "ASSINADO" || c.status === "FATURADO" || c.status === "ENTREGUE AO INCORPORADOR") {
        cur.assinados++;
      }
      porCorretorMap.set(nome, cur);
    }
    const porCorretor = Array.from(porCorretorMap.entries())
      .map(([nome, v]) => ({ nome, ...v }))
      .sort((a, b) => b.valorTotal - a.valorTotal);

    // Pipeline (físico vs digital, ordem do funil)
    const pipelineFisico = [
      { status: "GERADO", qtd: contratos.filter((c) => c.statusOriginal === "GERADO" && !c.digital).length },
      { status: "CONFERIDO", qtd: contratos.filter((c) => c.statusOriginal === "CONFERIDO" && !c.digital).length },
      { status: "ENVIADO PARA ASSINATURA", qtd: contratos.filter((c) => c.statusOriginal === "ENVIADO PARA ASSINATURA" && !c.digital).length },
      { status: "ASSINADO", qtd: contratos.filter((c) => c.statusOriginal === "ASSINADO" && !c.digital).length },
      { status: "FATURADO", qtd: contratos.filter((c) => c.statusOriginal === "FATURADO" && !c.digital).length },
      { status: "ENTREGUE AO INCORPORADOR", qtd: contratos.filter((c) => c.statusOriginal === "ENTREGUE AO INCORPORADOR" && !c.digital).length },
      { status: "CANCELADO", qtd: contratos.filter((c) => c.statusOriginal === "CANCELADO" && !c.digital).length },
    ];

    const pipelineDigital = [
      { status: "GERADO", qtd: contratos.filter((c) => c.statusOriginal === "GERADO" && c.digital).length },
      { status: "CONFERIDO", qtd: contratos.filter((c) => c.statusOriginal === "CONFERIDO" && c.digital).length },
      { status: "ENVIADO PARA ASSINATURA", qtd: contratos.filter((c) => c.statusOriginal === "ENVIADO PARA ASSINATURA" && c.digital).length },
      { status: "ASSINADO", qtd: contratos.filter((c) => c.statusOriginal === "ASSINADO" && c.digital).length },
      { status: "CANCELADO", qtd: contratos.filter((c) => c.statusOriginal === "CANCELADO" && c.digital).length },
    ];

    const result = {
      configured: true,
      total: contratos.length,
      ativos: contratos.filter((c) => !c.cancelado).length,
      cancelados: contratos.filter((c) => c.cancelado).length,
      valorTotalAtivo,
      valorTotalCancelado,
      porStatus,
      porStatusValor,
      porCorretor,
      pipelineFisico,
      pipelineDigital,
      contratos,
      _statusMap: STATUS_MAP,
      fetchedAt: new Date().toISOString(),
    };

      return result;
    });
    return NextResponse.json(payload);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("Contratos error:", errMsg);
    return NextResponse.json({ configured: true, error: errMsg }, { status: 503 });
  }
}
