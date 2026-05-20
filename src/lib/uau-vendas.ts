/**
 * UAU Vendas — shared lib (usado por /api/uau/vendas, /api/canais e cross-sell)
 *
 * Evita HTTP self-calls (que custam ~12s extra e estouram maxDuration de funções
 * downstream). Cache compartilhado em memória por (startDate, endDate).
 */
import { authenticate, isUauConfigured, uauFetch } from "@/lib/uau-auth";
import lotesData from "@/data/lotes.json";
import investorData from "@/data/investor-lots.json";

const INVESTOR_LOTS = new Set<string>(investorData.lots);

interface LoteStatic {
  id: string;
  quadra: number;
  lote: number;
  area: number;
  rua: string;
  valorTotal: number;
  valorM2: number;
  classificacao: string;
}

const lotesMap = new Map<string, LoteStatic>();
for (const l of lotesData as LoteStatic[]) {
  lotesMap.set(l.id, l);
}

interface UnitRow {
  Identificador_unid?: string;
  Vendido_unid?: number;
  Descr_status?: string;
  DataCad_unid?: string;
  DataVenda_unid?: string;
  DataVenda?: string;
  Numero_ven?: number;
  Empresa_ven?: number;
  Nome_pes?: string;
  Nome_Corretor?: string;
  NomeCorretor?: string;
  Corretor_ven?: string;
  CpfCnpj_pes?: string;
  Descr_FormaPgto?: string;
  FormaPagamento?: string;
  ValorVenda_ven?: number;
  ValorTotal_unid?: number;
  [key: string]: unknown;
}

export interface Venda {
  chaveVenda: string;
  identificadorUnidade: string;
  dataVenda: string;
  valorVenda: number;
  compradorNome: string;
  compradorCpfCnpj: string;
  corretor: string;
  formaPagamento: string;
  qtdParcelas: number;
}

export interface VendasResponse {
  vendas: Venda[];
  porDia: { data: string; quantidade: number; valorTotal: number }[];
  total: number;
  valorTotal: number;
  investidor: { quantidade: number; valorTotal: number; lotesNaLista: number };
  periodo: { inicio: string; fim: string };
  _debug?: { totalRowsFromERP: number; sampleFields: string[] };
  error?: string;
}

function extractMyTable(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw) && raw.length > 0 && raw[0]?.MyTable) {
    const table = raw[0].MyTable;
    return Array.isArray(table) && table.length > 1 ? table.slice(1) : [];
  }
  if (raw && typeof raw === "object" && "MyTable" in (raw as Record<string, unknown>)) {
    const table = (raw as Record<string, unknown>).MyTable;
    return Array.isArray(table) && table.length > 1 ? (table as Record<string, unknown>[]).slice(1) : [];
  }
  return [];
}

function parseDate(raw: string | undefined | null): string {
  if (!raw) return "";
  const s = String(raw);
  if (s.includes("T")) return s.split("T")[0];
  if (s.includes("/")) {
    const parts = s.split("/");
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    }
  }
  return s;
}

// Cache em memória compartilhado entre todos os consumidores (route + libs)
const cache = new Map<string, { data: VendasResponse; timestamp: number }>();
// Promise em vôo — evita 2 fetchs simultâneos pra mesma chave
const inflight = new Map<string, Promise<VendasResponse>>();
const CACHE_TTL = 5 * 60 * 1000;

export function getDefaultStartDate(): string {
  return "2026-04-14"; // data de lançamento
}

export function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Busca vendas do ERP UAU Senior no período [startDate, endDate].
 * Cache 5min compartilhado. Dedupe de chamadas simultâneas via inflight map.
 */
