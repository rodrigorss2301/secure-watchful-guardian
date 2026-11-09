import type { Lang } from "@/lib/i18n";

const LOCALE: Record<Lang, string> = { pt: "pt-BR", en: "en-US" };

type DateInput = string | number | Date | null | undefined;

function toDate(v: DateInput): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Data e hora no idioma do app (ex.: 09/11/2026 14:32). */
export function formatDateTime(v: DateInput, lang: Lang, fallback = "—"): string {
  const d = toDate(v);
  return d ? d.toLocaleString(LOCALE[lang], { dateStyle: "short", timeStyle: "short" }) : fallback;
}

/** Só a data no idioma do app. Datas "YYYY-MM-DD" são tratadas como data local (sem deslocamento de fuso). */
export function formatDate(v: DateInput, lang: Lang, fallback = "—"): string {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, day] = v.split("-").map(Number);
    return new Date(y, m - 1, day).toLocaleDateString(LOCALE[lang]);
  }
  const d = toDate(v);
  return d ? d.toLocaleDateString(LOCALE[lang]) : fallback;
}

/** Só a hora (HH:MM) no idioma do app. */
export function formatTime(v: DateInput, lang: Lang, fallback = "—"): string {
  const d = toDate(v);
  return d ? d.toLocaleTimeString(LOCALE[lang], { hour: "2-digit", minute: "2-digit" }) : fallback;
}

export function localeOf(lang: Lang): string {
  return LOCALE[lang];
}
