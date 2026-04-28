/**
 * Cruzamento CRM Lead × ERP Venda
 *
 * Match cada venda do ERP com lead do CRM usando 3 níveis de confiança:
 * - ALTA: CPF/CNPJ ou telefone exato
 * - MÉDIA: nome fuzzy match > 0.8
 * - BAIXA: corretor + data próxima (< 90 dias)
 *
 * Atribui o canal correto às vendas (lead.fonte → venda.canal),
 * permitindo CAC e ROI por canal real.
 */
import { NextRequest, NextResponse } from "next/server";
import { getContratosEggs } from "@/lib/eggs-contratos";

export const maxDuration = 90;

const CRM_API = process.env.CRM_API_URL || "http://leadsc2s.eggs.com.br/api/webhook/leads";

interface CRMLead {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  corretor: string;
  fonte: string;
  canal: string;
  status: string;
  convertido: boolean;
  criadoEm: string;
}

interface ERPVenda {
  chaveVenda: string;
  identificadorUnidade: string;
  dataVenda: string;
  valorVenda: number;
  compradorNome: string;
  compradorCpfCnpj: string;
  corretor: string;
  formaPagamento: string;
}

type Confianca = "alta" | "media" | "baixa" | "sem_match";
type Metodo = "cpf" | "telefone" | "nome" | "corretor" | "nenhum";

interface MatchResult {
  venda: ERPVenda;
  lead: CRMLead | null;
  canal: string;            // canal atribuído (do lead.fonte ou "Sem atribuição")
  confianca: Confianca;
  metodo: Metodo;
  diasEntreLeadVenda?: number;
}

let cache: { data: unknown; timestamp: number; key: string } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

// Normaliza CPF/CNPJ removendo caracteres não-numéricos
function normalizeId(s: string): string {
  return (s || "").replace(/\D/g, "");
}

// Normaliza telefone (apenas dígitos, ignora prefixo 55 do BR e DDI)
function normalizeTel(s: string): string {
  const digits = (s || "").replace(/\D/g, "");
  // Remove +55 prefix
  if (digits.startsWith("55") && digits.length > 11) return digits.slice(2);
  return digits;
}

