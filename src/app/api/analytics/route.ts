import { NextResponse } from "next/server";

const GA_API = "https://analyticsdata.googleapis.com/v1beta";

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

export async function GET(request: Request) {
  const propertyId = process.env.GA_PROPERTY_ID;

  if (!propertyId || !process.env.GOOGLE_CLIENT_ID) {
    return NextResponse.json({
      configured: false,
      message: "Google Analytics nao configurado. Adicione GA_PROPERTY_ID nas variaveis de ambiente.",
      data: null,
    });
  }

  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "30");
    const accessToken = await getAccessToken();

    // Fetch overview metrics
    const overviewRes = await fetch(`${GA_API}/properties/${propertyId}:runReport`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
        metrics: [
          { name: "activeUsers" },
          { name: "sessions" },
          { name: "screenPageViews" },
          { name: "averageSessionDuration" },
          { name: "bounceRate" },
          { name: "conversions" },
        ],
      }),
    });

    if (!overviewRes.ok) {
      const err = await overviewRes.text();
      throw new Error(`GA API error: ${overviewRes.status} — ${err}`);
    }

    const overviewData = await overviewRes.json();
    const overviewRow = overviewData.rows?.[0]?.metricValues || [];

    // Fetch traffic by source
    const sourceRes = await fetch(`${GA_API}/properties/${propertyId}:runReport`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [
          { name: "sessions" },
          { name: "activeUsers" },
          { name: "conversions" },
        ],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 10,
      }),
    });

    const sourceData = await sourceRes.json();
    const sources = (sourceData.rows || []).map((row: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }) => ({
      channel: row.dimensionValues[0].value,
      sessions: parseInt(row.metricValues[0].value),
      users: parseInt(row.metricValues[1].value),
      conversions: parseInt(row.metricValues[2].value),
    }));

    // Fetch daily traffic
    const dailyRes = await fetch(`${GA_API}/properties/${propertyId}:runReport`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
        dimensions: [{ name: "date" }],
        metrics: [
          { name: "activeUsers" },
          { name: "sessions" },
          { name: "screenPageViews" },
          { name: "engagementRate" },
          { name: "bounceRate" },
          { name: "conversions" },
          { name: "averageSessionDuration" },
        ],
        orderBys: [{ dimension: { dimensionName: "date" }, desc: false }],
      }),
    });

    const dailyData = await dailyRes.json();
    const daily = (dailyData.rows || []).map((row: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }) => ({
      date: row.dimensionValues[0].value.replace(/(\d{4})(\d{2})(\d{2})/, "$3/$2/$1"),
      users: parseInt(row.metricValues[0].value),
      sessions: parseInt(row.metricValues[1].value),
      pageViews: parseInt(row.metricValues[2].value),
      engagementRate: parseFloat((parseFloat(row.metricValues[3].value) * 100).toFixed(1)),
      bounceRate: parseFloat((parseFloat(row.metricValues[4].value) * 100).toFixed(1)),
      conversions: parseInt(row.metricValues[5].value),
      avgDuration: parseFloat(parseFloat(row.metricValues[6].value).toFixed(0)),
    }));

    // Fetch top pages
    const pagesRes = await fetch(`${GA_API}/properties/${propertyId}:runReport`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
        dimensions: [{ name: "pagePath" }],
        metrics: [
          { name: "screenPageViews" },
          { name: "activeUsers" },
        ],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 10,
      }),
    });

    const pagesData = await pagesRes.json();
    const topPages = (pagesData.rows || []).map((row: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }) => ({
      path: row.dimensionValues[0].value,
      views: parseInt(row.metricValues[0].value),
      users: parseInt(row.metricValues[1].value),
    }));

    return NextResponse.json({
      configured: true,
      days,
      overview: {
        users: parseInt(overviewRow[0]?.value || "0"),
        sessions: parseInt(overviewRow[1]?.value || "0"),
        pageViews: parseInt(overviewRow[2]?.value || "0"),
        avgSessionDuration: parseFloat(overviewRow[3]?.value || "0"),
        bounceRate: parseFloat(overviewRow[4]?.value || "0"),
        conversions: parseInt(overviewRow[5]?.value || "0"),
      },
      sources,
      daily,
      topPages,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { configured: true, error: String(error), data: null },
      { status: 500 }
    );
  }
}
