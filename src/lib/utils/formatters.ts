/**
 * Formatadores de valores: R$, %, datas, números.
 *
 * Convenções:
 *  - R$ usa pt-BR (separador . pra milhar, , pra decimal)
 *  - Datas mostradas como dd/mm/aaaa (ou dd/mm pra labels curtas)
 *  - Compact: R$ 85.9M, R$ 1.7M, R$ 460k, R$ 460
 */

/** R$ 1.234.567,89 — formato BR completo. */
export function formatBRL(valor: number, opts?: { semSimbolo?: boolean }): string {
  if (!Number.isFinite(valor)) return "—";
  const formatted = valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return opts?.semSimbolo ? formatted.replace("R$", "").trim() : formatted;
}

/** R$ 85,9M / R$ 1,7M / R$ 460k / R$ 460 — formato compacto pra KPIs. */
export function formatBRLCompact(valor: number): string {
  if (!Number.isFinite(valor)) return "—";
  const abs = Math.abs(valor);
  const sinal = valor < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sinal}R$ ${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 1_000) return `${sinal}R$ ${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `${sinal}R$ ${abs.toFixed(0)}`;
}

/** 28,2% — percentual com 1 casa. */
export function formatPct(valor: number, opts?: { casas?: number }): string {
  if (!Number.isFinite(valor)) return "—";
  const casas = opts?.casas ?? 1;
  return `${(valor * 100).toFixed(casas).replace(".", ",")}%`;
}

/** 28,2 — número com casas decimais (sem o símbolo %). Aceita 0.282 OU 28.2 — converte se < 1.5. */
export function formatPctSemSimbolo(valor: number, casas: number = 1): string {
  if (!Number.isFinite(valor)) return "—";
  const v = valor <= 1.5 ? valor * 100 : valor;
  return v.toFixed(casas).replace(".", ",");
}

/** 1.234 — número inteiro com separador de milhar BR. */
export function formatInt(valor: number): string {
  if (!Number.isFinite(valor)) return "—";
  return Math.round(valor).toLocaleString("pt-BR");
}

/** 1.234,5 — número decimal BR. */
export function formatNum(valor: number, casas: number = 1): string {
  if (!Number.isFinite(valor)) return "—";
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** dd/mm/aaaa — Date ou string ISO. */
export function formatData(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d + (d.length === 10 ? "T12:00:00" : "")) : d;
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** dd/mm — versão curta pra labels de gráficos. */
export function formatDataCurta(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d + (d.length === 10 ? "T12:00:00" : "")) : d;
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}

/** "Mai/26" — mês abreviado + ano 2 dígitos. */
export function formatMesAno(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d + (d.length === 7 ? "-01T12:00:00" : "T12:00:00")) : d;
  if (Number.isNaN(date.getTime())) return "—";
  const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${MESES[date.getMonth()]}/${String(date.getFullYear()).slice(-2)}`;
}

/** "há 3 dias", "há 2 meses" — tempo relativo em PT-BR. */
export function formatTempoRelativo(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d + (d.length === 10 ? "T12:00:00" : "")) : d;
  if (Number.isNaN(date.getTime())) return "—";
  const diff = Date.now() - date.getTime();
  const dias = Math.floor(diff / 86_400_000);
  if (dias === 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  if (meses === 1) return "há 1 mês";
  if (meses < 12) return `há ${meses} meses`;
  const anos = Math.floor(dias / 365);
  return anos === 1 ? "há 1 ano" : `há ${anos} anos`;
}

/** Trunca string e adiciona "…" se exceder. */
export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
