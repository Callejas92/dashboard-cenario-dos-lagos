const GOOGLE_ADS_API = "https://googleads.googleapis.com/v23";

export interface GoogleAdsCostResult {
  custoBRL: number;
  conversoes: number;
  clicks: number;
  impressions: number;
  campaignCount: number;
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
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("OAuth failed");
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

interface CampaignRow {
  metrics?: {
    impressions?: string;
    clicks?: string;
    costMicros?: string;
    conversions?: string;
  };
}

export async function getGoogleAdsCost(from: string, to: string): Promise<GoogleAdsCostResult> {
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID || "";
  if (!customerId || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
    return { custoBRL: 0, conversoes: 0, clicks: 0, impressions: 0, campaignCount: 0 };
  }

  try {
    const accessToken = await getAccessToken();

    const query = `
      SELECT
        campaign.id,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions
      FROM campaign
      WHERE segments.date BETWEEN '${from}' AND '${to}'
    `;

    const res = await fetch(
      `${GOOGLE_ADS_API}/customers/${customerId}/googleAds:search`,
      {
        method: "POST",
        headers: getHeaders(accessToken),
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!res.ok) {
      // 403 = conta em setup, 401 = auth issue. Não erro fatal.
      return { custoBRL: 0, conversoes: 0, clicks: 0, impressions: 0, campaignCount: 0 };
    }

    const data = await res.json();
    const rows = (data.results || []) as CampaignRow[];

    let impressions = 0, clicks = 0, costMicros = 0, conversions = 0;
    for (const row of rows) {
      const m = row.metrics || {};
      impressions += parseInt(m.impressions || "0");
      clicks += parseInt(m.clicks || "0");
      costMicros += parseInt(m.costMicros || "0");
      conversions += parseFloat(m.conversions || "0");
    }

    return {
      custoBRL: costMicros / 1_000_000,
      conversoes: Math.round(conversions),
      clicks,
      impressions,
      campaignCount: rows.length,
    };
  } catch (err) {
    console.error("getGoogleAdsCost error:", err);
    return { custoBRL: 0, conversoes: 0, clicks: 0, impressions: 0, campaignCount: 0 };
  }
}
