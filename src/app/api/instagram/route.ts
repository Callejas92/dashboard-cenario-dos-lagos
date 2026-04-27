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
      performance?: "above" | "average" | "below";
    }[] = [];

    type Post = (typeof posts)[number];

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

    // ── 1. Engajamento por tipo (com avg) ──
    const tipoEngMap = new Map<string, { qtd: number; totalEng: number; totalLikes: number; totalComments: number }>();
    for (const p of posts) {
      const cur = tipoEngMap.get(p.tipo) || { qtd: 0, totalEng: 0, totalLikes: 0, totalComments: 0 };
      cur.qtd++;
      cur.totalEng += p.engajamento;
      cur.totalLikes += p.likes;
      cur.totalComments += p.comentarios;
      tipoEngMap.set(p.tipo, cur);
    }
    const porTipo = Array.from(tipoEngMap.entries())
      .map(([tipo, v]) => ({
        tipo,
        qtd: v.qtd,
        avgEngajamento: v.qtd > 0 ? v.totalEng / v.qtd : 0,
        avgLikes: v.qtd > 0 ? v.totalLikes / v.qtd : 0,
        avgComments: v.qtd > 0 ? v.totalComments / v.qtd : 0,
        totalEng: v.totalEng,
      }))
      .sort((a, b) => b.avgEngajamento - a.avgEngajamento);

    // ── 2. Melhor dia da semana ──
    const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const diaSemMap = new Map<number, { qtd: number; totalEng: number }>();
    for (let i = 0; i < 7; i++) diaSemMap.set(i, { qtd: 0, totalEng: 0 });
    for (const p of posts) {
      if (!p.data) continue;
      const d = new Date(p.data);
      const diaSemana = d.getDay();
      const cur = diaSemMap.get(diaSemana)!;
      cur.qtd++;
      cur.totalEng += p.engajamento;
    }
    const porDiaSemana = Array.from(diaSemMap.entries())
      .map(([dia, v]) => ({
        dia,
        nome: DIAS_SEMANA[dia],
        qtd: v.qtd,
        avgEngajamento: v.qtd > 0 ? v.totalEng / v.qtd : 0,
      }));
    const melhorDia = [...porDiaSemana]
      .filter((d) => d.qtd > 0)
      .sort((a, b) => b.avgEngajamento - a.avgEngajamento)[0] || null;

    // ── 3. Frequência de postagem ──
    let frequencia = { postsTotal: posts.length, semanas: 0, mediaSemanal: 0, ultimaSemana: 0, semanaAnterior: 0 };
    if (posts.length > 0) {
      const datasOrdenadas = [...posts].filter((p) => p.data).sort((a, b) => a.data.localeCompare(b.data));
      if (datasOrdenadas.length > 0) {
        const primeira = new Date(datasOrdenadas[0].data);
        const ultima = new Date(datasOrdenadas[datasOrdenadas.length - 1].data);
        const diasTotal = Math.max(1, Math.ceil((ultima.getTime() - primeira.getTime()) / 86400000));
        const semanas = Math.max(1, diasTotal / 7);
        const agora = new Date();
        const seteDiasAtras = new Date(agora); seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
        const quatorzeDiasAtras = new Date(agora); quatorzeDiasAtras.setDate(quatorzeDiasAtras.getDate() - 14);
        const ultimaSemana = posts.filter((p) => p.data && new Date(p.data) >= seteDiasAtras).length;
        const semanaAnterior = posts.filter((p) => p.data && new Date(p.data) >= quatorzeDiasAtras && new Date(p.data) < seteDiasAtras).length;
        frequencia = {
          postsTotal: posts.length,
          semanas: Math.round(semanas * 10) / 10,
          mediaSemanal: Math.round((posts.length / semanas) * 10) / 10,
          ultimaSemana,
          semanaAnterior,
        };
      }
    }

    // ── 4. Ranking de hashtags (suporta acentos PT-BR via Unicode classes) ──
    const hashtagMap = new Map<string, { posts: number; totalEng: number }>();
    for (const p of posts) {
      const tags = (p.caption.match(/#[\p{L}\p{N}_]+/gu) || []).map((t: string) => t.toLowerCase());
      for (const tag of new Set(tags)) {
        const cur = hashtagMap.get(tag) || { posts: 0, totalEng: 0 };
        cur.posts++;
        cur.totalEng += p.engajamento;
        hashtagMap.set(tag, cur);
      }
    }
    const topHashtags = Array.from(hashtagMap.entries())
      .map(([tag, v]) => ({
        tag,
        posts: v.posts,
        totalEng: v.totalEng,
        avgEng: v.posts > 0 ? v.totalEng / v.posts : 0,
      }))
      .filter((h) => h.posts >= 1)
      .sort((a, b) => b.avgEng - a.avgEng)
      .slice(0, 10);

    // ── 5. Marcar posts vs média ──
    // Adiciona campo "performance" em cada post: above | average | below
    for (const p of posts as Post[]) {
      if (avgEngagement === 0) {
        p.performance = "average";
      } else {
        const ratio = p.engajamento / avgEngagement;
        if (ratio >= 1.2) p.performance = "above";
        else if (ratio <= 0.8) p.performance = "below";
        else p.performance = "average";
      }
    }

    // ── 6. Engajamento semanal (tendência) ──
    const semMap = new Map<string, { posts: number; totalEng: number }>();
    for (const p of posts) {
      if (!p.data) continue;
      const d = new Date(p.data);
      // Início da semana (segunda)
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      const key = monday.toISOString().split("T")[0];
      const cur = semMap.get(key) || { posts: 0, totalEng: 0 };
      cur.posts++;
      cur.totalEng += p.engajamento;
      semMap.set(key, cur);
    }
    const engajamentoSemanal = Array.from(semMap.entries())
      .map(([data, v]) => ({
        data,
        posts: v.posts,
        avgEng: v.posts > 0 ? v.totalEng / v.posts : 0,
      }))
      .sort((a, b) => a.data.localeCompare(b.data));

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
      // Wave 7 — análises avançadas
      porTipo,                    // 1. Engajamento médio por tipo
      porDiaSemana,               // 2. Por dia da semana
      melhorDia,                  // 2. Melhor dia
      frequencia,                 // 3. Frequência de postagem
      topHashtags,                // 4. Ranking de hashtags
      engajamentoSemanal,         // 6. Tendência semanal
      insights,
      posts,                      // 5. Posts agora têm campo "performance"
      topPosts,
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
