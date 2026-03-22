import { NextResponse } from "next/server";

const META_TOKEN_URL = "https://graph.facebook.com/v21.0/oauth/access_token";
const META_DEBUG_URL = "https://graph.facebook.com/debug_token";

async function checkMetaToken() {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return { status: "not_configured" };

  // Check token expiration
  const appId = process.env.META_APP_ID || "";
  const appSecret = process.env.META_APP_SECRET || "";

  const debugRes = await fetch(
    `${META_DEBUG_URL}?input_token=${token}&access_token=${appId}|${appSecret}`
  );
  const debugData = await debugRes.json();
  const expiresAt = debugData.data?.expires_at || 0;
  const now = Math.floor(Date.now() / 1000);
  const daysLeft = Math.floor((expiresAt - now) / 86400);

  // If token expires in less than 7 days, try to renew
  if (daysLeft < 7 && daysLeft > 0) {
    try {
      const renewRes = await fetch(
        `${META_TOKEN_URL}?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${token}`
      );
      const renewData = await renewRes.json();

      if (renewData.access_token) {
        // Update token via Vercel API
        const updated = await updateVercelEnv("META_ACCESS_TOKEN", renewData.access_token);
        if (updated) {
          return {
            status: "renewed",
            newExpiresIn: renewData.expires_in,
            daysLeft: Math.floor(renewData.expires_in / 86400),
          };
        }
      }
    } catch {
      // Renewal failed, send notification
    }

    return {
      status: "expiring_soon",
      daysLeft,
      message: `Token Meta expira em ${daysLeft} dia(s). Renovação automática falhou. Gere um novo token manualmente.`,
    };
  }

  if (daysLeft <= 0) {
    return {
      status: "expired",
      message: "Token Meta expirado. Gere um novo token no Graph API Explorer.",
    };
  }

  return { status: "ok", daysLeft };
}

async function updateVercelEnv(name: string, value: string): Promise<boolean> {
  const vercelToken = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;

  if (!vercelToken || !projectId) return false;

  try {
    // Get existing env var
    const listRes = await fetch(
      `https://api.vercel.com/v9/projects/${projectId}/env`,
      { headers: { Authorization: `Bearer ${vercelToken}` } }
    );
    const listData = await listRes.json();
    const existing = listData.envs?.find((e: { key: string }) => e.key === name);

    if (existing) {
      // Update existing
      await fetch(
        `https://api.vercel.com/v9/projects/${projectId}/env/${existing.id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${vercelToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ value }),
        }
      );
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

async function sendNotificationEmail(subject: string, body: string) {
  const email = process.env.NOTIFICATION_EMAIL;
  if (!email) return;

  // Use a simple webhook or log for now
  console.log(`[NOTIFICATION] To: ${email} | Subject: ${subject} | Body: ${body}`);
}

export async function GET(request: Request) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const metaStatus = await checkMetaToken();

  if (metaStatus.status === "expiring_soon" || metaStatus.status === "expired") {
    await sendNotificationEmail(
      "Dashboard Cenário dos Lagos - Token Meta Ads",
      metaStatus.message || "Token precisa ser renovado."
    );
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    meta: metaStatus,
  });
}
