/**
 * Recebido por MÊS COMERCIAL (15→14) — dinheiro que efetivamente entrou.
 *
 * Fonte: Venda/BuscarParcelasRecebidas {empresa, obra, num_ven} → lista de pagamentos
 * com Data_Rec (data) + Valor_Rec (valor). Some por mês comercial da Data_Rec.
 * (Descoberto em jun/2026 — o ConsultarResumoVenda só dá o total acumulado, sem datas.)
 *
 * Custo: 1 chamada por venda. Por isso roda em lote (concorrência 5) e cacheia 30min.
 * Exclui lotes do investidor.
 */
import { NextResponse } from "next/server";
import { authenticate, isUauConfigured, uauFetch } from "@/lib/uau-auth";
import { getInvestorLots } from "@/lib/investor-lots";
import { getMesComercial } from "@/lib/utils/mesComercial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

let cache: { data: unknown; ts: number } | null = null;
const TTL = 30 * 60 * 1000;

function extractMyTable(raw: unknown): Record<string, unknown>[] {
  const obj = Array.isArray(raw) && raw.length > 0 ? (raw[0] as { MyTable?: unknown }) : (raw as { MyTable?: unknown });
  const table = obj?.MyTable;
  return Array.isArray(table) && table.length > 1 ? (table as Record<string, unknown>[]).slice(1) : [];
}

/** A resposta de BuscarParcelasRecebidas é [{Recebidas:[schemaRow, ...dados]}]. Desempacota a lista de dados. */
function getRecebidas(raw: unknown): Record<string, unknown>[] {
  const top = (Array.isArray(raw) ? raw[0] : raw) as { Recebidas?: unknown[] } | undefined;
  const arr = top?.Recebidas;
  return Array.isArray(arr) ? (arr as Record<string, unknown>[]) : [];
}

/** Data_Rec do UAU (ISO, dd/mm/aaaa ou /Date(ms)/) → ISO yyyy-mm-dd. */
function parseDataRec(v: unknown): string {
  if (!v) return "";
  const s = String(v);
  const epoch = s.match(/\/Date\((\d+)/); // /Date(1715300000000)/
  if (epoch) { const d = new Date(Number(epoch[1])); return Number.isNaN(d.getTime()) ? "" : d.toISOString().split("T")[0]; }
  if (s.includes("T")) return s.split("T")[0];
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (br) { const y = br[3].length === 2 ? "20" + br[3] : br[3]; return `${y}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`; }
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : "";
}

function chaveMes(iso: string): string {
  const mc = getMesComercial(new Date(iso + "T12:00:00"));
  return `${mc.inicio.getFullYear()}-${String(mc.inicio.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET() {
  if (!isUauConfigured()) return NextResponse.json({ error: "UAU não configurado" }, { status: 503 });
  if (cache && Date.now() - cache.ts < TTL) return NextResponse.json(cache.data);

  try {
    const token = await authenticate();
    const INVESTOR = await getInvestorLots();
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const todayFormatted = `${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${now.getFullYear()}`;

    // num_ven de todas as unidades vendidas (exclui investidor)
    const espelho = await uauFetch(token, "Espelho/BuscaUnidadesDeAcordoComWhereDetalhado", {
      where: "WHERE Empresa_unid = 2 AND Vendido_unid = 1", retorna_venda: true, data_tabela_preco: todayFormatted,
    }, 25000);
    const vendas = extractMyTable(espelho)
      .map((r) => ({ num: Number(r.Num_Ven) || 0, id: String(r.Identificador_unid || "") }))
      .filter((v) => v.num > 0 && !INVESTOR.has(v.id));

    const porMes: Record<string, number> = {};
    let total = 0, falhas = 0, pagamentos = 0;
    const conc = 5;
    for (let i = 0; i < vendas.length; i += conc) {
      const batch = vendas.slice(i, i + conc);
      const res = await Promise.allSettled(
        batch.map((v) => uauFetch(token, "Venda/BuscarParcelasRecebidas", { empresa: 2, obra: "01VEN", num_ven: v.num }, 12000)),
      );
      for (const r of res) {
        if (r.status !== "fulfilled") { falhas++; continue; }
        const arr = getRecebidas(r.value);
        for (const p of arr) {
          // ValorConf_Rec = valor CONFIRMADO recebido (Valor_Rec vem 0). + correção/juros/multa
          // confirmados (cash total que entrou). Schema row vem string → NaN → ignorada.
          const valor = Number(p.ValorConf_Rec) + (Number(p.VlCorrecaoConf_Rec) || 0)
            + (Number(p.VlMultaConf_Rec) || 0) + (Number(p.VlJurosConf_Rec) || 0) + (Number(p.VlJurosParcConf_Rec) || 0);
          if (!Number.isFinite(valor) || valor === 0) continue;
          const iso = parseDataRec(p.Data_Rec);
          if (!iso) continue;
          const k = chaveMes(iso);
          porMes[k] = (porMes[k] || 0) + valor;
          total += valor;
          pagamentos++;
        }
      }
    }

    const data = { porMes, total, pagamentos, vendas: vendas.length, falhas, parcial: falhas > 0, geradoEm: new Date().toISOString() };
    cache = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
