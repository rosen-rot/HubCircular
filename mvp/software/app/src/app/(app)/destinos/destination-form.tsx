"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Field, Input, Select, describedBy } from "@/components/ui/field";
import { DESTINATION_LABEL, DESTINATION_TYPES } from "@/modules/movements/schema";
import { createDestinationAction, type DestinationState } from "./actions";

export function DestinationForm() {
  const [state, action, pending] = useActionState<DestinationState, FormData>(createDestinationAction, {});
  const errors = state.errors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.ok ? <Alert tone="success" role="status">{state.ok}</Alert> : null}
      {errors.form ? <Alert tone="error" role="alert">{errors.form}</Alert> : null}
      <Field id="name" label="Nombre del destino" error={errors.name} hint="Ej.: nombre del gestor autorizado.">
        <Input id="name" name="name" required maxLength={120} autoComplete="off" aria-invalid={Boolean(errors.name)} aria-describedby={describedBy("name", true, errors.name)} />
      </Field>
      <Field id="type" label="Tipo" error={errors.type}>
        <Select id="type" name="type" required defaultValue="gestor" aria-invalid={Boolean(errors.type)} aria-describedby={describedBy("type", false, errors.type)}>
          {DESTINATION_TYPES.map((t) => (
            <option key={t} value={t}>{DESTINATION_LABEL[t]}</option>
          ))}
        </Select>
      </Field>
      <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
        <input type="checkbox" name="demo" className="h-5 w-5" /> Destino de demostración (DEMO): solo se puede usar con lotes DEMO
      </label>
      <Button type="submit" disabled={pending}>{pending ? "Creando…" : "Crear destino"}</Button>
    </form>
  );
}
