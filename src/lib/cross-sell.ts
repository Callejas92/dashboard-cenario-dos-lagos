/**
 * Cross-sell: matching CRM Lead × ERP Venda (compartilhado)
 */
import { getContratosEggs } from "@/lib/eggs-contratos";
import { getVendas } from "@/lib/uau-vendas";

const CRM_API = process.env.CRM_API_URL || "http://leadsc2s.eggs.com.br/api/webhook/leads";

export interface CRMLead {
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

export interface ERPVenda {
  chaveVenda: string;
  identificadorUnidade: string;
  dataVenda: string;
  valorVenda: number;
  compradorNome: string;
  compradorCpfCnpj: string;
  corretor: string;
  formaPagamento: string;
}

export type Confianca = "alta" | "media" | "baixa" | "sem_match";
export type Metodo = "cpf" | "telefone" | "nome" | "corretor" | "nenhum";

export interface MatchResult {
  venda: ERPVenda;
  lead: CRMLead | null;
  canal: string;
  confianca: Confianca;
  metodo: Metodo;
  diasEntreLeadVenda?: number;
}

export interface CrossSellResult {
  totalLeads: number;
  totalVendas: number;
  matches: MatchResult[];
  porCanal: Record<string, {
    vendas: number;
    receita: number;
    tempoMedioConversao: number;
    ticketMedio: number;
    confiancaMedia: { alta: number; media: number; baixa: number; sem_match: number };
  }>;
  stats: {
    totalMatches: number;
    semMatch: number;
    taxaMatching: number;
    porConfianca: { alta: number; media: number; baixa: number; sem_match: number };
  };
}

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

function normalizeId(s: string): string { return (s || "").replace(/\D/g, ""); }
function normalizeTel(s: string): string {
  const digits = (s || "").replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length > 11) return digits.slice(2);
  return digits;
}
function normalizeName(s: string): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
}
function fuzzyMatch(a: string, b: string): number {
  const s1 = normalizeName(a), s2 = normalizeName(b);
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
  return 1 - dp[m][n] / Math.max(m, n);
}
function diasEntre(d1: string, d2: string): number {
  if (!d1 || !d2) return Infinity;
  return Math.abs(new Date(d2.split("T")[0]).getTime() - new Date(d1.split("T")[0]).getTime()) / 86400000;
}
function canalDoLead(l: CRMLead): string { return CRM_SOURCE_MAP[l.fonte] || l.fonte || "Outros"; }

