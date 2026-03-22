import { NextResponse } from "next/server";

const META_API = "https://graph.facebook.com/v21.0";

interface MetaCampaignData {
  campaignId: string;
  campaignName: string;
  reach: number;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
}

async function fetchCampaignInsights(
  accessToken: string,
  adAccountId: string,
  dateFrom: string,
  dateTo: string
): Promise<MetaCampaignData[]> {
  const fields = "campaign_id,campaign_name,reach,impressions,clicks,spend,actions";
  const timeRange = JSON.stringify({ since: dateFrom, until: dateTo });
  const level = "campaign";

  const url = `${META_API}/act_${adAccountId}/insights?fields=${fields}&time_range=${timeRange}&level=${level}&limit=500&access_token=${accessToken}`;

  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Meta Ads API error: ${res.status} — ${err}`);
  }

  const data = await res.json();
  const results: MetaCampaignData[] = [];

  for (const row of data.data || []) {
    const leads = (row.actions || []).find(
      (a: { action_type: string }) => a.action_type === "lead" || a.action_type === "onsite_conversion.lead_grouped"
    );

    results.push({
      campaignId: row.campaign_id || "",
      campaignName: row.campaign_name || "",
      reach: parseInt(row.reach || "0"),
      impressions: parseInt(row.impressions || "0"),
      clicks: parseInt(row.clicks || "0"),
      spend: parseFloat(row.spend || "0"),
      leads: leads ? parseInt(leads.value || "0") : 0,
    });
  }

  return results;
}

export async function GET(request: Request) {
  if (!process.env.META_ACCESS_TOKEN || !process.env.META_AD_ACCOUNT_ID) {
    return NextResponse.json({
      configured: false,
      message: "Meta Ads não configurado. Adicione as credenciais nas variáveis de ambiente.",
      data: null,
    });
  }

  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("from") || new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const dateTo = searchParams.get("to") || new Date().toISOString().split("T")[0];

    const campaigns = await fetchCampaignInsights(
      process.env.META_ACCESS_TOKEN,
      process.env.META_AD_ACCOUNT_ID,
      dateFrom,
      dateTo
    );

    const totals = campaigns.reduce(
      (acc, c) => ({
        reach: acc.reach + c.reach,
        impressions: acc.impressions + c.impressions,
        clicks: acc.clicks + c.clicks,
        spend: acc.spend + c.spend,
        leads: acc.leads + c.leads,
      }),
      { reach: 0, impressions: 0, clicks: 0, spend: 0, leads: 0 }
    );

    return NextResponse.json({
      configured: true,
      dateFrom,
      dateTo,
      campaigns,
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