export async function getVendas(startDate?: string, endDate?: string): Promise<VendasResponse> {
  const from = startDate || getDefaultStartDate();
  const to = endDate || getToday();
  const cacheKey = `vendas-${from}-${to}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const existing = inflight.get(cacheKey);
  if (existing) return existing;

  const promise = doFetchVendas(from, to)
    .then((data) => {
      cache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    })
    .finally(() => {
      inflight.delete(cacheKey);
    });

  inflight.set(cacheKey, promise);
  return promise;
}

async function doFetchVendas(startDate: string, endDate: string): Promise<VendasResponse> {
  if (!isUauConfigured()) {
    return {
      vendas: [],
      porDia: [],
      total: 0,
      valorTotal: 0,
      investidor: { quantidade: 0, valorTotal: 0, lotesNaLista: INVESTOR_LOTS.size },
      periodo: { inicio: startDate, fim: endDate },
      error: "UAU não configurado",
    };
  }

  try {
    const token = await authenticate();

    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const yyyy = now.getFullYear();
    const todayFormatted = `${mm}-${dd}-${yyyy}`;

    const raw = await uauFetch(token, "Espelho/BuscaUnidadesDeAcordoComWhereDetalhado", {
      where: "WHERE Empresa_unid = 2 AND Vendido_unid = 1",
      retorna_venda: true,
      data_tabela_preco: todayFormatted,
    }, 20000);

    const rows = extractMyTable(raw);

    interface BaseVenda {
      id: string;
      numVen: number;
      empresa: number;
      obra: string;
      dataVenda: string;
      valorVenda: number;
    }
    const baseVendas: BaseVenda[] = [];

    for (const row of rows) {
      const r = row as UnitRow;
      const id = r.Identificador_unid || "";
      if (!id) continue;

      const dataVenda = parseDate(r.DataCad_unid as string || "");
      const lote = lotesMap.get(id);
      const erpValor = Number(r.ValorTotal) || Number(r.ValPreco_unid) || 0;
      const valor = erpValor > 0 ? erpValor : (lote?.valorTotal || 0);
      const numVen = (r.Num_Ven as number) || 0;
      const empresa = (r.Empresa_unid as unknown as number) || 2;
      const obra = (r as Record<string, unknown>).Obra_unid as string || "01VEN";

      baseVendas.push({ id, numVen, empresa, obra, dataVenda, valorVenda: valor });
    }

    // ── ENRIQUECIMENTO COM COMPRADOR (Nome + CPF/CNPJ) ──
    interface CompradorInfo { nome: string; cpf: string; email: string }
    const compradorPorLote = new Map<string, CompradorInfo>();

    try {
      const pessoasResRaw = await uauFetch(token, "Pessoas/ConsultarPessoasComVenda", {}, 15000);
      const pessoasFirst = Array.isArray(pessoasResRaw) ? pessoasResRaw[0] : pessoasResRaw;
      const pessoasList = (pessoasFirst as { Pessoas?: { Cod_pes: number; Nome_pes: string }[] })?.Pessoas || [];
      const pessoas = pessoasList.filter((p) => typeof p.Cod_pes === "number" && p.Cod_pes > 0);

      const pessoasComCpf: { codPes: number; nome: string; cpf: string; email: string }[] = [];
      for (let i = 0; i < pessoas.length; i += 5) {
        const batch = pessoas.slice(i, i + 5);
        const results = await Promise.allSettled(
          batch.map(async (p) => {
            const det = await uauFetch(token, "Pessoas/ConsultarPessoaPorChave", { codigo_pessoa: p.Cod_pes }, 8000);
            const detRows = extractMyTable(det);
            const detData = detRows[0] || {};
            return {
              codPes: p.Cod_pes,
              nome: p.Nome_pes || "",
              cpf: (detData.cpf_pes as string) || "",
              email: (detData.Email_pes as string) || "",
            };
          })
        );
        for (const r of results) {
          if (r.status === "fulfilled" && r.value.cpf) pessoasComCpf.push(r.value);
        }
      }

      for (let i = 0; i < pessoasComCpf.length; i += 5) {
        const batch = pessoasComCpf.slice(i, i + 5);
        const results = await Promise.allSettled(
          batch.map(async (p) => {
            const unitsRaw = await uauFetch(token, "Venda/ConsultarUnidadesCompradasPorCPFCNPJ", { CpfCnpj: p.cpf }, 10000);
            const units = Array.isArray(unitsRaw) ? unitsRaw : [];
            return { pessoa: p, units };
          })
        );
        for (const r of results) {
          if (r.status === "fulfilled") {
            for (const u of r.value.units) {
              const ident = (u as { IdentificadorUnid?: string }).IdentificadorUnid;
              if (ident) {
                compradorPorLote.set(ident, {
                  nome: r.value.pessoa.nome,
                  cpf: r.value.pessoa.cpf,
                  email: r.value.pessoa.email,
                });
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Erro ao enriquecer com comprador:", err);
    }

    const vendasComNumero = baseVendas.filter(v => v.numVen > 0);
    const resumoMap = new Map<number, Record<string, unknown>>();

    const concurrency = 5;
    for (let i = 0; i < vendasComNumero.length; i += concurrency) {
      const batch = vendasComNumero.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        batch.map(async (v) => {
          const res = await uauFetch(token, "Venda/ConsultarResumoVenda", {
            codigoObra: v.obra,
            codigoEmpresa: v.empresa,
            numeroVenda: v.numVen,
          }, 10000);
          return { numVen: v.numVen, raw: res };
        })
      );
      for (const r of results) {
        if (r.status === "fulfilled") {
          const resumoRows = extractMyTable(r.value.raw);
          if (resumoRows.length > 0) {
            resumoMap.set(r.value.numVen, resumoRows[0]);
          } else if (r.value.raw && typeof r.value.raw === "object") {
            resumoMap.set(r.value.numVen, r.value.raw as Record<string, unknown>);
          }
        }
      }
    }

    const vendas: Venda[] = [];
    let vendasInvestidor = 0;
    let valorInvestidor = 0;
    for (const base of baseVendas) {
      const resumo = resumoMap.get(base.numVen);
      const dataVendaResumo = resumo ? parseDate(resumo.DataVenda_ven as string || resumo.DataVenda as string || "") : "";
      const dataFinal = dataVendaResumo || base.dataVenda;

      if (dataFinal && dataFinal < startDate) continue;
      if (dataFinal && dataFinal > endDate) continue;

      const valorVenda = Number(resumo?.ValorVenda_ven) || base.valorVenda || 0;

      if (INVESTOR_LOTS.has(base.id)) {
        vendasInvestidor++;
        valorInvestidor += valorVenda;
        continue;
      }

      const compradorInfo = compradorPorLote.get(base.id);

      vendas.push({
        chaveVenda: `${base.empresa}-${base.numVen || base.id}`,
        identificadorUnidade: base.id,
        dataVenda: dataFinal,
        valorVenda,
        compradorNome: compradorInfo?.nome || (resumo?.Nome_pes as string) || "",
        compradorCpfCnpj: compradorInfo?.cpf || (resumo?.CpfCnpj_pes as string) || "",
        corretor: (resumo?.NomeCorretor as string) || (resumo?.Nome_Corretor as string) || (resumo?.Corretor_ven as string) || "",
        formaPagamento: (resumo?.Descr_FormaPgto as string) || (resumo?.FormaPagamento as string) || "",
        qtdParcelas: (resumo?.QtdParcelas as number) || 0,
      });
    }

    vendas.sort((a, b) => a.dataVenda.localeCompare(b.dataVenda));

    const dayMap = new Map<string, { quantidade: number; valorTotal: number }>();
    for (const v of vendas) {
      if (!v.dataVenda) continue;
      const day = v.dataVenda;
      if (!dayMap.has(day)) dayMap.set(day, { quantidade: 0, valorTotal: 0 });
      const d = dayMap.get(day)!;
      d.quantidade++;
      d.valorTotal += v.valorVenda;
    }

    const porDia = Array.from(dayMap.entries())
      .map(([data, vals]) => ({ data, ...vals }))
      .sort((a, b) => a.data.localeCompare(b.data));

    const valorTotal = vendas.reduce((sum, v) => sum + v.valorVenda, 0);

    return {
      vendas,
      porDia,
      total: vendas.length,
      valorTotal,
      investidor: {
        quantidade: vendasInvestidor,
        valorTotal: valorInvestidor,
        lotesNaLista: INVESTOR_LOTS.size,
      },
      periodo: { inicio: startDate, fim: endDate },
      _debug: {
        totalRowsFromERP: rows.length,
        sampleFields: rows.length > 0 ? Object.keys(rows[0]) : [],
      },
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("UAU Vendas lib error:", errMsg);
    return {
      vendas: [],
      porDia: [],
      total: 0,
      valorTotal: 0,
      investidor: { quantidade: 0, valorTotal: 0, lotesNaLista: INVESTOR_LOTS.size },
      periodo: { inicio: startDate, fim: endDate },
      error: errMsg,
    };
  }
}

export function clearVendasCache() {
  cache.clear();
}