// Normaliza nome: lowercase, remove acentos, remove espaços extras
function normalizeName(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// Distância de Levenshtein normalizada (0-1, 1 = igual)
function fuzzyMatch(a: string, b: string): number {
  const s1 = normalizeName(a);
  const s2 = normalizeName(b);
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;

  const m = s1.length, n = s2.length;
  if (Math.abs(m - n) > Math.max(m, n) * 0.5) return 0;

  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  const dist = dp[m][n];
  return 1 - dist / Math.max(m, n);
}

function diasEntre(data1: string, data2: string): number {
  if (!data1 || !data2) return Infinity;
  const t1 = new Date(data1.split("T")[0]).getTime();
  const t2 = new Date(data2.split("T")[0]).getTime();
  return Math.abs(t2 - t1) / 86400000;
}

async function fetchAllLeads(): Promise<CRMLead[]> {
  const key = process.env.CRM_API_KEY?.trim();
  if (!key) return [];

  const allLeads: CRMLead[] = [];
  let offset = 0;
  const pageSize = 200;
  while (true) {
    const res = await fetch(`${CRM_API}?offset=${offset}&pageSize=${pageSize}`, {
      headers: { "x-api-key": key },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) break;
    const data = await res.json();
    const leads = data.data || data.leads || (Array.isArray(data) ? data : []);
    if (leads.length === 0) break;

    for (const raw of leads) {
      const a = raw.attributes || {};
      allLeads.push({
        id: raw.id || "",
        nome: a.customer?.name || "",
        email: a.customer?.email || "",
        telefone: a.customer?.phone || "",
        corretor: a.seller?.name || "",
        fonte: a.lead_source?.name || "",
        canal: a.channel?.name || "",
        status: a.lead_status?.name || "",
        convertido: a.done_details?.done || false,
        criadoEm: a.created_at || "",
      });
    }

    if (leads.length < pageSize) break;
    offset += pageSize;
  }
  return allLeads;
}

async function fetchAllVendas(from: string, to: string): Promise<ERPVenda[]> {
  // Busca contratos do Eggs (fonte primária - já tem cliente, via lib direto)
  // E também vendas do UAU (fonte financeira - quando disponível)
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  const [contratos, uauRes] = await Promise.all([
    getContratosEggs().catch(() => []),
    fetch(`${baseUrl}/api/uau/vendas?startDate=${from}&endDate=${to}`, { signal: AbortSignal.timeout(75000) }).catch(() => null),
  ]);

  // 1. Contratos do Eggs (cliente já preenchido)
  const contratosFromEggs: Map<string, ERPVenda> = new Map();
  for (const c of contratos) {
    if (c.cancelado) continue;
    const STATUS_VALIDOS = ["ASSINADO", "FATURADO", "ENTREGUE AO INCORPORADOR"];
    if (!STATUS_VALIDOS.includes(c.status)) continue;

    contratosFromEggs.set(c.loteId, {
      chaveVenda: `eggs-${c.id}`,
      identificadorUnidade: c.loteId,
      dataVenda: "",
      valorVenda: c.valor || 0,
      compradorNome: c.cliente || "",
      compradorCpfCnpj: "",
      corretor: c.corretor?.nome || "",
      formaPagamento: "",
    });
  }

  // 2. Enriquece com UAU (data, CPF, forma pagamento)
  if (uauRes && uauRes.ok) {
    try {
      const uauData = await uauRes.json();
      for (const venda of (uauData.vendas || [])) {
        const eggsContrato = contratosFromEggs.get(venda.identificadorUnidade);
        if (eggsContrato) {
          eggsContrato.dataVenda = venda.dataVenda || eggsContrato.dataVenda;
          eggsContrato.compradorCpfCnpj = venda.compradorCpfCnpj || eggsContrato.compradorCpfCnpj;
          eggsContrato.formaPagamento = venda.formaPagamento || eggsContrato.formaPagamento;
          if (venda.valorVenda > 0) eggsContrato.valorVenda = venda.valorVenda;
        } else {
          contratosFromEggs.set(venda.identificadorUnidade, venda);
        }
      }
    } catch { /* ignore */ }
  }

  // Filtra por período se data_pgto disponível
  const result: ERPVenda[] = [];
  for (const v of contratosFromEggs.values()) {
    if (v.dataVenda) {
      if (v.dataVenda >= from && v.dataVenda <= to) result.push(v);
    } else {
      result.push(v); // sem data = recente, inclui
    }
  }

  return result;
}

// Mapeia fonte do CRM para nome do canal usado no dashboard
const CRM_SOURCE_MAP: Record<string, string> = {
  "Meta Ads": "Meta Ads",
  "Facebook": "Meta Ads",
  "Instagram": "Meta Ads",
  "Facebook Ads": "Meta Ads",
  "Google Ads": "Google Ads",
  "Google": "Google Ads",
  "Site": "Site",
  "Website": "Site",
  "Outdoor": "Outdoor",
  "Radio": "Rádio",
  "Rádio": "Rádio",
  "Jornal": "Jornal",
  "Indicação": "Indicação",
  "Indicacao": "Indicação",
  "Corretor": "Contato Corretor",
  "Contato Corretor": "Contato Corretor",
  "WhatsApp": "WhatsApp",
  "Whatsapp": "WhatsApp",
  "WPP": "WhatsApp",
};

function canalDoLead(lead: CRMLead): string {
  return CRM_SOURCE_MAP[lead.fonte] || lead.fonte || "Outros";
}

// Algoritmo de matching
function matchLeadVenda(venda: ERPVenda, leads: CRMLead[]): MatchResult {
  // 1. CPF/CNPJ exato (alta confiança)
  if (venda.compradorCpfCnpj) {
    const cpfNormalizado = normalizeId(venda.compradorCpfCnpj);
    if (cpfNormalizado.length >= 11) {
      // Busca por telefone que contenha o CPF (improvável mas possível) ou usar email
      // CRM Eggs não tem CPF direto, então comparamos via telefone como heurística:
      const telVenda = normalizeTel(venda.compradorCpfCnpj);
      const lead = leads.find((l) => normalizeTel(l.telefone) === telVenda && telVenda.length >= 10);
      if (lead) {
        return {
          venda, lead,
          canal: canalDoLead(lead),
          confianca: "alta", metodo: "cpf",
          diasEntreLeadVenda: diasEntre(lead.criadoEm, venda.dataVenda),
        };
      }
    }
  }

  // 2. Nome fuzzy match (média confiança)
  if (venda.compradorNome) {
    let bestLead: CRMLead | null = null;
    let bestScore = 0.8; // threshold mínimo
    for (const lead of leads) {
      if (!lead.nome) continue;
      const score = fuzzyMatch(lead.nome, venda.compradorNome);
      if (score > bestScore) {
        bestScore = score;
        bestLead = lead;
      }
    }
    if (bestLead) {
      return {
        venda, lead: bestLead,
        canal: canalDoLead(bestLead),
        confianca: "media", metodo: "nome",
        diasEntreLeadVenda: diasEntre(bestLead.criadoEm, venda.dataVenda),
      };
    }
  }

  // 3. Corretor + data próxima (baixa confiança)
  if (venda.corretor) {
    const corretorVendaNorm = normalizeName(venda.corretor);
    const candidatos = leads.filter((l) => {
      if (!l.corretor) return false;
      if (normalizeName(l.corretor) !== corretorVendaNorm) return false;
      return diasEntre(l.criadoEm, venda.dataVenda) < 90;
    });
    if (candidatos.length === 1) {
      const lead = candidatos[0];
      return {
        venda, lead,
        canal: canalDoLead(lead),
        confianca: "baixa", metodo: "corretor",
        diasEntreLeadVenda: diasEntre(lead.criadoEm, venda.dataVenda),
      };
    }
  }

  // Sem match em lead → assume venda direta do corretor (carteira própria)
  return { venda, lead: null, canal: "Contato Corretor", confianca: "sem_match", metodo: "nenhum" };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") || "2026-04-14";
  const to = searchParams.get("to") || new Date().toISOString().split("T")[0];

  const cacheKey = `${from}|${to}`;
  if (cache && cache.key === cacheKey && Date.now() - cache.timestamp < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  try {
    const [leads, vendas] = await Promise.all([
      fetchAllLeads(),
      fetchAllVendas(from, to),
    ]);

    const matches: MatchResult[] = vendas.map((v) => matchLeadVenda(v, leads));

    // Agrupar por canal
    const porCanal: Record<string, {
      vendas: number;
      receita: number;
      tempoMedioConversao: number; // dias médios entre lead e venda
      ticketMedio: number;
      confiancaMedia: { alta: number; media: number; baixa: number; sem_match: number };
    }> = {};

    for (const m of matches) {
      const canal = m.canal;
      if (!porCanal[canal]) {
        porCanal[canal] = {
          vendas: 0, receita: 0, tempoMedioConversao: 0, ticketMedio: 0,
          confiancaMedia: { alta: 0, media: 0, baixa: 0, sem_match: 0 },
        };
      }
      porCanal[canal].vendas++;
      porCanal[canal].receita += m.venda.valorVenda;
      porCanal[canal].confiancaMedia[m.confianca]++;
      if (m.diasEntreLeadVenda !== undefined && m.diasEntreLeadVenda < 365) {
        porCanal[canal].tempoMedioConversao += m.diasEntreLeadVenda;
      }
    }

    // Calcular médias
    for (const canal of Object.keys(porCanal)) {
      const c = porCanal[canal];
      c.ticketMedio = c.vendas > 0 ? c.receita / c.vendas : 0;
      const validMatches = c.confiancaMedia.alta + c.confiancaMedia.media + c.confiancaMedia.baixa;
      c.tempoMedioConversao = validMatches > 0 ? c.tempoMedioConversao / validMatches : 0;
    }

    // Estatísticas globais de matching
    const totalMatches = matches.filter((m) => m.confianca !== "sem_match").length;
    const taxaMatching = matches.length > 0 ? (totalMatches / matches.length) * 100 : 0;

    const result = {
      from,
      to,
      totalLeads: leads.length,
      totalVendas: vendas.length,
      matches,
      porCanal,
      stats: {
        totalMatches,
        semMatch: matches.length - totalMatches,
        taxaMatching,
        porConfianca: {
          alta: matches.filter((m) => m.confianca === "alta").length,
          media: matches.filter((m) => m.confianca === "media").length,
          baixa: matches.filter((m) => m.confianca === "baixa").length,
          sem_match: matches.length - totalMatches,
        },
      },
      fetchedAt: new Date().toISOString(),
    };

    cache = { data: result, timestamp: Date.now(), key: cacheKey };
    return NextResponse.json(result);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("Cross-sell error:", errMsg);
    return NextResponse.json({
      error: errMsg,
      matches: [],
      porCanal: {},
      stats: { totalMatches: 0, semMatch: 0, taxaMatching: 0 },
    }, { status: 200 });
  }
}
