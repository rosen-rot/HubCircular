"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Field, Input, describedBy } from "@/components/ui/field";
import { changePasswordAction, type PasswordState } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePasswordAction, {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      {e.form ? <Alert tone="error" role="alert">{e.form}</Alert> : null}
      <Field id="current" label="Contraseña actual (o clave temporal)" error={e.current}>
        <Input id="current" name="current" type="password" autoComplete="current-password" required aria-invalid={Boolean(e.current)} aria-describedby={describedBy("current", false, e.current)} />
      </Field>
      <Field id="next" label="Contraseña nueva" error={e.next} hint="Mínimo 12 caracteres. Una frase larga es mejor que una clave corta con símbolos.">
        <Input id="next" name="next" type="password" autoComplete="new-password" required aria-invalid={Boolean(e.next)} aria-describedby={describedBy("next", true, e.next)} />
      </Field>
      <Field id="repeat" label="Repita la contraseña nueva" error={e.repeat}>
        <Input id="repeat" name="repeat" type="password" autoComplete="new-password" required aria-invalid={Boolean(e.repeat)} aria-describedby={describedBy("repeat", false, e.repeat)} />
      </Field>
      <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Cambiar contraseña"}</Button>
    </form>
  );
}
