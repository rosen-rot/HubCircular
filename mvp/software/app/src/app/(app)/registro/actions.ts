"use server";

import { redirect } from "next/navigation";
import { DomainError, type DomainErrorCode } from "@/lib/errors";
import { getCurrentActor } from "@/modules/identity/service";
import { parseWeighingForm, type FieldErrors } from "@/modules/weighing/schema";
import { registerWeighing } from "@/modules/weighing/service";

export interface RegisterState {
  errors?: FieldErrors;
}

const FIELD_FOR_CODE: Partial<Record<DomainErrorCode, keyof FieldErrors>> = {
  tare_not_less_than_gross: "tareKg",
  invalid_mass: "grossKg",
  mass_too_large: "grossKg",
  container_not_found: "containerCode",
  container_inactive: "containerCode",
  material_inactive: "containerCode",
  container_required: "containerCode",
  notes_too_long: "notes",
  occurred_in_future: "occurredAtLocal",
};

export async function registerWeighingAction(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login?next=%2Fregistro");

  const parsed = parseWeighingForm(Object.fromEntries(formData));
  if (!parsed.ok) return { errors: parsed.errors };

  let destination: string;
  try {
    // El servidor recalcula el neto y valida todo; lo que mostró el navegador es solo una vista previa.
    const result = await registerWeighing(actor, parsed.value);
    destination = `/pesajes/${result.weighingId}?${result.duplicate ? "duplicado=1" : "nuevo=1"}`;
  } catch (err) {
    const e = err instanceof DomainError ? err : new DomainError("unexpected");
    if (e.code === "unauthenticated") redirect("/login?next=%2Fregistro");
    return { errors: { [FIELD_FOR_CODE[e.code] ?? "form"]: e.userMessage } };
  }
  redirect(destination);
}
