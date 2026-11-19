"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DomainError } from "@/lib/errors";
import { getCurrentActor } from "@/modules/identity/service";
import { parseCorrectionForm, parseEvidenceForm, parseVerificationForm } from "@/modules/movements/schema";
import { addEvidence, correctMovement, verifyMovement } from "@/modules/movements/service";

export interface PanelState {
  errors?: Record<string, string>;
  ok?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function batchPath(formData: FormData): string {
  const id = String(formData.get("batchId") ?? "");
  return UUID.test(id) ? `/lotes/${id}` : "/historial";
}

function failure(err: unknown, path: string, field: string): PanelState {
  const e = err instanceof DomainError ? err : new DomainError("unexpected");
  if (e.code === "unauthenticated") redirect(`/login?next=${encodeURIComponent(path)}`);
  return { errors: { [field]: e.userMessage } };
}

export async function addEvidenceAction(_prev: PanelState, formData: FormData): Promise<PanelState> {
  const path = batchPath(formData);
  const actor = await getCurrentActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(path)}`);
  const parsed = parseEvidenceForm(Object.fromEntries(formData));
  if (!parsed.ok) return { errors: parsed.errors };
  try {
    await addEvidence(actor, parsed.value);
  } catch (err) {
    return failure(err, path, "form");
  }
  revalidatePath(path);
  return { ok: "Evidencia registrada." };
}

export async function verifyMovementAction(_prev: PanelState, formData: FormData): Promise<PanelState> {
  const path = batchPath(formData);
  const actor = await getCurrentActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(path)}`);
  const parsed = parseVerificationForm(Object.fromEntries(formData));
  if (!parsed.ok) return { errors: parsed.errors };
  try {
    await verifyMovement(actor, parsed.value);
  } catch (err) {
    return failure(err, path, "form");
  }
  revalidatePath(path);
  return { ok: parsed.value.status === "confirmada" ? "Valorización confirmada." : "Verificación rechazada." };
}

export async function correctMovementAction(_prev: PanelState, formData: FormData): Promise<PanelState> {
  const path = batchPath(formData);
  const actor = await getCurrentActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(path)}`);
  const parsed = parseCorrectionForm(Object.fromEntries(formData));
  if (!parsed.ok) return { errors: parsed.errors };
  try {
    await correctMovement(actor, parsed.value);
  } catch (err) {
    return failure(err, path, "form");
  }
  // El formulario de corrección desaparece al quedar corregido el movimiento: el aviso viaja en la URL.
  revalidatePath(path);
  redirect(`${path}?correccion=1`);
}
