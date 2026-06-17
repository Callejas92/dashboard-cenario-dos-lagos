/**
 * Token OAuth do OneDrive — armazenamento CRIPTOGRAFADO no Vercel Blob.
 *
 * Por quê: o Blob da Vercel só tem acesso "public" e, com addRandomSuffix:false,
 * a URL é determinística — o refresh_token ficava tecnicamente exposto a quem
 * deduzisse a URL do store. Agora o conteúdo vai cifrado (AES-256-GCM) com chave
 * derivada do ONEDRIVE_CLIENT_SECRET (que já é obrigatório pro refresh — sem ele
 * o token não serve pra nada de qualquer forma).
 *
 * Migração transparente: token legado em texto puro é aceito na leitura e
 * re-gravado cifrado na hora.
 */
import crypto from "crypto";
import { list, put } from "@vercel/blob";
import { edgeRead, edgeWrite } from "@/lib/edge-store";

const TOKEN_BLOB_NAME = "onedrive-token.json";
const EDGE_KEY = "onedrive_token";

// Read-your-writes na instância: o Edge Config propaga a escrita em alguns segundos.
// Sem isto, logo após o callback OAuth / refresh, a leitura podia não ver o token novo.
let tokenMem: { at: number; data: OneDriveToken } | null = null;
const MEM_TTL = 2 * 60 * 1000;

export interface OneDriveToken {
  refresh_token: string;
  access_token?: string;
  expires_at?: number;
  scope?: string;
  connected_at?: string;
  last_refreshed?: string;
}

function chave(): Buffer | null {
  const secret = (process.env.ONEDRIVE_CLIENT_SECRET || "").trim();
  if (!secret) return null;
  return crypto.createHash("sha256").update(secret).digest();
}

function cifrar(data: OneDriveToken, k: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

function decifrar(payload: string, k: Buffer): OneDriveToken {
  const raw = Buffer.from(payload, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", k, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  const pt = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
  return JSON.parse(pt.toString("utf8")) as OneDriveToken;
}

export async function saveOneDriveToken(data: OneDriveToken): Promise<void> {
  // A MEMÓRIA guarda tudo (inclui access_token) p/ a instância — read-your-writes.
  tokenMem = { at: Date.now(), data };

  // PERSISTE só o durável: o access_token é um JWT efêmero (~2KB!) que se re-obtém do
  // refresh no cold start. Guardá-lo enchia o Edge (teto 8KB) e quebrava o save dos pagos.
  // Agora o token persistido fica ~500 bytes.
  const persist: OneDriveToken = {
    refresh_token: data.refresh_token,
    scope: data.scope,
    connected_at: data.connected_at,
    last_refreshed: data.last_refreshed,
  };
  const k = chave();
  // Sem o secret não há como cifrar — grava como antes (e sem secret o refresh tampouco
  // funciona, então não há perda de segurança relativa).
  const payload = k ? { v: 1, enc: cifrar(persist, k) } : persist;
  // 1) Edge Config (sobrevive a bloqueio do Blob). 2) fallback Blob (sem token de escrita).
  const okEdge = await edgeWrite(EDGE_KEY, payload);
  if (!okEdge) {
    await put(TOKEN_BLOB_NAME, JSON.stringify(payload), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
  }
}

/** Lê o token (cifrado ou legado em texto puro). Edge Config primeiro, Blob como fallback. */
export async function loadOneDriveToken(): Promise<OneDriveToken | null> {
  if (tokenMem && Date.now() - tokenMem.at < MEM_TTL) return tokenMem.data;

  // 1) Edge Config (leitura grátis, sobrevive a bloqueio do Blob)
  let j = await edgeRead<{ v?: number; enc?: string } & Partial<OneDriveToken>>(EDGE_KEY);

  // 2) Fallback Blob (token legado / antes da migração)
  if (!j) {
    try {
      const { blobs } = await list({ prefix: TOKEN_BLOB_NAME });
      const hit = blobs.find((b) => b.pathname === TOKEN_BLOB_NAME) ?? blobs[0];
      if (hit) {
        const res = await fetch(hit.url, { cache: "no-store" });
        if (res.ok) j = (await res.json().catch(() => null)) as typeof j;
      }
    } catch { /* Blob bloqueado/indisponível — segue sem token */ }
  }
  if (!j) return null;

  let out: OneDriveToken | null = null;
  if (typeof j.enc === "string") {
    const k = chave();
    if (k) { try { out = decifrar(j.enc, k); } catch { out = null; } }
  } else if (j.refresh_token) {
    out = j as OneDriveToken;
    saveOneDriveToken(out).catch(() => {}); // migra pro Edge cifrado (best effort)
  }
  if (out) tokenMem = { at: Date.now(), data: out };
  return out;
}
