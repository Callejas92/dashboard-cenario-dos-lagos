/**
 * Notificação quando um bônus cruza 1,5% pago (vira "autorizado").
 *
 * Canal: e-mail via Resend — exige RESEND_API_KEY (e opcionalmente NOTIFICATION_EMAIL).
 * Sem a key, nada é enviado nem registrado (quando configurar, notifica os pendentes).
 *
 * Anti-spam:
 *  - 1ª execução (sem registro): registra os já-autorizados SEM enviar (evita rajada).
 *  - Cap de 5 envios por rodada.
 *  - Só registra como notificado quando o envio deu certo (falha → tenta na próxima).
 */
import { list, put } from "@vercel/blob";
import type { BonusResponse } from "@/lib/bonus";

const BLOB = "config/bonus-notificados.json";
const MAX_ENVIOS_POR_RODADA = 5;

type Registro = Record<string, string>; // chaveVenda → ISO de quando notificou/registrou

async function lerRegistro(): Promise<Registro | null> {
  try {
    const { blobs } = await list({ prefix: BLOB });
    const hit = blobs.find((b) => b.pathname === BLOB) ?? blobs[0];
    if (!hit) return null; // null = primeira vez → seed silencioso
    const j = await (await fetch(`${hit.url}?_=${Date.now()}`, { cache: "no-store" })).json();
    return j && typeof j === "object" ? (j as Registro) : {};
  } catch {
    return {}; // erro transitório: segue (cap de envios limita qualquer estrago)
  }
}

async function salvarRegistro(r: Registro): Promise<void> {
  await put(BLOB, JSON.stringify(r), {
    access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json",
  });
}

async function enviarEmail(assunto: string, corpo: string): Promise<boolean> {
  const key = (process.env.RESEND_API_KEY || "").trim();
  const to = (process.env.NOTIFICATION_EMAIL || "felipeacallejas@gmail.com").trim();
  if (!key) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Dashboard Cenário <onboarding@resend.dev>",
        to: [to],
        subject: assunto,
        text: corpo,
      }),
      signal: AbortSignal.timeout(8000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** Chamado sempre que um tracking COMPLETO novo é computado (lib/bonus.ts). */
export async function detectarENotificarAutorizados(data: BonusResponse): Promise<void> {
  try {
    if (!data?.completo || !data.bonus?.length) return;
    const autorizados = data.bonus.filter((b) => b.autorizado === true && !b.cancelado);

    const registro = await lerRegistro();
    if (registro === null) {
      // Seed: marca os já-autorizados como conhecidos, sem enviar nada.
      const seed: Registro = {};
      const agora = new Date().toISOString();
      for (const b of autorizados) seed[b.chaveVenda] = agora;
      await salvarRegistro(seed);
      return;
    }

    const novos = autorizados.filter((b) => !registro[b.chaveVenda]);
    if (!novos.length) return;

    let mudou = false;
    for (const b of novos.slice(0, MAX_ENVIOS_POR_RODADA)) {
      const pct = b.valorContratado > 0 ? ((b.valorRecebido / b.valorContratado) * 100).toFixed(1) : "?";
      const ok = await enviarEmail(
        `✅ Bônus autorizado: ${b.loteId} — ${b.corretorNome || "(sem corretor)"}`,
        [
          `O cliente ${b.clienteNome || "(sem nome)"} atingiu 1,5% pago — o bônus está AUTORIZADO.`,
          ``,
          `Lote: ${b.loteId}`,
          `Corretor: ${b.corretorNome || "—"} (R$ 3.000)`,
          `Imobiliária: ${b.imobiliariaNomeFantasia || b.imobiliariaRazaoSocial || "—"} (R$ 1.000)`,
          `Pago até agora: R$ ${b.valorRecebido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (${pct}% do contrato)`,
          ``,
          `Marcar pagamento: https://dashboard.mangabaurbanismo.com.br/pipeline?tab=financeiro`,
        ].join("\n"),
      );
      if (ok) {
        registro[b.chaveVenda] = new Date().toISOString();
        mudou = true;
      }
    }
    if (mudou) await salvarRegistro(registro);
  } catch (e) {
    console.warn("notificação de bônus autorizado falhou:", e);
  }
}
