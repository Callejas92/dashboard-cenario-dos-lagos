import { NextResponse } from "next/server";
import { loadOneDriveToken } from "@/lib/onedrive-token";

export async function GET() {
  try {
    // Ler o token (cifrado no Blob)
    const tokenData = await loadOneDriveToken();
    if (!tokenData) {
      return NextResponse.json({
        connected: false,
        message: "OneDrive não conectado. Configure as credenciais e autorize o acesso.",
      });
    }

    // Verificar se o token ainda é válido fazendo um refresh
    const CLIENT_ID = process.env.ONEDRIVE_CLIENT_ID || "";
    const CLIENT_SECRET = process.env.ONEDRIVE_CLIENT_SECRET || "";

    if (!CLIENT_ID || !CLIENT_SECRET) {
      return NextResponse.json({
        connected: false,
        message: "ONEDRIVE_CLIENT_ID e ONEDRIVE_CLIENT_SECRET não configurados.",
      });
    }

    const refreshRes = await fetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: tokenData.refresh_token,
        grant_type: "refresh_token",
        scope: "Files.ReadWrite Files.ReadWrite.All offline_access",
      }),
    });

    if (!refreshRes.ok) {
      return NextResponse.json({
        connected: false,
        message: "Token expirado. Reconecte o OneDrive.",
        connected_at: tokenData.connected_at,
      });
    }

    // Token válido - testar acesso ao OneDrive
    const newTokens = await refreshRes.json();
    const driveRes = await fetch("https://graph.microsoft.com/v1.0/me/drive", {
      headers: { Authorization: `Bearer ${newTokens.access_token}` },
    });

    if (!driveRes.ok) {
      return NextResponse.json({
        connected: false,
        message: "Token válido mas sem acesso ao OneDrive.",
      });
    }

    const driveInfo = await driveRes.json();

    return NextResponse.json({
      connected: true,
      owner: driveInfo.owner?.user?.displayName || "Desconhecido",
      driveType: driveInfo.driveType,
      quota: {
        total: driveInfo.quota?.total,
        used: driveInfo.quota?.used,
        remaining: driveInfo.quota?.remaining,
      },
      connected_at: tokenData.connected_at,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({
      connected: false,
      message: `Erro: ${errMsg}`,
    });
  }
}
