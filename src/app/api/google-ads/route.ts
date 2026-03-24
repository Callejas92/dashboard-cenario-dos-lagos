import { NextResponse } from "next/server";

const GOOGLE_ADS_API = "https://googleads.googleapis.com/v23";

interface GoogleAdsMetrics {
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  campaignName: string;
  campaignId: string;
}

async function getAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN || "",
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`OAuth failed: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

function getHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "",
    "Content-Type": "application/json",
    ...(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
      ? { "login-customer-id": process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID }
      : {}),
  };
}

async function fetchAccountInfo(accessToken: string, customerId: string) {
  const query = `SELECT customer.id, customer.descriptive_name, customer.status FROM customer LIMIT 1`;
  const res = await fetch(
    `${GOOGLE_ADS_API}/customers/${customerId}/googleAds:search`,
    {
      method: "POST",
      headers: getHeaders(accessToken),
      body: JSON.stringify({ query }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    // If permission denied, try the manager account directly
    if (res.status === 403) {
      // Account might still be in setup - try manager account
      const managerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "";
      if (managerId && managerId !== customerId) {
        const mgrRes = await fetch(
          `${GOOGLE_ADS_API}/customers/${managerId}/googleAds:search`,
          {
            method: "POST",
            headers: getHeaders(accessToken),
            body: JSON.stringify({ query }),
          }
        );
        if (mgrRes.ok) {
          const mgrData = await mgrRes.json();
          return {
            connected: true,
            accountName: mgrData.results?.[0]?.customer?.descriptiveName || "Conta Manager",
            note: "Conta de anuncios ainda em configuracao. Usando conta Manager.",
            useManagerId: true,
          };
        }
      }
      throw new Error(`Conta de anuncios (${customerId}) sem permissao. Complete a configuracao da conta no Google Ads.`);
    }
    throw new Error(`Google Ads API error: ${res.status} — ${err}`);
  }

  const data = await res.json();
  return {
    connected: true,
    accountName: data.results?.[0]?.customer?.descriptiveName || "",
    useManagerId: false,
  };
}

async function fetchCampaignData(
  accessToken: string,
  customerId: string,
  dateFrom: string,
  dateTo: string
): Promise<GoogleAdsMetrics[]> {
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
      AND campaign.status = 'ENABLED'
    ORDER BY metrics.cost_micros DESC
  `;

  const res = await fetch(
    `${GOOGLE_ADS_API}/customers/${customerId}/googleAds:search`,
    {
      method: "POST",
      headers: getHeaders(accessToken),
      body: JSON.stringify({ query }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    // 403 = account still in setup, return empty campaigns
    if (res.status === 403) {
      return [];
    }
    throw new Error(`Google Ads API error: ${res.status} — ${err}`);
  }

  const data = await res.json();
  const results: GoogleAdsMetrics[] = [];

  for (const row of data.results || []) {
    results.push({
      campaignId: row.campaign?.id || "",
      campaignName: row.campaign?.name || "",
      impressions: parseInt(row.metrics?.impressions || "0"),
      clicks: parseInt(row.metrics?.clicks || "0"),
      costMicros: parseInt(row.metrics?.costMicros || "0"),
      conversions: parseFloat(row.metrics?.conversions || "0"),
    });
  }

  return results;
}

export async function GET(request: Request) {
  // Check if credentials are configured
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
    return NextResponse.json({
      configured: false,
      message: "Google Ads nao configurado. Adicione as credenciais nas variaveis de ambiente.",
      data: null,
    });
  }

  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("from") || new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
    const dateTo = searchParams.get("to") || new Date().toISOString().split("T")[0];
    const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID || "";

    const accessToken = await getAccessToken();

    // First check account connectivity
    const accountInfo = await fetchAccountInfo(accessToken, customerId);

    // Fetch campaigns from the appropriate account
    const queryCustomerId = accountInfo.useManagerId
      ? (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || customerId)
      : customerId;

    const campaigns = await fetchCampaignData(accessToken, queryCustomerId, dateFrom, dateTo);

    const totals = campaigns.reduce(
      (acc, c) => ({
        impressions: acc.impressions + c.impressions,
        clicks: acc.clicks + c.clicks,
        cost: acc.cost + c.costMicros / 1_000_000,
        conversions: acc.conversions + c.conversions,
      }),
      { impressions: 0, clicks: 0, cost: 0, conversions: 0 }
    );

    // Calculate derived metrics
    const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
    const cpc = totals.clicks > 0 ? totals.cost / totals.clicks : 0;
    const cpa = totals.conversions > 0 ? totals.cost / totals.conversions : 0;

    return NextResponse.json({
      configured: true,
      accountName: accountInfo.accountName,
      note: accountInfo.note || null,
      dateFrom,
      dateTo,
      campaigns: campaigns.map((c) => ({
        ...c,
        cost: c.costMicros / 1_000_000,
        ctr: c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(2) : "0",
        cpc: c.clicks > 0 ? (c.costMicros / 1_000_000 / c.clicks).toFixed(2) : "0",
      })),
      totals: {
        ...totals,
        ctr: ctr.toFixed(2),
        cpc: cpc.toFixed(2),
        cpa: cpa.toFixed(2),
      },
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { configured: true, error: String(error), data: null },
      { status: 500 }
    );
  }
}
