import { NextResponse } from "next/server";

// Azure App Registration - configurar no portal.azure.com
const CLIENT_ID = process.env.ONEDRIVE_CLIENT_ID || "";
const REDIRECT_URI = process.env.ONEDRIVE_REDIRECT_URI || "";

// Scopes necessários para ler arquivos do OneDrive
const SCOPES = "Files.Read Files.Read.All offline_access";

export async function GET() {
  if (!CLIENT_ID || !REDIRECT_URI) {
    return NextResponse.json({
      error: "ONEDRIVE_CLIENT_ID e ONEDRIVE_REDIRECT_URI não configurados nas variáveis de ambiente.",
      instructions: [
        "1. Acesse https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
        "2. Clique em 'Novo registro'",
        "3. Nome: 'Dashboard Cenário dos Lagos'",
        "4. Tipo de conta: 'Contas pessoais da Microsoft'",
        "5. URI de redirecionamento: Web → https://SEU-DOMINIO/api/onedrive/callback",
        "6. Copie o Application (client) ID → ONEDRIVE_CLIENT_ID",
        "7. Vá em 'Certificados e segredos' → Novo segredo → copie o valor → ONEDRIVE_CLIENT_SECRET",
        "8. Configure ONEDRIVE_REDIRECT_URI = https://SEU-DOMINIO/api/onedrive/callback",
      ],
    }, { status: 400 });
  }

  // Gerar URL de autorização Microsoft (consumers = contas pessoais)
  const authUrl = new URL("https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize");
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("response_mode", "query");
  authUrl.searchParams.set("prompt", "consent");

  return NextResponse.json({
    authUrl: authUrl.toString(),
    message: "Abra a URL abaixo no navegador para autorizar o acesso ao OneDrive.",
  });
}
