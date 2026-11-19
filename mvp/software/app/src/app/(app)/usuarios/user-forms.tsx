"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Field, Input, Select, describedBy } from "@/components/ui/field";
import { ROLES } from "@/modules/users/schema";
import { createUserAction, resetPasswordAction, type UserFormState } from "./actions";

const ROLE_LABEL = { administrador: "Administrador", operador: "Operador", lector: "Lector" } as const;

export function TempPasswordNotice({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Alert tone="warning" role="status" data-testid="clave-temporal">
      <p className="font-semibold">Clave temporal para {email}</p>
      <p className="my-2 select-all rounded bg-white px-3 py-2 font-mono text-lg tracking-wider" aria-label="Clave temporal">
        {password}
      </p>
      <p>
        Se muestra <strong>una sola vez</strong> y no queda guardada. Entréguela por un canal seguro (no por correo en claro ni por
        chat grupal). La persona deberá cambiarla en su primer ingreso; sus sesiones anteriores se cerraron.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2"
        onClick={() => navigator.clipboard?.writeText(password).then(() => setCopied(true), () => setCopied(false))}
      >
        {copied ? "Copiada" : "Copiar clave"}
      </Button>
    </Alert>
  );
}

export function ExternalCreatedNotice({ email, name }: { email: string; name: string }) {
  return (
    <Alert tone="success" role="status" data-testid="usuario-creado-externo">
      <p className="font-semibold">Perfil creado para {name} ({email}).</p>
      <p>
        El acceso se gestiona en Supabase Auth: cree o invite a esta persona en el panel de Supabase (Authentication → Users) con
        <strong> el mismo correo</strong> y correo confirmado. Su primer ingreso verificado la vincula a este perfil. HubCircular no genera
        ni guarda contraseñas en este modo.
      </p>
    </Alert>
  );
}

export function CreateUserForm({ zones }: { zones: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<UserFormState, FormData>(createUserAction, {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.temp ? <TempPasswordNotice email={state.temp.email} password={state.temp.password} /> : null}
      {state.created ? <ExternalCreatedNotice email={state.created.email} name={state.created.name} /> : null}
      {e.form ? <Alert tone="error" role="alert">{e.form}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="nu-email" label="Correo electrónico" error={e.email}>
          <Input id="nu-email" name="email" type="email" autoComplete="off" required aria-invalid={Boolean(e.email)} aria-describedby={describedBy("nu-email", false, e.email)} />
        </Field>
        <Field id="nu-name" label="Nombre" error={e.name}>
          <Input id="nu-name" name="name" autoComplete="off" required maxLength={120} aria-invalid={Boolean(e.name)} aria-describedby={describedBy("nu-name", false, e.name)} />
        </Field>
        <Field id="nu-role" label="Rol" error={e.role} hint="Administrador: todo. Operador: registra pesajes y movimientos. Lector: solo consulta. Detalle en Ayuda.">
          <Select id="nu-role" name="role" defaultValue="operador" aria-invalid={Boolean(e.role)} aria-describedby={describedBy("nu-role", false, e.role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </Select>
        </Field>
        <Field id="nu-zone" label="Zona" help="ambito" error={e.zoneId} hint="El operador necesita una zona. «Todas» da acceso a todas las zonas.">
          <Select id="nu-zone" name="zoneId" defaultValue="" aria-invalid={Boolean(e.zoneId)} aria-describedby={describedBy("nu-zone", true, e.zoneId)}>
            <option value="">Todas las zonas</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>{z.name}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Button type="submit" disabled={pending}>{pending ? "Creando…" : "Crear usuario"}</Button>
    </form>
  );
}

export function ResetPasswordForm({ userId, email, name }: { userId: string; email: string; name: string }) {
  const [state, action, pending] = useActionState<UserFormState, FormData>(resetPasswordAction, {});
  return (
    <form action={action} className="mt-2 space-y-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="email" value={email} />
      {state.errors?.form ? <Alert tone="error" role="alert">{state.errors.form}</Alert> : null}
      {state.temp ? <TempPasswordNotice email={state.temp.email || email} password={state.temp.password} /> : null}
      <Button type="submit" variant="outline" size="sm" disabled={pending} aria-label={`Restablecer contraseña de ${name}`}>
        {pending ? "Generando…" : "Restablecer contraseña"}
      </Button>
    </form>
  );
}
