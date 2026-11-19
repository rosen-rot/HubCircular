"use server";

import { redirect } from "next/navigation";
import { DomainError, type DomainErrorCode } from "@/lib/errors";
import { getCurrentActor } from "@/modules/identity/service";
import { parseMovementForm, type MovementFieldErrors } from "@/modules/movements/schema";
import { registerMovement } from "@/modules/movements/service";

export interface MovementState {
  errors?: MovementFieldErrors;
}

const FIELD_FOR_CODE: Partial<Record<DomainErrorCode, keyof MovementFieldErrors>> = {
  invalid_mass: "quantityKg",
  mass_too_large: "quantityKg",
  insufficient_balance: "quantityKg",
  batch_not_found: "batchId",
  invalid_movement_type: "type",
  invalid_movement_shape: "form",
  destination_invalid: "destinationId",
  destination_inactive: "destinationId",
  zone_invalid: "from",
  reason_required: "reason",
  notes_too_long: "reason",
  occurred_in_future: "occurredAtLocal",
  occurred_before_batch: "occurredAtLocal",
};

export async function registerMovementAction(_prev: MovementState, formData: FormData): Promise<MovementState> {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login?next=%2Fretiros");

  const parsed = parseMovementForm(Object.fromEntries(formData));
  if (!parsed.ok) return { errors: parsed.errors };

  let destination: string;
  try {
    // El saldo, el ámbito y la forma del movimiento los valida la base de datos con el lote bloqueado.
    const result = await registerMovement(actor, parsed.value);
    destination = `/lotes/${parsed.value.batchId}?${result.duplicate ? "duplicado=1" : "movimiento=1"}`;
  } catch (err) {
    const e = err instanceof DomainError ? err : new DomainError("unexpected");
    if (e.code === "unauthenticated") redirect("/login?next=%2Fretiros");
    return { errors: { [FIELD_FOR_CODE[e.code] ?? "form"]: e.userMessage } };
  }
  redirect(destination);
}
