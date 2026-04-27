import { NextRequest, NextResponse } from "next/server";
import { list, put } from "@vercel/blob";

const META_API = "https://graph.facebook.com/v21.0";
const FOLLOWERS_BLOB_NAME = "instagram-followers.json";

// In-memory cache
let cachedData: { data: unknown; timestamp: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000;

interface FollowersHistory {
  historico: { data: string; seguidores: number }[];
  updatedAt: string;
}

// ── Carrega histórico de seguidores do Blob ──
async function loadFollowersHistory(): Promise<FollowersHistory> {
  try {
    const { blobs } = await list({ prefix: FOLLOWERS_BLOB_NAME });
    if (blobs.length === 0) return { historico: [], updatedAt: "" };
    const res = await fetch(blobs[0].url, { cache: "no-store" });
    return await res.json();
  } catch {
    return { historico: [], updatedAt: "" };
  }
}

// ── Salva snapshot diário (max 1 por dia) ──
// Fire-and-forget: não bloqueia o request principal
async function saveFollowersSnapshot(seguidores: number): Promise<{ data: string; seguidores: number }[]> {
  try {
    const history = await loadFollowersHistory();
    const today = new Date().toISOString().split("T")[0];

    // Se já tem registro de hoje, atualiza só se mudou (não duplica)
    const existingIdx = history.historico.findIndex((h) => h.data === today);
    if (existingIdx >= 0) {
      // Atualiza valor de hoje (caso tenha mudado durante o dia)
      if (history.historico[existingIdx].seguidores !== seguidores) {
        history.historico[existingIdx].seguidores = seguidores;
        history.updatedAt = new Date().toISOString();
        // Salva fire-and-forget
        put(FOLLOWERS_BLOB_NAME, JSON.stringify(history), {
          access: "public",
          addRandomSuffix: false,
          allowOverwrite: true,
        }).catch((e) => console.warn("Erro ao salvar followers (update):", e));
      }
    } else {
      // Adiciona novo registro de hoje
      history.historico.push({ data: today, seguidores });
      // Mantém ordenado e limita a 365 dias
      history.historico.sort((a, b) => a.data.localeCompare(b.data));
      if (history.historico.length > 365) {
        history.historico = history.historico.slice(-365);
      }
      history.updatedAt = new Date().toISOString();
      put(FOLLOWERS_BLOB_NAME, JSON.stringify(history), {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
      }).catch((e) => console.warn("Erro ao salvar followers (new):", e));
    }

    return history.historico;
  } catch (err) {
    console.error("saveFollowersSnapshot error:", err);
    return [];
  }
}

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

    // Salva snapshot de hoje no Blob e retorna histórico atualizado
    const seguidoresHoje = profile.followers_count || 0;
    const historicoSeguidores = await saveFollowersSnapshot(seguidoresHoje);

    // Calcula crescimento (vs dia anterior, vs 7 dias atrás)
    let crescimentoDia = 0;
    let crescimento7d = 0;
    if (historicoSeguidores.length >= 2) {
      const ontem = historicoSeguidores[historicoSeguidores.length - 2];
      crescimentoDia = seguidoresHoje - ontem.seguidores;
    }
    if (historicoSeguidores.length >= 8) {
      const semanaPassada = historicoSeguidores[historicoSeguidores.length - 8];
      crescimento7d = seguidoresHoje - semanaPassada.seguidores;
    }

    const response = {
      configured: true,
      perfil: {
        nome: profile.name || "",
        username: profile.username || "",
        foto: profile.profile_picture_url || "",
        seguidores: seguidoresHoje,
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
      // Histórico de seguidores acumulado dia a dia
      historicoSeguidores,
      crescimento: {
        dia: crescimentoDia,
        semana: crescimento7d,
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
