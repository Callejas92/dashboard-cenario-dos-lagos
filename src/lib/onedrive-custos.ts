/**
 * Compat shim — projeta os dados ricos de `onedrive-marketing` no shape legacy
 * usado por /api/canais e /api/custos-offline.
 *
 * Mantém os tipos antigos `CustoMensal`, `LancamentoOffline`, `ParsedCustos`
 * para não quebrar consumidores existentes.
 */
import {
  getMarketingData,
  clearMarketingCache,
  listOnedriveFiles as listFilesImpl,
} from "@/lib/onedrive-marketing";

export interface CustoMensal {
  mes: string;
  outdoor: number;
  radio: number;
  jornal: number;
  evento: number;
  outros: number;
  total_offline: number;
}

export interface LancamentoOffline {
  canal: string;      // canal do dashboard (Outdoor/Rádio/Jornal/Evento/Outros/Site)
  valor: number;
  mes: string;
  data_pgto: string;
  inicio_veic: string; // não existe no novo Excel → vazio
  fim_veic: string;
  descricao: string;
}

export interface ParsedCustos {
  custosMensais: CustoMensal[];
  lancamentos: LancamentoOffline[];
  total_offline: number;
  sheets: string[];
}

const CANAIS_OFFLINE = new Set(["Outdoor", "Rádio", "Jornal", "Evento", "Outros", "Site"]);

export async function getCustosOffline(): Promise<ParsedCustos> {
  const mkt = await getMarketingData();

  // Filtra gastos cujo canal mapeia para algum canal do dashboard (exclui Meta/Google Ads)
  const lancamentos: LancamentoOffline[] = mkt.gastos
    .filter((g) => g.canalDashboard && CANAIS_OFFLINE.has(g.canalDashboard))
    .map((g) => ({
      canal: g.canalDashboard as string,
      valor: g.valor,
      mes: g.mes,
      data_pgto: g.data,
      inicio_veic: "",
      fim_veic: "",
      descricao: g.descricao || g.centroCusto,
    }));

  // Agrega custos mensais por canal
  const porMes = new Map<string, CustoMensal>();
  for (const l of lancamentos) {
    if (!l.mes) continue;
    let row = porMes.get(l.mes);
    if (!row) {
      row = { mes: l.mes, outdoor: 0, radio: 0, jornal: 0, evento: 0, outros: 0, total_offline: 0 };
      porMes.set(l.mes, row);
    }
    switch (l.canal) {
      case "Outdoor": row.outdoor += l.valor; break;
      case "Rádio": row.radio += l.valor; break;
      case "Jornal": row.jornal += l.valor; break;
      case "Evento": row.evento += l.valor; break;
      default: row.outros += l.valor; break;
    }
    row.total_offline += l.valor;
  }

  return {
    custosMensais: Array.from(porMes.values()),
    lancamentos,
    total_offline: lancamentos.reduce((s, l) => s + l.valor, 0),
    sheets: mkt.sheets,
  };
}

export function clearCustosCache() {
  clearMarketingCache();
}

export const listOnedriveFiles = listFilesImpl;