async function fetchAllLeads(): Promise<CRMLead[]> {
  const key = process.env.CRM_API_KEY?.trim();
  if (!key) return [];
  const all: CRMLead[] = [];
  let offset = 0;
  while (true) {
    const res = await fetch(`${CRM_API}?offset=${offset}&pageSize=200`, {
      headers: { "x-api-key": key },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) break;
    const data = await res.json();
    const leads = data.data || data.leads || [];
    if (leads.length === 0) break;
    for (const r of leads) {
      const a = r.attributes || {};
      all.push({
        id: r.id || "",
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
    if (leads.length < 200) break;
    offset += 200;
  }
  return all;
}

async function fetchVendas(from: string, to: string): Promise<ERPVenda[]> {
  const [contratos, uauData] = await Promise.all([
    getContratosEggs().catch(() => []),
    getVendas(from, to).catch(() => null),
  ]);

  const map: Map<string, ERPVenda> = new Map();
  for (const c of contratos) {
    if (c.cancelado) continue;
    if (!["ASSINADO", "FATURADO", "ENTREGUE AO INCORPORADOR"].includes(c.status)) continue;
    map.set(c.loteId, {
      chaveVenda: `eggs-${c.id}`,
      identificadorUnidade: c.loteId,
      dataVenda: c.dataContrato || "",
      valorVenda: c.valor || 0,
      compradorNome: c.cliente || "",
      compradorCpfCnpj: c.clienteCpfCnpj || "",
      corretor: c.corretor?.nome || "",
      formaPagamento: "",
    });
  }
  if (uauData) {
    for (const v of (uauData.vendas || [])) {
      const e = map.get(v.identificadorUnidade);
      if (e) {
        e.dataVenda = v.dataVenda || e.dataVenda;
        e.compradorCpfCnpj = v.compradorCpfCnpj || e.compradorCpfCnpj;
        e.formaPagamento = v.formaPagamento || e.formaPagamento;
        if (v.valorVenda > 0) e.valorVenda = v.valorVenda;
      } else {
        map.set(v.identificadorUnidade, v);
      }
    }
  }

  const result: ERPVenda[] = [];
  for (const v of map.values()) {
    if (v.dataVenda) {
      if (v.dataVenda >= from && v.dataVenda <= to) result.push(v);
    } else {
      result.push(v);
    }
  }
  return result;
}

function matchLeadVenda(venda: ERPVenda, leads: CRMLead[]): MatchResult {
  // 1. CPF/telefone (alta confiança)
  if (venda.compradorCpfCnpj) {
    const cpf = normalizeId(venda.compradorCpfCnpj);
    if (cpf.length >= 11) {
      const tel = normalizeTel(venda.compradorCpfCnpj);
      const lead = leads.find((l) => normalizeTel(l.telefone) === tel && tel.length >= 10);
      if (lead) return { venda, lead, canal: canalDoLead(lead), confianca: "alta", metodo: "cpf", diasEntreLeadVenda: diasEntre(lead.criadoEm, venda.dataVenda) };
    }
  }
  // 2. Nome fuzzy
  if (venda.compradorNome) {
    let best: CRMLead | null = null, score = 0.8;
    for (const l of leads) {
      if (!l.nome) continue;
      const s = fuzzyMatch(l.nome, venda.compradorNome);
      if (s > score) { score = s; best = l; }
    }
    if (best) return { venda, lead: best, canal: canalDoLead(best), confianca: "media", metodo: "nome", diasEntreLeadVenda: diasEntre(best.criadoEm, venda.dataVenda) };
  }
  // 3. Corretor + data
  if (venda.corretor) {
    const cn = normalizeName(venda.corretor);
    const candidatos = leads.filter((l) => l.corretor && normalizeName(l.corretor) === cn && diasEntre(l.criadoEm, venda.dataVenda) < 90);
    if (candidatos.length === 1) {
      const l = candidatos[0];
      return { venda, lead: l, canal: canalDoLead(l), confianca: "baixa", metodo: "corretor", diasEntreLeadVenda: diasEntre(l.criadoEm, venda.dataVenda) };
    }
  }
  // Sem match → Contato Corretor (carteira própria)
  return { venda, lead: null, canal: "Contato Corretor", confianca: "sem_match", metodo: "nenhum" };
}

let cache: { data: CrossSellResult; timestamp: number; key: string } | null = null;
const CACHE_TTL = 2 * 60 * 1000;

export async function getCrossSell(from: string, to: string): Promise<CrossSellResult> {
  const key = `${from}|${to}`;
  if (cache && cache.key === key && Date.now() - cache.timestamp < CACHE_TTL) return cache.data;

  const [leads, vendas] = await Promise.all([fetchAllLeads(), fetchVendas(from, to)]);
  const matches = vendas.map((v) => matchLeadVenda(v, leads));

  const porCanal: CrossSellResult["porCanal"] = {};
  for (const m of matches) {
    const c = m.canal;
    if (!porCanal[c]) {
      porCanal[c] = { vendas: 0, receita: 0, tempoMedioConversao: 0, ticketMedio: 0, confiancaMedia: { alta: 0, media: 0, baixa: 0, sem_match: 0 } };
    }
    porCanal[c].vendas++;
    porCanal[c].receita += m.venda.valorVenda;
    porCanal[c].confiancaMedia[m.confianca]++;
    if (m.diasEntreLeadVenda !== undefined && m.diasEntreLeadVenda < 365) {
      porCanal[c].tempoMedioConversao += m.diasEntreLeadVenda;
    }
  }
  for (const c of Object.keys(porCanal)) {
    const x = porCanal[c];
    x.ticketMedio = x.vendas > 0 ? x.receita / x.vendas : 0;
    const v = x.confiancaMedia.alta + x.confiancaMedia.media + x.confiancaMedia.baixa;
    x.tempoMedioConversao = v > 0 ? x.tempoMedioConversao / v : 0;
  }

  const totalMatches = matches.filter((m) => m.confianca !== "sem_match").length;
  const result: CrossSellResult = {
    totalLeads: leads.length,
    totalVendas: vendas.length,
    matches,
    porCanal,
    stats: {
      totalMatches,
      semMatch: matches.length - totalMatches,
      taxaMatching: matches.length > 0 ? (totalMatches / matches.length) * 100 : 0,
      porConfianca: {
        alta: matches.filter((m) => m.confianca === "alta").length,
        media: matches.filter((m) => m.confianca === "media").length,
        baixa: matches.filter((m) => m.confianca === "baixa").length,
        sem_match: matches.length - totalMatches,
      },
    },
  };

  cache = { data: result, timestamp: Date.now(), key };
  return result;
}
