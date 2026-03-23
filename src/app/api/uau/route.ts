import { NextResponse } from "next/server";

const UAU_API = process.env.UAU_API_URL || "https://gamma-api.seniorcloud.com.br:51877/uauAPI";
const UAU_VERSION = "1";

interface UauAuthResponse {
  Token?: string;
  Mensagem?: string;
  Descricao?: string;
  Detalhe?: string;
}

async function authenticate(): Promise<string> {
  const login = process.env.UAU_LOGIN;
  const senha = process.env.UAU_SENHA;
  const integrationToken = process.env.UAU_INTEGRATION_TOKEN;

  if (!login || !senha || !integrationToken) {
    throw new Error("Credenciais UAU não configuradas");
  }

  const res = await fetch(
    `${UAU_API}/api/v${UAU_VERSION}/Autenticador/AutenticarUsuario`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-INTEGRATION-Authorization": integrationToken,
      },
      body: JSON.stringify({ Login: login, Senha: senha }),
    }
  );

  const data: UauAuthResponse = await res.json();

  if (!data.Token) {
    throw new Error(data.Descricao || data.Mensagem || "Falha na autenticação UAU");
  }

  return data.Token;
}

async function uauPost(endpoint: string, token: string, body: Record<string, unknown> = {}) {
  const integrationToken = process.env.UAU_INTEGRATION_TOKEN || "";

  const res = await fetch(`${UAU_API}/api/v${UAU_VERSION}/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
      "X-INTEGRATION-Authorization": integrationToken,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`UAU API ${endpoint}: ${res.status} — ${err}`);
  }

  return res.json();
}

export async function GET() {
  if (!process.env.UAU_LOGIN || !process.env.UAU_SENHA || !process.env.UAU_INTEGRATION_TOKEN) {
    return NextResponse.json({
      configured: false,
      message: "ERP UAU não configurado. Adicione UAU_LOGIN, UAU_SENHA e UAU_INTEGRATION_TOKEN nas variáveis de ambiente.",
    });
  }

  try {
    const token = await authenticate();

    // Buscar dados em paralelo
    const [obrasData, prospectsData, vendasData] = await Promise.allSettled([
      uauPost("Obras/ObterObrasAtivas", token),
      uauPost("Prospect/ConsultarTodosProspects", token, {
        enumOpcaoTodos: 0,
      }),
      uauPost("Venda/RetornaChavesVendasPorPeriodo", token, {
        data_inicio: new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0],
        data_fim: new Date().toISOString().split("T")[0],
        statusVenda: "0",
      }),
    ]);

    const obras = obrasData.status === "fulfilled" ? obrasData.value : null;
    const prospects = prospectsData.status === "fulfilled" ? prospectsData.value : null;
    const vendas = vendasData.status === "fulfilled" ? vendasData.value : null;

    // Contar prospects por status
    const prospectList = Array.isArray(prospects) ? prospects : prospects?.Dados || prospects?.dados || [];
    const totalProspects = Array.isArray(prospectList) ? prospectList.length : 0;

    // Contar vendas
    const vendaList = Array.isArray(vendas) ? vendas : vendas?.Dados || vendas?.dados || [];
    const totalVendas = Array.isArray(vendaList) ? vendaList.length : 0;

    // Obras
    const obraList = Array.isArray(obras) ? obras : obras?.Dados || obras?.dados || [];
    const totalObras = Array.isArray(obraList) ? obraList.length : 0;

    return NextResponse.json({
      configured: true,
      fetchedAt: new Date().toISOString(),
      summary: {
        totalObras,
        totalProspects,
        totalVendas,
      },
      obras: obraList,
      prospects: prospectList,
      vendas: vendaList,
      errors: {
        obras: obrasData.status === "rejected" ? String(obrasData.reason) : null,
        prospects: prospectsData.status === "rejected" ? String(prospectsData.reason) : null,
        vendas: vendasData.status === "rejected" ? String(vendasData.reason) : null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { configured: true, error: String(error) },
      { status: 500 }
    );
  }
}
