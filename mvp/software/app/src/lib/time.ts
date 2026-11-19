/** Las fechas se guardan en UTC y se muestran/ingresan en America/Santiago (docs/02). */
export const TIME_ZONE = "America/Santiago";

const dtf = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function localParts(utcMs: number) {
  const parts = dtf.formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: get("year"), mo: get("month"), d: get("day"), h: get("hour"), mi: get("minute"), s: get("second") };
}

function offsetMs(utcMs: number): number {
  const p = localParts(utcMs);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(utcMs / 1000) * 1000;
}

export type LocalToUtc = { ok: true; date: Date } | { ok: false; error: "format" | "nonexistent" };

/**
 * Interpreta "YYYY-MM-DDTHH:mm" (valor de <input type="datetime-local">) como hora de Santiago y la
 * convierte a UTC. Horas inexistentes por cambio de horario se rechazan; las ambiguas toman una
 * resolución determinista (la de Intl).
 */
export function santiagoLocalToUtc(local: string): LocalToUtc {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!m) return { ok: false, error: "format" };
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return { ok: false, error: "format" };
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let utc = guess - offsetMs(guess);
  const off2 = offsetMs(utc);
  utc = guess - off2;
  const back = localParts(utc);
  if (back.y !== y || back.mo !== mo || back.d !== d || back.h !== h || back.mi !== mi) {
    return { ok: false, error: "nonexistent" };
  }
  return { ok: true, date: new Date(utc) };
}

const displayFmt = new Intl.DateTimeFormat("es-CL", {
  timeZone: TIME_ZONE,
  dateStyle: "short",
  timeStyle: "short",
  hourCycle: "h23",
});

export function formatSantiago(d: Date): string {
  return displayFmt.format(d);
}

/** Valor para <input type="datetime-local"> en hora de Santiago. */
export function toSantiagoInputValue(d: Date): string {
  const p = localParts(d.getTime());
  const z = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${z(p.mo)}-${z(p.d)}T${z(p.h)}:${z(p.mi)}`;
}

/** Rango UTC [inicio, fin) que cubre los días locales from..to (inclusive), formato YYYY-MM-DD. */
export function santiagoDayRangeToUtc(from?: string, to?: string): { from?: Date; to?: Date } {
  const out: { from?: Date; to?: Date } = {};
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
    const r = santiagoLocalToUtc(`${from}T00:00`);
    if (r.ok) out.from = r.date;
  }
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    const next = new Date(`${to}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const r = santiagoLocalToUtc(`${next.toISOString().slice(0, 10)}T00:00`);
    if (r.ok) out.to = r.date;
  }
  return out;
}
