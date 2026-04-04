import { NextRequest, NextResponse } from "next/server";

const META_API = "https://graph.facebook.com/v21.0";

// In-memory cache
let cachedData: { data: unknown; timestamp: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000;

export async function GET(request: NextRequest) {
  const accessToken = process.env.META_ACCESS_TOKEN?.trim();
  const igAccountId = process.env.INSTAGRAM_ACCOUNT_ID?.trim();

  if (!accessToken || !igAccountId) {
    return NextResponse.json({
      configured: false,
      message: "Instagram não configurado. Adicione INSTAGRAM_ACCOUNT_ID nas variáveis de ambiente.",
    });
  }

  if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL) {
    return NextResponse.json(cachedData.data);
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") || "day";

  try {
    // Fetch account info + media + insights in parallel
    const [profileRes, mediaRes, insightsRes] = await Promise.all([
      fetch(
        `${META_API}/${igAccountId}?fields=name,username,profile_picture_url,followers_count,follows_count,media_count,biography&access_token=${accessToken}`
      ),
      fetch(
        `${META_API}/${igAccountId}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=25&access_token=${accessToken}`
      ),
      fetch(
        `${META_API}/${igAccountId}/insights?metric=impressions,reach,profile_views,website_clicks,follower_count&period=${period}&access_token=${accessToken}`
      ).catch(() => null),
    ]);

    if (!profileRes.ok) {
      const err = await profileRes.text();
      throw new Error(`Instagram API error: ${profileRes.status} — ${err}`);
    }

    const profile = await profileRes.json();

    // Media posts
    let posts: {
      id: string;
      caption: string;
      tipo: string;
      url: string;
      thumbnail: string;
      link: string;
      data: string;
      likes: number;
      comentarios: number;
      engajamento: number;
    }[] = [];

    if (mediaRes.ok) {
      const mediaData = await mediaRes.json();
      posts = (mediaData.data || []).map((p: Record<string, unknown>) => {
        const likes = (p.like_count as number) || 0;
        const comments = (p.comments_count as number) || 0;
        return {
          id: p.id as string,
          caption: ((p.caption as string) || "").substring(0, 120),
          tipo: p.media_type as string,
          url: (p.media_url as string) || "",
          thumbnail: (p.thumbnail_url as string) || (p.media_url as string) || "",
          link: (p.permalink as string) || "",
          data: (p.timestamp as string) || "",
          likes,
          comentarios: comments,
          engajamento: likes + comments,
        };
      });
    }

    // Insights (may fail for non-business accounts)
    let insights: Record<string, number[]> = {};
    if (insightsRes && insightsRes.ok) {
      const insightsData = await insightsRes.json();
      for (const metric of insightsData.data || []) {
        const name = metric.name as string;
        const values = (metric.values || []).map((v: { value: number }) => v.value);
        insights[name] = values;
      }
    }

    // Calculate engagement metrics
    const totalLikes = posts.reduce((s, p) => s + p.likes, 0);
    const totalComments = posts.reduce((s, p) => s + p.comentarios, 0);
    const avgEngagement = posts.length > 0 ? (totalLikes + totalComments) / posts.length : 0;
    const engagementRate = profile.followers_count > 0
      ? ((avgEngagement / profile.followers_count) * 100)
      : 0;

    // Top posts by engagement
    const topPosts = [...posts].sort((a, b) => b.engajamento - a.engajamento).slice(0, 5);

    // Posts by type
    const tipoMap = new Map<string, number>();
    for (const p of posts) {
      tipoMap.set(p.tipo, (tipoMap.get(p.tipo) || 0) + 1);
    }
    const porTipo = Array.from(tipoMap.entries()).map(([tipo, qtd]) => ({ tipo, qtd }));

    const response = {
      configured: true,
      perfil: {
        nome: profile.name || "",
        username: profile.username || "",
        foto: profile.profile_picture_url || "",
        seguidores: profile.followers_count || 0,
        seguindo: profile.follows_count || 0,
        totalPosts: profile.media_count || 0,
        bio: profile.biography || "",
      },
      metricas: {
        totalLikes,
        totalComments,
        avgEngagement: Math.round(avgEngagement * 10) / 10,
        engagementRate: Math.round(engagementRate * 100) / 100,
      },
      insights,
      posts,
      topPosts,
      porTipo,
      fetchedAt: new Date().toISOString(),
    };

    cachedData = { data: response, timestamp: Date.now() };
    return NextResponse.json(response);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Instagram API error:", errMsg);
    return NextResponse.json({ configured: true, error: errMsg }, { status: 500 });
  }
}
