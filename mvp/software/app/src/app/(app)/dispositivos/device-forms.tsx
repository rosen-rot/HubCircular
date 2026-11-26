"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Field, Input, Select, describedBy } from "@/components/ui/field";
import { createDeviceAction, rotateTokenAction, type DeviceFormState } from "./actions";

export function TokenNotice({ code, value, kind }: { code: string; value: string; kind: "creado" | "rotado" }) {
  const [copied, setCopied] = useState(false);
  return (
    <Alert tone="warning" role="status" data-testid="token-dispositivo">
      <p className="font-semibold">
        Credencial {kind === "creado" ? "del dispositivo nuevo" : "nueva"} {code}
      </p>
      <p className="my-2 break-all select-all rounded bg-white px-3 py-2 font-mono text-sm" aria-label="Credencial del dispositivo">
        {value}
      </p>
      <p>
        Se muestra <strong>una sola vez</strong> y no queda guardada: HubCircular solo conserva su huella. Cópiela ahora a la configuración
        del equipo (o del simulador) por un canal seguro; no la envíe por correo en claro ni por chat grupal. Si se pierde, rote la credencial.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2"
        onClick={() => navigator.clipboard?.writeText(value).then(() => setCopied(true), () => setCopied(false))}
      >
        {copied ? "Copiada" : "Copiar credencial"}
      </Button>
    </Alert>
  );
}

export function CreateDeviceForm({ containers }: { containers: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState<DeviceFormState, FormData>(createDeviceAction, {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.token ? <TokenNotice {...state.token} /> : null}
      {e.form ? <Alert tone="error" role="alert">{e.form}</Alert> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="nd-code" label="Código del dispositivo" error={e.code} hint="Ej.: HUB-ESP32-001. Es el identificador que el equipo envía en cada lectura; no es una clave.">
          <Input id="nd-code" name="code" autoComplete="off" required maxLength={64} aria-invalid={Boolean(e.code)} aria-describedby={describedBy("nd-code", true, e.code)} />
        </Field>
        <Field id="nd-name" label="Nombre" error={e.name}>
          <Input id="nd-name" name="name" autoComplete="off" required maxLength={120} aria-invalid={Boolean(e.name)} aria-describedby={describedBy("nd-name", false, e.name)} />
        </Field>
        <Field id="nd-container" label="Contenedor donde está instalado" error={e.containerId} hint="Un dispositivo DEMO o real hereda el origen del contenedor.">
          <Select id="nd-container" name="containerId" defaultValue="" required aria-invalid={Boolean(e.containerId)} aria-describedby={describedBy("nd-container", true, e.containerId)}>
            <option value="" disabled>Seleccione…</option>
            {containers.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </Select>
        </Field>
        <Field id="nd-stale" label="Minutos sin datos para marcarlo desactualizado" help="estado_dispositivo" error={e.staleAfterMinutes}>
          <Input id="nd-stale" name="staleAfterMinutes" inputMode="numeric" defaultValue="15" aria-invalid={Boolean(e.staleAfterMinutes)} aria-describedby={describedBy("nd-stale", false, e.staleAfterMinutes)} />
        </Field>
      </div>
      <Button type="submit" disabled={pending}>{pending ? "Creando…" : "Crear dispositivo"}</Button>
    </form>
  );
}

export function RotateTokenForm({ deviceId, code }: { deviceId: string; code: string }) {
  const [state, action, pending] = useActionState<DeviceFormState, FormData>(rotateTokenAction, {});
  return (
    <form action={action} className="mt-2 space-y-2">
      <input type="hidden" name="deviceId" value={deviceId} />
      <input type="hidden" name="code" value={code} />
      {state.errors?.form ? <Alert tone="error" role="alert">{state.errors.form}</Alert> : null}
      {state.token ? <TokenNotice {...state.token} /> : null}
      <Button type="submit" variant="outline" size="sm" disabled={pending} aria-label={`Rotar credencial de ${code} (la anterior dejará de funcionar)`}>
        {pending ? "Rotando…" : "Rotar credencial"}
      </Button>
    </form>
  );
}
