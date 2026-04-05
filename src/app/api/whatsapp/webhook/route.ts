import { NextResponse } from "next/server";
import { put, list } from "@vercel/blob";

const BLOB_NAME = "whatsapp-events.json";

// ── Types ──────────────────────────────────────────────────────────────────

interface DayStats {
  sent: number;
  delivered: number;
  read: number;
  received: number;
}

interface QualityEvent {
  timestamp: string;
  phone: string;
  de: string;
  para: string;
}

interface WhatsAppStats {
  daily: Record<string, DayStats>;
  qualityHistory: QualityEvent[];
  updatedAt: string;
}

// ── Blob helpers ───────────────────────────────────────────────────────────

const DEFAULT_STATS: WhatsAppStats = {
  daily: {},
  qualityHistory: [],
  updatedAt: new Date().toISOString(),
};

async function loadStats(): Promise<WhatsAppStats> {
  try {
    const { blobs } = await list({ prefix: BLOB_NAME });
    if (blobs.length === 0) return DEFAULT_STATS;
    const res = await fetch(blobs[0].url, { cache: "no-store" });
    const data = await res.json();
    // Ensure qualityHistory exists for older stored data
    if (!data.qualityHistory) data.qualityHistory = [];
    return data;
  } catch {
    return DEFAULT_STATS;
  }
}

async function saveStats(stats: WhatsAppStats): Promise<void> {
  await put(BLOB_NAME, JSON.stringify(stats), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

function dayKey(timestampSeconds: string | number): string {
  const ts = typeof timestampSeconds === "string" ? parseInt(timestampSeconds) : timestampSeconds;
  return new Date(ts * 1000).toISOString().split("T")[0];
}

function emptyDay(): DayStats {
  return { sent: 0, delivered: 0, read: 0, received: 0 };
}

// ── GET — Meta webhook verification ───────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Token inválido" }, { status: 403 });
}

// ── POST — Receive events ──────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.object !== "whatsapp_business_account") {
      return NextResponse.json({ ok: true });
    }

    const stats = await loadStats();
    let changed = false;

    for (const entry of (body.entry || [])) {
      for (const change of (entry.changes || [])) {
        const value = change.value || {};

        // ── Mensagens enviadas/entregues/lidas/recebidas ───────────────
        if (change.field === "messages") {
          for (const status of (value.statuses || [])) {
            const key = dayKey(status.timestamp);
            if (!stats.daily[key]) stats.daily[key] = emptyDay();

            if (status.status === "sent")      { stats.daily[key].sent++;      changed = true; }
            if (status.status === "delivered") { stats.daily[key].delivered++; changed = true; }
            if (status.status === "read")      { stats.daily[key].read++;      changed = true; }
          }

          for (const msg of (value.messages || [])) {
            const key = dayKey(msg.timestamp);
            if (!stats.daily[key]) stats.daily[key] = emptyDay();
            stats.daily[key].received++;
            changed = true;
          }
        }

        // ── Qualidade do número ────────────────────────────────────────
        if (change.field === "phone_number_quality_update") {
          const prev = value.previous_quality_rating || "UNKNOWN";
          const curr = value.current_quality_rating  || "UNKNOWN";
          const phone = value.display_phone_number   || "";

          // Only store if quality actually changed
          if (prev !== curr) {
            stats.qualityHistory.push({
              timestamp: new Date().toISOString(),
              phone,
              de: prev,
              para: curr,
            });
            // Keep last 50 events only
            if (stats.qualityHistory.length > 50) {
              stats.qualityHistory = stats.qualityHistory.slice(-50);
            }
            changed = true;
          }
        }
      }
    }

    if (changed) {
      stats.updatedAt = new Date().toISOString();
      await saveStats(stats);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("WhatsApp webhook error:", error);
    return NextResponse.json({ ok: true });
  }
}
