import type { DomainErrorCode } from "@/lib/errors";
import { isValidDateString } from "@/lib/time";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Raw = FormData | Record<string, FormDataEntryValue | FormDataEntryValue[] | null | undefined>;
const all = (raw: Raw, k: string): string[] => {
  if (raw instanceof FormData) return raw.getAll(k).filter((v): v is string => typeof v === "string");
  const v = raw[k];
  return (Array.isArray(v) ? v : v == null ? [] : [v]).filter((x): x is string => typeof x === "string");
};
const one = (raw: Raw, k: string) => all(raw, k)[0]?.trim() ?? "";

export type Parsed<T> = { ok: true; value: T } | { ok: false; code: DomainErrorCode };

export function parseCreateSchedule(raw: Raw): Parsed<{ containerId: string; weekdays: number[]; startOn: string }> {
  const containerId = one(raw, "containerId");
  if (!UUID.test(containerId)) return { ok: false, code: "validation" };
  const days = all(raw, "weekday").map((d) => (/^[1-7]$/.test(d) ? Number(d) : NaN));
  if (days.length === 0 || days.some(Number.isNaN)) return { ok: false, code: "weekdays_invalid" };
  const startOn = one(raw, "startOn");
  if (!isValidDateString(startOn)) return { ok: false, code: "schedule_start_invalid" };
  return { ok: true, value: { containerId, weekdays: [...new Set(days)].sort((a, b) => a - b), startOn } };
}

export function parseEndSchedule(raw: Raw): Parsed<{ scheduleId: string; endOn: string }> {
  const scheduleId = one(raw, "scheduleId");
  if (!UUID.test(scheduleId)) return { ok: false, code: "validation" };
  const endOn = one(raw, "endOn");
  if (!isValidDateString(endOn)) return { ok: false, code: "schedule_end_invalid" };
  return { ok: true, value: { scheduleId, endOn } };
}

export function parseConfirmZero(raw: Raw): Parsed<{ containerId: string; note: string | null }> {
  const containerId = one(raw, "containerId");
  if (!UUID.test(containerId)) return { ok: false, code: "validation" };
  const note = one(raw, "note").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  if (note.length > 500) return { ok: false, code: "notes_too_long" };
  return { ok: true, value: { containerId, note: note || null } };
}
