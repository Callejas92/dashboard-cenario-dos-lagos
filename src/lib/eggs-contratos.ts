/**
 * Eggs CRM Contratos - shared lib (PropostaContrato/Exportar)
 * Exclui automaticamente contratos de lotes do investidor (Tio Ico)
 */
import investorData from "@/data/investor-lots.json";

const EGGS_API = "https://api.eggs.app/api/v1/PropostaContrato/Exportar";
const INVESTOR_LOTS = new Set<string>(investorData.lots);

export interface ContratoEnriquecido {
  id: number;
  loteId: string;
  bloco: string;
  unidade: string;
  valor: number;
  metragem: number;
  digital: boolean;
  cliente: string;        // Nome real do cliente (proponente PF ou empresa PJ)
  clienteCpfCnpj: string; // CPF (PF) ou CNPJ (PJ)
  clienteTipo: "PF" | "PJ" | "";
  clienteTelefone: string;
  clienteEmail: string;
  status: string;
  statusOriginal: string;
  cancelado: boolean;
  responsavelSistema?: string; // Usuário Eggs que cadastrou (Lucas, etc.)
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
  dataContrato?: string;
  dataEmissao?: string;
}

interface EggsProponente {
  principal?: boolean;
  nome?: string;
  cpf?: string;
  contato?: { telefone_1?: string; email?: string };
}

interface EggsEmpresaCompradora {
  razao_social?: string;
  nome_fantasia?: string;
  cnpj?: string;
  contato?: { telefone_1?: string; email?: string };
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
  data_contrato?: string;
  data_emissao?: string;
  // valor negociado real da proposta (fonte de verdade; valor_unidade é preço de tabela)
  proposta?: {
    venda?: { valor_proposta?: number };
  };
  proponentes?: EggsProponente[];
  empresaCompradora?: EggsEmpresaCompradora;
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
      throw new Error(`Eggs Contratos retornou ${res.status}`);
    }

    const raw: EggsContrato[] = await res.json();

    // Filtra contratos de lotes do investidor (Tio Ico) - eles nao existem nas metricas
    const rawFiltered = raw.filter((c) => {
      const loteId = buildLoteId(c.bloco, c.unidade);
      return !INVESTOR_LOTS.has(loteId);
    });

    const contratos: ContratoEnriquecido[] = rawFiltered.map((c) => {
      // Extrai cliente real: empresaCompradora (PJ) tem prioridade, senão proponente principal (PF)
      let cliente = "";
      let clienteCpfCnpj = "";
      let clienteTipo: "PF" | "PJ" | "" = "";
      let clienteTelefone = "";
      let clienteEmail = "";

      // PJ tem prioridade SE empresaCompradora tem dados reais
      const empresaValida = c.empresaCompradora && (
        c.empresaCompradora.razao_social ||
        c.empresaCompradora.nome_fantasia ||
        c.empresaCompradora.cnpj
      );

      if (empresaValida && c.empresaCompradora) {
        cliente = c.empresaCompradora.razao_social || c.empresaCompradora.nome_fantasia || "";
        clienteCpfCnpj = c.empresaCompradora.cnpj || "";
        clienteTipo = "PJ";
        clienteTelefone = c.empresaCompradora.contato?.telefone_1 || "";
        clienteEmail = c.empresaCompradora.contato?.email || "";
      } else if (c.proponentes && c.proponentes.length > 0) {
        const principal = c.proponentes.find((p) => p.principal) || c.proponentes[0];
        if (principal.nome || principal.cpf) {
          cliente = principal.nome || "";
          clienteCpfCnpj = principal.cpf || "";
          clienteTipo = "PF";
          clienteTelefone = principal.contato?.telefone_1 || "";
          clienteEmail = principal.contato?.email || "";
        }
      }

      return {
        id: c.id_proposta_contrato,
        loteId: buildLoteId(c.bloco, c.unidade),
        bloco: c.bloco,
        unidade: c.unidade,
        valor: c.proposta?.venda?.valor_proposta || c.valor_unidade || 0,
        metragem: c.metragem || 0,
        digital: c.digital,
        cliente,
        clienteCpfCnpj,
        clienteTipo,
        clienteTelefone,
        clienteEmail,
        status: c.status,
        statusOriginal: c.status,
        cancelado: c.status === "CANCELADO",
        responsavelSistema: c.responsavel || undefined, // usuário Eggs que cadastrou
        dataContrato: c.data_contrato?.split("T")[0],
        dataEmissao: c.data_emissao?.split("T")[0],
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
      };
    });

    cache = { data: contratos, timestamp: Date.now() };
    return contratos;
  } catch (err) {
    console.error("getContratosEggs error:", err);
    throw err;
  }
}
