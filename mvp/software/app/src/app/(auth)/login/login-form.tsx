"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, describedBy } from "@/components/ui/field";
import { Alert } from "@/components/ui/card";
import { loginAction, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.error ? (
        <Alert tone="error" role="alert">
          {state.error}
        </Alert>
      ) : null}
      <Field id="email" label="Correo electrónico">
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus aria-describedby={describedBy("email", false)} />
      </Field>
      <Field id="password" label="Contraseña">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Ingresando…" : "Ingresar"}
      </Button>
    </form>
  );
}
