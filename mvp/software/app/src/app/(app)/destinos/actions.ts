"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DomainError } from "@/lib/errors";
import { getCurrentActor } from "@/modules/identity/service";
import { parseDestinationForm } from "@/modules/movements/schema";
import { createDestination, setDestinationActive } from "@/modules/movements/service";

export interface DestinationState {
  errors?: Record<string, string>;
  ok?: string;
}

export async function createDestinationAction(_prev: DestinationState, formData: FormData): Promise<DestinationState> {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login?next=%2Fdestinos");
  const parsed = parseDestinationForm(Object.fromEntries(formData));
  if (!parsed.ok) return { errors: parsed.errors };
  try {
    await createDestination(actor, parsed.value);
  } catch (err) {
    const e = err instanceof DomainError ? err : new DomainError("unexpected");
    if (e.code === "unauthenticated") redirect("/login?next=%2Fdestinos");
    return { errors: { [e.code === "destination_exists" || e.code === "destination_invalid" ? "name" : "form"]: e.userMessage } };
  }
  revalidatePath("/destinos");
  return { ok: `Destino «${parsed.value.name}» creado.` };
}

export async function toggleDestinationAction(formData: FormData): Promise<void> {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login?next=%2Fdestinos");
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  try {
    await setDestinationActive(actor, id, active);
  } catch (err) {
    const e = err instanceof DomainError ? err : new DomainError("unexpected");
    if (e.code === "unauthenticated") redirect("/login?next=%2Fdestinos");
    // Sin permiso o destino inexistente: la página se vuelve a cargar sin cambios.
  }
  revalidatePath("/destinos");
}
