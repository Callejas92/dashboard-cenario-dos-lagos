/**
 * Eggs CRM Contratos - shared lib (PropostaContrato/Exportar)
 */
const EGGS_API = "https://api.eggs.app/api/v1/PropostaContrato/Exportar";

export interface ContratoEnriquecido {
  id: number;
  loteId: string;
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

let cache: { data: ContratoEnriquecido[]; timestamp: number } | null = null;
const CACHE_TTL = 2 * 60 * 1000;

function buildLoteId(bloco: string, unidade: string): string {
  const q = parseInt(bloco) || 0;
  const l = parseInt(unidade) || 0;
  return `Q${q}-L${l}`;
}

export async function getContratosEggs(): Promise<ContratoEnriquecido[]> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) return cache.data;

  const token = process.env.CRM_EGGS_TOKEN?.trim();
  const empreendimentoId = process.env.CRM_EGGS_EMPREENDIMENTO_ID?.trim() || "10362";

  if (!token) return [];

  try {
    const params = new URLSearchParams();
    params.set("id_empreendimento", empreendimentoId);
    for (let id = 1; id <= 12; id++) {
      params.append("idsDocumentoAssinaturaStatus", String(id));
    }

    const url = `${EGGS_API}?${params.toString()}`;
    const res = await fetch(url, {
      headers: { token_autorizacao: token },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      console.error(`Eggs Contratos ${res.status}`);
      return [];
    }

    const raw: EggsContrato[] = await res.json();

    const contratos: ContratoEnriquecido[] = raw.map((c) => ({
      id: c.id_proposta_contrato,
      loteId: buildLoteId(c.bloco, c.unidade),
      bloco: c.bloco,
      unidade: c.unidade,
      valor: c.valor_unidade || 0,
      metragem: c.metragem || 0,
      digital: c.digital,
      cliente: c.responsavel || "",
      status: c.status,
      statusOriginal: c.status,
      cancelado: c.status === "CANCELADO",
      responsavelCancelou: c.responsavel_cancelou || undefined,
      corretor: {
        nome: c.corretor?.nome || "",
        cpf: c.corretor?.cpf || "",
        creci: c.corretor?.creci || "",
        telefone: c.corretor?.contato?.telefone_1 || "",
        email: c.corretor?.contato?.email || "",
      },
      imobiliaria: {
        razaoSocial: c.empresaVenda?.razao_social || "",
        nomeFantasia: c.empresaVenda?.nome_fantasia || "",
        cnpj: c.empresaVenda?.cnpj || "",
      },
    }));

    cache = { data: contratos, timestamp: Date.now() };
    return contratos;
  } catch (err) {
    console.error("getContratosEggs error:", err);
    return [];
  }
}
