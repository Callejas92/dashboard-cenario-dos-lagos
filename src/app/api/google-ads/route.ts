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
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "",
        "Content-Type": "application/json",
        ...(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
          ? { "login-customer-id": process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID }
          : {}),
      },
      body: JSON.stringify({ query }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
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
      message: "Google Ads não configurado. Adicione as credenciais nas variáveis de ambiente.",
      data: null,
    });
  }

  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("from") || new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const dateTo = searchParams.get("to") || new Date().toISOString().split("T")[0];
    const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID || "";

    const accessToken = await getAccessToken();
    const campaigns = await fetchCampaignData(accessToken, customerId, dateFrom, dateTo);

    const totals = campaigns.reduce(
      (acc, c) => ({
        impressions: acc.impressions + c.impressions,
        clicks: acc.clicks + c.clicks,
        cost: acc.cost + c.costMicros / 1_000_000,
        conversions: acc.conversions + c.conversions,
      }),
      { impressions: 0, clicks: 0, cost: 0, conversions: 0 }
    );

    return NextResponse.json({
      configured: true,
      dateFrom,
      dateTo,
      campaigns: campaigns.map((c) => ({
        ...c,
        cost: c.costMicros / 1_000_000,
      })),
      totals,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { configured: true, error: String(error), data: null },
      { status: 500 }
    );
  }
}
