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

interface DailyData {
  date: string;
  reach: number;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
}

function extractLeads(actions: { action_type: string; value: string }[] | undefined): number {
  const lead = (actions || []).find(
    (a) => a.action_type === "lead" || a.action_type === "onsite_conversion.lead_grouped"
  );
  return lead ? parseInt(lead.value || "0") : 0;
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

    const accessToken = process.env.META_ACCESS_TOKEN;
    const adAccountId = process.env.META_AD_ACCOUNT_ID;
    const fields = "campaign_id,campaign_name,reach,impressions,clicks,spend,actions";
    const fieldsDaily = "reach,impressions,clicks,spend,actions";
    const timeRange = JSON.stringify({ since: dateFrom, until: dateTo });

    // Fetch campaign data + daily data in parallel
    const [campaignRes, dailyRes] = await Promise.all([
      fetch(
        `${META_API}/act_${adAccountId}/insights?fields=${fields}&time_range=${timeRange}&level=campaign&limit=500&access_token=${accessToken}`
      ),
      fetch(
        `${META_API}/act_${adAccountId}/insights?fields=${fieldsDaily}&time_range=${timeRange}&time_increment=1&limit=500&access_token=${accessToken}`
      ),
    ]);

    const [campaignJson, dailyJson] = await Promise.all([
      campaignRes.json(),
      dailyRes.json(),
    ]);

    // Parse campaigns
    const campaigns: MetaCampaignData[] = (campaignJson.data || []).map(
      (row: { campaign_id?: string; campaign_name?: string; reach?: string; impressions?: string; clicks?: string; spend?: string; actions?: { action_type: string; value: string }[] }) => ({
        campaignId: row.campaign_id || "",
        campaignName: row.campaign_name || "",
        reach: parseInt(row.reach || "0"),
        impressions: parseInt(row.impressions || "0"),
        clicks: parseInt(row.clicks || "0"),
        spend: parseFloat(row.spend || "0"),
        leads: extractLeads(row.actions),
      })
    );

    // Parse daily data
    const daily: DailyData[] = (dailyJson.data || []).map(
      (row: { date_start?: string; reach?: string; impressions?: string; clicks?: string; spend?: string; actions?: { action_type: string; value: string }[] }) => ({
        date: row.date_start || "",
        reach: parseInt(row.reach || "0"),
        impressions: parseInt(row.impressions || "0"),
        clicks: parseInt(row.clicks || "0"),
        spend: parseFloat(row.spend || "0"),
        leads: extractLeads(row.actions),
      })
    );

    // Totals
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
      daily,
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
