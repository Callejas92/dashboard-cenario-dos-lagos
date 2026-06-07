import { NextResponse } from "next/server";
import { list } from "@vercel/blob";

export const maxDuration = 30;

interface IntegracaoStatus {
  nome: string;
  grupo: string;
  configurado: boolean;
  ok: boolean | null; // null = configurado mas não testado ao vivo
  detalhe: string;
  ultimaSync: string | null; // ISO
}

const env = () => process.env;
const has = (...keys: string[]) => keys.every((k) => !!process.env[k]?.trim());

// Lê o savedAt mais recente de um cache no Blob (cache/<prefix>...json).
async function cacheSavedAt(prefix: string): Promise<string | null> {
  try {
    const { blobs } = await list({ prefix: `cache/${prefix}` });
    if (!blobs.length) return null;
    const latest = [...blobs].sort((a, b) =>
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
    )[0];
    const res = await fetch(latest.url, { cache: "no-store" });
    if (!res.ok) return null;
    const j = await res.json();
    return j?.savedAt ? new Date(j.savedAt).toISOString() : new Date(latest.uploadedAt).toISOString();
  } catch {
    return null;
  }
}

// Ping ao Graph tratando rate-limit (#4/#17/#32) como "não testado" (null), não erro.
async function pingGraph(url: string): Promise<boolean | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (r.ok) return true;
    const j = await r.json().catch(() => ({}));
    const code = j?.error?.code;
    const msg = (j?.error?.message || "").toLowerCase();
    if (code === 4 || code === 17 || code === 32 || msg.includes("request limit") || msg.includes("rate limit")) {
      return null; // rate limit ≠ token inválido
    }
    return false;
  } catch {
    return false;
  }
}

async function pingMeta(): Promise<boolean | null> {
  if (!has("META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID")) return null;
  // Endpoint REAL do app (conta de anúncios). /me não serve p/ System User token.
  return pingGraph(`https://graph.facebook.com/v21.0/act_${env().META_AD_ACCOUNT_ID}?fields=name&access_token=${env().META_ACCESS_TOKEN}`);
}

async function pingWhatsApp(): Promise<boolean | null> {
  if (!has("WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID")) return null;
  // WhatsApp usa token PRÓPRIO (WHATSAPP_TOKEN), não o META_ACCESS_TOKEN.
  return pingGraph(`https://graph.facebook.com/v21.0/${env().WHATSAPP_PHONE_ID}?fields=display_phone_number&access_token=${env().WHATSAPP_TOKEN}`);
}

async function pingGoogle(): Promise<boolean | null> {
  if (!has("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN")) return null;
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env().GOOGLE_CLIENT_ID || "",
        client_secret: env().GOOGLE_CLIENT_SECRET || "",
        refresh_token: env().GOOGLE_REFRESH_TOKEN || "",
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(8000),
    });
    const j = await r.json();
    return !!j.access_token;
  } catch {
    return false;
  }
}

async function pingUau(): Promise<boolean | null> {
  if (!has("UAU_LOGIN", "UAU_PASSWORD", "UAU_INTEGRATION_TOKEN")) return null;
  try {
    const base = env().UAU_API_URL || "https://gamma-api.seniorcloud.com.br:51928/uauAPI";
    const r = await fetch(`${base}/api/v1/Autenticador/AutenticarUsuario`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-INTEGRATION-Authorization": env().UAU_INTEGRATION_TOKEN || "" },
      body: JSON.stringify({ login: env().UAU_LOGIN, senha: env().UAU_PASSWORD }),
      signal: AbortSignal.timeout(9000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function pingOneDrive(): Promise<{ ok: boolean | null; detalhe: string; sync: string | null }> {
  if (!has("ONEDRIVE_CLIENT_ID", "ONEDRIVE_CLIENT_SECRET")) {
    return { ok: null, detalhe: "credenciais ausentes", sync: null };
  }
  try {
    const { blobs } = await list({ prefix: "onedrive-token.json" });
    if (!blobs.length) return { ok: false, detalhe: "não conectado — autorize em /api/onedrive/auth", sync: null };
    const tk = await (await fetch(blobs[0].url, { cache: "no-store" })).json();
    const r = await fetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env().ONEDRIVE_CLIENT_ID || "",
        client_secret: env().ONEDRIVE_CLIENT_SECRET || "",
        refresh_token: tk.refresh_token,
        grant_type: "refresh_token",
        scope: "Files.ReadWrite offline_access",
      }),
      signal: AbortSignal.timeout(8000),
    });
    const sync = tk.last_refreshed || tk.connected_at || null;
    return { ok: r.ok, detalhe: r.ok ? "conectado" : "token expirado — reconectar", sync };
  } catch {
    return { ok: false, detalhe: "erro ao validar token", sync: null };
  }
}

