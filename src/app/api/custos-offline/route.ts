import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

export const maxDuration = 30;

// Cache in-memory (5 min TTL)
let cache: { data: unknown; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Convert OneDrive sharing URL to direct download URL.
 * Technique: base64url-encode the sharing URL, prefix with "u!", call shares API.
 */
function convertOneDriveLink(shareUrl: string): string {
  const base64 = Buffer.from(shareUrl)
    .toString("base64")
    .replace(/\//g, "_")
    .replace(/\+/g, "-")
    .replace(/=+$/, "");
  return `https://api.onedrive.com/v1.0/shares/u!${base64}/root/content`;
}

interface CustoMensal {
  mes: string;
  outdoor: number;
  radio: number;
  jornal: number;
  evento: number;
  outros: number;
  total_offline: number;
}

interface TimelineEntry {
  data: string;
  canal: string;
  valor: number;
  descricao: string;
}

function parseExcelDate(val: unknown): string {
  if (!val) return "";
  // If it's a number, it's an Excel serial date
  if (typeof val === "number") {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) {
      return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    }
  }
  const s = String(val);
  // Already ISO-ish: 2026-04-20
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.split("T")[0];
  // BR format: 20/04/2026
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
    const [dd, mm, yyyy] = s.split("/");
    return `${yyyy}-${mm}-${dd}`;
  }
  return s;
}

const CANAIS_OFFLINE = ["Outdoor", "Radio", "Rádio", "Jornal", "Evento", "Outros"];

function normalizeCanal(canal: string): string {
  const c = canal.trim();
  if (c.toLowerCase() === "radio" || c === "Rádio") return "Rádio";
  return c;
}

export async function GET() {
  // Return from cache if fresh
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  const shareUrl = process.env.ONEDRIVE_SHARE_URL;
  if (!shareUrl) {
    return NextResponse.json(
      { error: "ONEDRIVE_SHARE_URL não configurado", custosMensais: [], timeline: [], total_offline: 0 },
      { status: 200 } // 200 so dashboard still works
    );
  }

  try {
    const downloadUrl = convertOneDriveLink(shareUrl);
    const response = await fetch(downloadUrl, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`OneDrive fetch falhou: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });

    // ── 1. Dados mensais agregados (aba _DASHBOARD, A5:J23) ──
    const custosMensais: CustoMensal[] = [];
    const sheetDash = workbook.Sheets["_DASHBOARD"];
    if (sheetDash) {
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheetDash, {
        range: "A5:J23",
        header: ["mes", "meta_ads", "google_ads", "outdoor", "radio", "site", "jornal", "evento", "outros", "total"],
      });
      for (const r of raw) {
        const mes = String(r.mes || "").trim();
        if (!mes || mes === "Mes" || mes === "Mês") continue;

        const outdoor = Number(r.outdoor) || 0;
        const radio = Number(r.radio) || 0;
        const jornal = Number(r.jornal) || 0;
        const evento = Number(r.evento) || 0;
        const outros = Number(r.outros) || 0;

        custosMensais.push({
          mes,
          outdoor,
          radio,
          jornal,
          evento,
          outros,
          total_offline: outdoor + radio + jornal + evento + outros,
        });
      }
    }

    // ── 2. Dados individuais com data (aba GASTOS, a partir da linha 26) ──
    const timeline: TimelineEntry[] = [];
    const sheetGastos = workbook.Sheets["GASTOS"];
    if (sheetGastos) {
      const gastos = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheetGastos, {
        range: "B25:K500",
        header: ["mes", "canal", "descricao", "fornecedor", "data_pgto", "valor", "forma_pgto", "obs", "status", "recorrente"],
      });
      for (const r of gastos) {
        const canal = String(r.canal || "").trim();
        if (!canal) continue;
        // Only include offline channels
        if (!CANAIS_OFFLINE.some((c) => c.toLowerCase() === canal.toLowerCase())) continue;
        const data = parseExcelDate(r.data_pgto);
        const valor = Number(r.valor) || 0;
        if (!data || valor === 0) continue;

        timeline.push({
          data,
          canal: normalizeCanal(canal),
          valor,
          descricao: String(r.descricao || ""),
        });
      }
      // Sort by date
      timeline.sort((a, b) => a.data.localeCompare(b.data));
    }

    const total_offline = custosMensais.reduce((s, r) => s + r.total_offline, 0);

    const result = {
      custosMensais,
      timeline,
      total_offline,
      updated_at: new Date().toISOString(),
      source: "onedrive",
    };

    cache = { data: result, timestamp: Date.now() };
    return NextResponse.json(result);
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Custos offline error:", errMsg);
    return NextResponse.json(
      { error: errMsg, custosMensais: [], timeline: [], total_offline: 0 },
      { status: 200 } // graceful degradation
    );
  }
}
