/**
 * Relatório mensal comercial (mês comercial 15 → 14).
 *
 * GET ?mes=YYYY-MM  → relatório daquele mês comercial (default: o mês que JÁ FECHOU).
 *   - Mês fechado: serve o SNAPSHOT congelado (oficial, imutável). Se ainda não existe,
 *     calcula ao vivo e CONGELA na hora (lazy freeze).
 *   - Mês em curso: sempre ao vivo.
 *
 * Resposta: { relatorio, mesesDisponiveis: [{mesISO, labelCurto, label, fechado}] }
 */
import { NextResponse } from "next/server";
import { gerarRelatorioMensal, gerarRelatorioPeriodo, mesComercialDaChave } from "@/lib/relatorio-mensal";
import { lerSnapshot, congelarRelatorio } from "@/lib/relatorio-snapshot";
import { listarUltimosMesesComerciais, type MesComercial } from "@/lib/utils/mesComercial";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function chaveDoMes(mes: MesComercial): string {
  return `${mes.inicio.getFullYear()}-${String(mes.inicio.getMonth() + 1).padStart(2, "0")}`;
}

function hojeISO(): string {
  return new Date().toISOString().split("T")[0];
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const mesParam = searchParams.get("mes") || undefined;
    const de = searchParams.get("de") || "";
    const ate = searchParams.get("ate") || "";

    // PERÍODO LIVRE (data X a data Y) — sempre ao vivo, sem congelamento.
    if (ISO_RE.test(de) && ISO_RE.test(ate)) {
      const relatorio = await gerarRelatorioPeriodo(de, ate);
      const fechado = relatorio.periodo.fimISO < hojeISO();
      return NextResponse.json({ relatorio, fechado, custom: true, mesesDisponiveis: listarMeses() });
    }

    const mes = mesComercialDaChave(mesParam);
    const mesISO = chaveDoMes(mes);
    const fechado = mes.fimISO < hojeISO();

    // 1) Mês fechado com snapshot → serve o oficial congelado.
    if (fechado) {
      const snap = await lerSnapshot(mesISO);
      if (snap) {
        return NextResponse.json({ relatorio: snap, fechado, mesesDisponiveis: listarMeses() });
      }
    }

    // 2) Calcula ao vivo (Eggs). foraDeVenda=0 por padrão (sem depender do UAU lento).
    const relatorio = await gerarRelatorioMensal(mesISO);

    // 3) Mês fechado sem snapshot → congela agora (lazy, no Blob). Marca oficial se gravou.
    if (fechado) {
      const congelou = await congelarRelatorio(relatorio, true);
      if (congelou) relatorio.congelado = true;
    }

    return NextResponse.json({ relatorio, fechado, mesesDisponiveis: listarMeses() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("relatório mensal falhou:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function listarMeses() {
  const hoje = hojeISO();
  return listarUltimosMesesComerciais(6).map((m) => ({
    mesISO: chaveDoMes(m),
    labelCurto: m.labelCurto,
    label: m.label,
    fechado: m.fimISO < hoje,
  }));
}