export async function GET() {
  const [meta, whatsapp, google, uau, onedrive, syncCrm, syncCanais, syncVendas] = await Promise.all([
    pingMeta(),
    pingWhatsApp(),
    pingGoogle(),
    pingUau(),
    pingOneDrive(),
    cacheSavedAt("crm-contratos"),
    cacheSavedAt("canais"),
    cacheSavedAt("uau-vendas"),
  ]);

  const integracoes: IntegracaoStatus[] = [
    {
      nome: "OneDrive (Excel marketing)", grupo: "Marketing",
      configurado: has("ONEDRIVE_CLIENT_ID", "ONEDRIVE_CLIENT_SECRET"),
      ok: onedrive.ok, detalhe: onedrive.detalhe, ultimaSync: onedrive.sync,
    },
    {
      nome: "Eggs CRM (contratos)", grupo: "Vendas",
      configurado: has("CRM_EGGS_TOKEN", "CRM_EGGS_EMPREENDIMENTO_ID"),
      ok: has("CRM_EGGS_TOKEN", "CRM_EGGS_EMPREENDIMENTO_ID") ? true : null,
      detalhe: "", ultimaSync: syncCrm,
    },
    {
      nome: "UAU ERP (estoque/financeiro)", grupo: "Vendas",
      configurado: has("UAU_LOGIN", "UAU_PASSWORD", "UAU_INTEGRATION_TOKEN"),
      ok: uau, detalhe: uau === false ? "falha na autenticação" : "", ultimaSync: syncVendas,
    },
    {
      nome: "Meta Ads", grupo: "Mídia paga",
      configurado: has("META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"),
      ok: meta, detalhe: meta === false ? "token inválido/expirado" : "", ultimaSync: syncCanais,
    },
    {
      nome: "Google Ads", grupo: "Mídia paga",
      configurado: has("GOOGLE_CLIENT_ID", "GOOGLE_ADS_CUSTOMER_ID", "GOOGLE_ADS_DEVELOPER_TOKEN"),
      ok: google, detalhe: google === false ? "OAuth falhou" : "", ultimaSync: syncCanais,
    },
    {
      nome: "Google Analytics", grupo: "Web",
      configurado: has("GOOGLE_CLIENT_ID", "GA_PROPERTY_ID"),
      ok: google, detalhe: google === false ? "OAuth falhou" : "", ultimaSync: null,
    },
    {
      nome: "WhatsApp Business", grupo: "Mensageria",
      configurado: has("WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID"),
      ok: whatsapp, detalhe: whatsapp === false ? "token WhatsApp inválido" : "", ultimaSync: null,
    },
    {
      nome: "Instagram", grupo: "Orgânico",
      configurado: has("INSTAGRAM_ACCOUNT_ID", "META_ACCESS_TOKEN"),
      ok: meta, detalhe: meta === false ? "token Meta inválido" : "", ultimaSync: null,
    },
  ];

  return NextResponse.json({ integracoes, geradoEm: new Date().toISOString() });
}
