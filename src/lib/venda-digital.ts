/**
 * Vendas DIRETAS do digital — número editável (o canal/corretor não reporta origem, então
 * só a venda que fechou direto pelo digital é conhecida; hoje = 1). Guardado no Edge Config
 * (int minúsculo; sobrevive ao Blob suspenso). Editável sem deploy via /api/venda-digital.
 */
import { edgeRead, edgeWrite } from "@/lib/edge-store";

const KEY = "venda_digital_direta";
const PADRAO = 1; // a venda direta conhecida hoje

export async function getVendaDigital(): Promise<number> {
  const v = await edgeRead<number>(KEY);
  return typeof v === "number" && v >= 0 ? Math.round(v) : PADRAO;
}

export async function setVendaDigital(n: number): Promise<boolean> {
  if (!Number.isFinite(n) || n < 0) return false;
  return edgeWrite(KEY, Math.round(n));
}
