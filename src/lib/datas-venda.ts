/**
 * Override da DATA DA VENDA pela coluna "Data Venda" do Excel (decisão do Felipe, jun/2026).
 *
 * O dashboard usa Eggs.data_contrato como data da venda. Quando o Felipe preenche a
 * coluna "Data Venda" no Excel, ela passa a MANDAR (é a data que cai no mês comercial).
 * O sync (excel-bonus-sync) lê a coluna e grava aqui; getContratosEggs aplica o override
 * POR LOTE — onde não há data no Excel, mantém a do Eggs (fallback seguro).
 *
 * Mapa pequeno (loteId → ISO) no Edge Config (sobrevive a bloqueio do Blob).
 */
import { edgeRead, edgeWrite } from "@/lib/edge-store";

const EDGE_KEY = "datas_venda";
const TTL = 5 * 60 * 1000;

let cache: { map: Map<string, string>; ts: number } | null = null;

export async function getDatasVenda(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.ts < TTL) return cache.map;
  try {
    const obj = await edgeRead<Record<string, string>>(EDGE_KEY);
    const map = new Map<string, string>(
      obj && typeof obj === "object" && !Array.isArray(obj) ? Object.entries(obj) : [],
    );
    cache = { map, ts: Date.now() };
    return map;
  } catch {
    return new Map();
  }
}

/** Grava o mapa loteId→ISO (chamado pelo sync). Retorna true se gravou no Edge. */
export async function setDatasVenda(mapa: Record<string, string>): Promise<boolean> {
  const ok = await edgeWrite(EDGE_KEY, mapa);
  if (ok) cache = { map: new Map(Object.entries(mapa)), ts: Date.now() };
  return ok;
}
