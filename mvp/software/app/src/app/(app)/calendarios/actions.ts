"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DomainError, type DomainErrorCode } from "@/lib/errors";
import { getCurrentActor } from "@/modules/identity/service";
import { parseConfirmZero, parseCreateSchedule, parseEndSchedule } from "@/modules/indicators/schedule-schema";
import { confirmZero, createSchedule, endSchedule } from "@/modules/indicators/service";

const BACK = "/calendarios";

function done(kind: string): never {
  revalidatePath(BACK);
  revalidatePath("/dashboard");
  redirect(`${BACK}?ok=${kind}`);
}

function fail(code: DomainErrorCode): never {
  redirect(`${BACK}?error=${code}`);
}

async function actorOrLogin() {
  const actor = await getCurrentActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(BACK)}`);
  return actor;
}

/** Ejecuta la operación y traduce el resultado a un redirect (con el código de error, nunca con detalles internos). */
async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const e = err instanceof DomainError ? err : new DomainError("unexpected");
    if (e.code === "unauthenticated") redirect(`/login?next=${encodeURIComponent(BACK)}`);
    return fail(e.code);
  }
}

export async function createScheduleAction(formData: FormData): Promise<void> {
  const actor = await actorOrLogin();
  const parsed = parseCreateSchedule(formData);
  if (!parsed.ok) fail(parsed.code);
  await guarded(() => createSchedule(actor, parsed.value));
  done("calendario");
}

export async function endScheduleAction(formData: FormData): Promise<void> {
  const actor = await actorOrLogin();
  const parsed = parseEndSchedule(formData);
  if (!parsed.ok) fail(parsed.code);
  await guarded(() => endSchedule(actor, parsed.value));
  done("termino");
}

export async function confirmZeroAction(formData: FormData): Promise<void> {
  const actor = await actorOrLogin();
  const parsed = parseConfirmZero(formData);
  if (!parsed.ok) fail(parsed.code);
  const r = await guarded(() => confirmZero(actor, parsed.value));
  done(r.duplicate ? "cero-repetido" : "cero");
}
