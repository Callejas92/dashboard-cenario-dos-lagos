/**
 * Override da DATA DA VENDA pela coluna "Data Venda" do Excel (decisão do Felipe, jun/2026).
 *
 * O dashboard usa Eggs.data_contrato como data da venda. Quando o Felipe preenche a
 * coluna "Data Venda" no Excel, ela passa a MANDAR (é a data que cai no mês comercial).
 * O sync (excel-bonus-sync) lê a coluna e grava aqui; getContratosEggs aplica o override
 * POR LOTE — onde não há data no Excel, mantém a do Eggs (fallback seguro).
 *
 * Storage: Blob-primeiro com auto-migração (Edge enquanto o Blob está bloqueado). Cresce
 * com as vendas, então o lar definitivo é o Blob — ver lib/durable-store.ts.
 */
import { loadDurable, saveDurable } from "@/lib/durable-store";

const EDGE_KEY = "datas_venda";
const BLOB_PATH = "config/datas-venda.json";
const TTL = 5 * 60 * 1000;

let cache: { map: Map<string, string>; ts: number } | null = null;

export async function getDatasVenda(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.ts < TTL) return cache.map;
  const obj = await loadDurable<Record<string, string>>(BLOB_PATH, EDGE_KEY);
  const map = new Map<string, string>(
    obj && typeof obj === "object" && !Array.isArray(obj) ? Object.entries(obj) : [],
  );
  cache = { map, ts: Date.now() };
  return map;
}

/** Grava o mapa loteId→ISO (chamado pelo sync). Blob-primeiro; migra sozinho quando o Blob volta. */
export async function setDatasVenda(mapa: Record<string, string>): Promise<boolean> {
  const r = await saveDurable(BLOB_PATH, EDGE_KEY, mapa);
  if (r !== "none") cache = { map: new Map(Object.entries(mapa)), ts: Date.now() };
  return r !== "none";
}
