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

const TOKEN_BLOB_NAME = "onedrive-token.json";

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
  const k = chave();
  // Sem o secret não há como cifrar — grava como antes (e sem secret o refresh
  // tampouco funciona, então não há perda de segurança relativa).
  const body = k ? JSON.stringify({ v: 1, enc: cifrar(data, k) }) : JSON.stringify(data);
  await put(TOKEN_BLOB_NAME, body, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

/** Lê o token (cifrado ou legado em texto puro). Legado é re-gravado cifrado. */
export async function loadOneDriveToken(): Promise<OneDriveToken | null> {
  const { blobs } = await list({ prefix: TOKEN_BLOB_NAME });
  const hit = blobs.find((b) => b.pathname === TOKEN_BLOB_NAME) ?? blobs[0];
  if (!hit) return null;
  const res = await fetch(`${hit.url}?_=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) return null;
  const j = (await res.json().catch(() => null)) as ({ v?: number; enc?: string } & Partial<OneDriveToken>) | null;
  if (!j) return null;
  if (typeof j.enc === "string") {
    const k = chave();
    if (!k) return null;
    try { return decifrar(j.enc, k); } catch { return null; }
  }
  if (j.refresh_token) {
    const legado = j as OneDriveToken;
    saveOneDriveToken(legado).catch(() => {}); // migra pra cifrado (best effort)
    return legado;
  }
  return null;
}
