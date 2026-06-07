import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

const CLIENT_ID = (process.env.ONEDRIVE_CLIENT_ID || "").trim();
const CLIENT_SECRET = (process.env.ONEDRIVE_CLIENT_SECRET || "").trim();
const REDIRECT_URI = (process.env.ONEDRIVE_REDIRECT_URI || "").trim();

const TOKEN_BLOB_NAME = "onedrive-token.json";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDesc = searchParams.get("error_description");

  if (error) {
    return new NextResponse(
      htmlPage("Erro na Autorização", `<p class="error">${error}: ${errorDesc}</p><p><a href="/api/onedrive/auth">Tentar novamente</a></p>`),
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  if (!code) {
    return new NextResponse(
      htmlPage("Erro", `<p class="error">Código de autorização não recebido.</p>`),
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  try {
    // Trocar code por tokens
    const tokenRes = await fetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
        scope: "Files.ReadWrite Files.ReadWrite.All offline_access",
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return new NextResponse(
        htmlPage("Erro ao obter token", `<p class="error">Status ${tokenRes.status}: ${errText}</p>`),
        { headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    const tokenData = await tokenRes.json();

    // Salvar refresh_token no Vercel Blob (persiste entre deploys)
    const tokenPayload = {
      refresh_token: tokenData.refresh_token,
      access_token: tokenData.access_token,
      expires_at: Date.now() + (tokenData.expires_in * 1000),
      scope: tokenData.scope,
      connected_at: new Date().toISOString(),
    };

    await put(TOKEN_BLOB_NAME, JSON.stringify(tokenPayload), {
      access: "public",
      addRandomSuffix: false,
    });

    // Verificar acesso - listar root do OneDrive
    const testRes = await fetch("https://graph.microsoft.com/v1.0/me/drive/root/children?$top=5&$select=name,size,lastModifiedDateTime", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    let fileList = "";
    if (testRes.ok) {
      const testData = await testRes.json();
      const files = testData.value || [];
      fileList = files.map((f: { name: string }) => `<li>${f.name}</li>`).join("");
    }

    return new NextResponse(
      htmlPage("OneDrive Conectado!", `
        <p class="success">Autorização concluída com sucesso!</p>
        <p>O refresh token foi salvo. O dashboard agora pode ler seus arquivos do OneDrive automaticamente.</p>
        ${fileList ? `<h3>Arquivos encontrados:</h3><ul>${fileList}</ul>` : ""}
        <p style="margin-top:20px"><a href="/" class="btn">Voltar ao Dashboard</a></p>
      `),
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new NextResponse(
      htmlPage("Erro", `<p class="error">${msg}</p>`),
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

function htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Dashboard Cenário dos Lagos</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; background: #0f1117; color: #e2e8f0; }
    h1 { color: #10b981; }
    .success { color: #10b981; font-weight: bold; }
    .error { color: #e94560; background: rgba(233,69,96,0.1); padding: 12px; border-radius: 8px; }
    ul { list-style: none; padding: 0; }
    li { padding: 8px 12px; margin: 4px 0; background: rgba(255,255,255,0.05); border-radius: 6px; }
    .btn { display: inline-block; padding: 10px 24px; background: #10b981; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; }
    .btn:hover { background: #059669; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${body}
</body>
</html>`;
}
