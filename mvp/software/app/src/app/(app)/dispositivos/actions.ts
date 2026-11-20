"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DomainError } from "@/lib/errors";
import { parseCreateDevice, parseDeviceId } from "@/modules/devices/schema";
import { createDevice, revokeDevice, rotateDeviceToken } from "@/modules/devices/service";
import { getCurrentActor } from "@/modules/identity/service";

export interface DeviceFormState {
  errors?: Record<string, string>;
  /** Credencial: se muestra UNA vez en esta respuesta y no se guarda en ningún otro lado. */
  token?: { code: string; value: string; kind: "creado" | "rotado" };
}

async function actorOrLogin() {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login?next=%2Fdispositivos");
  return actor;
}

function failure(err: unknown, field = "form"): DeviceFormState {
  const e = err instanceof DomainError ? err : new DomainError("unexpected");
  if (e.code === "unauthenticated") redirect("/login?next=%2Fdispositivos");
  const target =
    e.code === "device_exists" || e.code === "device_invalid" ? "code" : e.code === "container_not_found" || e.code === "container_inactive" ? "containerId" : field;
  return { errors: { [target]: e.userMessage } };
}

export async function createDeviceAction(_prev: DeviceFormState, formData: FormData): Promise<DeviceFormState> {
  const actor = await actorOrLogin();
  const parsed = parseCreateDevice(Object.fromEntries(formData));
  if (!parsed.ok) return { errors: parsed.errors };
  try {
    const r = await createDevice(actor, parsed.value);
    revalidatePath("/dispositivos");
    return { token: { code: parsed.value.code, value: r.token, kind: "creado" } };
  } catch (err) {
    return failure(err);
  }
}

export async function rotateTokenAction(_prev: DeviceFormState, formData: FormData): Promise<DeviceFormState> {
  const actor = await actorOrLogin();
  const id = parseDeviceId(Object.fromEntries(formData));
  if (!id) return { errors: { form: "Dispositivo no válido. Recargue la página." } };
  try {
    const r = await rotateDeviceToken(actor, id);
    revalidatePath("/dispositivos");
    return { token: { code: String(formData.get("code") ?? "").slice(0, 64), value: r.token, kind: "rotado" } };
  } catch (err) {
    return failure(err);
  }
}

export async function revokeDeviceAction(formData: FormData): Promise<void> {
  const actor = await actorOrLogin();
  const id = parseDeviceId(Object.fromEntries(formData));
  if (!id) redirect("/dispositivos?error=validation");
  try {
    await revokeDevice(actor, id);
  } catch (err) {
    const e = err instanceof DomainError ? err : new DomainError("unexpected");
    if (e.code === "unauthenticated") redirect("/login?next=%2Fdispositivos");
    redirect(`/dispositivos?error=${encodeURIComponent(e.code)}`);
  }
  revalidatePath("/dispositivos");
  redirect("/dispositivos?ok=revocado");
}
