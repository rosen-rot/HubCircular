"use server";

import { redirect } from "next/navigation";
import { DomainError } from "@/lib/errors";
import { getCurrentActor } from "@/modules/identity/service";
import { parseChangePassword } from "@/modules/users/schema";
import { changeOwnPassword } from "@/modules/users/service";

export interface PasswordState {
  errors?: Record<string, string>;
}

export async function changePasswordAction(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login?next=%2Fcuenta%2Fclave");
  const parsed = parseChangePassword(Object.fromEntries(formData), actor.email);
  if (!parsed.ok) return { errors: parsed.errors };
  try {
    await changeOwnPassword(actor, parsed.value);
  } catch (err) {
    const e = err instanceof DomainError ? err : new DomainError("unexpected");
    if (e.code === "unauthenticated") redirect("/login?next=%2Fcuenta%2Fclave");
    return { errors: { [e.code === "wrong_current_password" ? "current" : "form"]: e.userMessage } };
  }
  redirect("/?clave=1");
}
