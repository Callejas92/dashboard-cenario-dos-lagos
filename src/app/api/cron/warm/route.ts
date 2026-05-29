/**
 * /api/cron/warm — Pré-aquecimento dos endpoints lentos.
 *
 * Problema: ERP UAU Senior tem cold start de ~40s. Quando Felipe abre o app,
 * a primeira chamada trava esperando autenticação + first query.
 *
 * Solução: cron periódico chama getVendas() e o endpoint /api/uau/financeiro
 * direto pelas libs, mantendo cache em memória da lambda quente. O TTL do
 * cache é 5min, então cron a cada 4min mantém sempre fresco em horário comercial.
 *
 * Schedule (vercel.json): every 4 minutes from 8h-22h BRT (= 11h-01h UTC).
 *
 * Auth: usa CRON_SECRET via header Authorization (mesmo padrão do /api/cron).
 */
import { NextResponse } from "next/server";
import { getVendas } from "@/lib/uau-vendas";
import { getContratosEggs } from "@/lib/eggs-contratos";

export const maxDuration = 60; // Vercel: até 60s pra aquecer

export async function GET(request: Request) {
  // Auth
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const results: Record<string, { ok: boolean; ms: number; error?: string; size?: number }> = {};

  // 1. Pré-aquece getVendas (ERP UAU) — pesado
  const t1 = Date.now();
  try {
    const vendas = await getVendas();
    results.uauVendas = {
      ok: true,
      ms: Date.now() - t1,
      size: vendas.vendas?.length ?? 0,
    };
  } catch (e) {
    results.uauVendas = {
      ok: false,
      ms: Date.now() - t1,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // 2. Pré-aquece getContratosEggs (CRM Eggs) — leve, mas mantém quente
  const t2 = Date.now();
  try {
    const contratos = await getContratosEggs();
    results.crmEggs = {
      ok: true,
      ms: Date.now() - t2,
      size: contratos.length,
    };
  } catch (e) {
    results.crmEggs = {
      ok: false,
      ms: Date.now() - t2,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // 3. Pré-aquece /api/uau/financeiro (chamada interna self-call) — opcional, comentar
  //    pra economizar invocação se quiser
  const t3 = Date.now();
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/uau/financeiro`, {
      headers: { "X-Warm": "1" },
      // Vercel runtime: self-call funciona, só não pode ter timeout maior que a função pai
    });
    results.uauFinanceiro = { ok: res.ok, ms: Date.now() - t3 };
  } catch (e) {
    results.uauFinanceiro = {
      ok: false,
      ms: Date.now() - t3,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    totalMs: Date.now() - started,
    results,
  });
}
