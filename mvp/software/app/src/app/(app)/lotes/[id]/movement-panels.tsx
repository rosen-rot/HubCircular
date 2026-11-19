"use client";

import { InfoTip } from "@/components/help/info-tip";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Field, Input, Select, Textarea, describedBy } from "@/components/ui/field";
import { EVIDENCE_KINDS, EVIDENCE_LABEL } from "@/modules/movements/schema";
import { addEvidenceAction, correctMovementAction, verifyMovementAction, type PanelState } from "./actions";

function Messages({ state }: { state: PanelState }) {
  const e = state.errors ?? {};
  return (
    <>
      {state.ok ? <Alert tone="success" role="status">{state.ok}</Alert> : null}
      {Object.keys(e).length > 0 ? (
        <Alert tone="error" role="alert">
          <ul className="list-disc pl-5">
            {Object.values(e).map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
    </>
  );
}

export function EvidenceForm({ batchId, movementId, refLabel: refNo }: { batchId: string; movementId: string; refLabel: string }) {
  const [state, action, pending] = useActionState<PanelState, FormData>(addEvidenceAction, {});
  const e = state.errors ?? {};
  const id = `ev-${movementId}`;
  return (
    <form action={action} className="mt-3 space-y-3 rounded-lg border border-slate-300 p-3" noValidate aria-label={`Agregar evidencia al movimiento ${refNo}`}>
      <p className="text-sm font-semibold">
        Agregar evidencia (referencia de texto)<InfoTip k="evidencia" />
      </p>
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="movementId" value={movementId} />
      <Messages state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${id}-kind`} label="Tipo" error={e.kind}>
          <Select id={`${id}-kind`} name="kind" defaultValue="guia_despacho" aria-invalid={Boolean(e.kind)} aria-describedby={describedBy(`${id}-kind`, false, e.kind)}>
            {EVIDENCE_KINDS.map((k) => (
              <option key={k} value={k}>{EVIDENCE_LABEL[k]}</option>
            ))}
          </Select>
        </Field>
        <Field id={`${id}-ref`} label="Referencia" error={e.reference} hint="N.º de guía, folio, asunto del correo…">
          <Input id={`${id}-ref`} name="reference" maxLength={200} autoComplete="off" aria-invalid={Boolean(e.reference)} aria-describedby={describedBy(`${id}-ref`, true, e.reference)} />
        </Field>
      </div>
      <Field id={`${id}-note`} label="Nota (opcional)" error={e.note}>
        <Input id={`${id}-note`} name="note" maxLength={500} autoComplete="off" aria-invalid={Boolean(e.note)} aria-describedby={describedBy(`${id}-note`, false, e.note)} />
      </Field>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>{pending ? "Guardando…" : "Guardar evidencia"}</Button>
    </form>
  );
}

export function VerifyForm({ batchId, movementId, refLabel: refNo, hasEvidence }: { batchId: string; movementId: string; refLabel: string; hasEvidence: boolean }) {
  const [state, action, pending] = useActionState<PanelState, FormData>(verifyMovementAction, {});
  const e = state.errors ?? {};
  const id = `vf-${movementId}`;
  return (
    <form action={action} className="mt-3 space-y-3 rounded-lg border border-slate-300 p-3" noValidate aria-label={`Verificar el despacho ${refNo}`}>
      <p className="text-sm font-semibold">
        Verificación de valorización (¿el material fue aprovechado?)<InfoTip k="valorizacion" />
      </p>
      <p className="text-sm text-slate-700">Confirmar o rechazar no mueve saldo ni crea otra salida; solo deja constancia de quién verificó y cuándo.</p>
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="movementId" value={movementId} />
      <Messages state={state} />
      <Field id={`${id}-notes`} label="Notas (obligatorias si se rechaza)" error={e.notes}>
        <Textarea id={`${id}-notes`} name="notes" maxLength={500} aria-invalid={Boolean(e.notes)} aria-describedby={describedBy(`${id}-notes`, false, e.notes)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="status" value="confirmada" size="sm" disabled={pending || !hasEvidence} title={hasEvidence ? undefined : "Registre al menos una evidencia"}>
          Confirmar valorización
        </Button>
        <Button type="submit" name="status" value="rechazada" variant="outline" size="sm" disabled={pending}>
          Rechazar verificación
        </Button>
      </div>
      {!hasEvidence ? <p className="text-sm text-slate-700">Para confirmar se necesita al menos una evidencia.</p> : null}
    </form>
  );
}

export function CorrectForm({ batchId, movementId, refLabel: refNo, idempotencyKey }: { batchId: string; movementId: string; refLabel: string; idempotencyKey: string }) {
  const [state, action, pending] = useActionState<PanelState, FormData>(correctMovementAction, {});
  const e = state.errors ?? {};
  const id = `co-${movementId}`;
  return (
    <form action={action} className="mt-3 space-y-3 rounded-lg border border-amber-400 bg-amber-50 p-3" noValidate aria-label={`Corregir el movimiento ${refNo}`}>
      <p className="text-sm font-semibold">
        Corregir este movimiento<InfoTip k="correccion" />
      </p>
      <p className="text-sm text-slate-800">No se borra ni se edita: se registra un movimiento nuevo de efecto inverso, con su motivo, autor y fecha.</p>
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="movementId" value={movementId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <Messages state={state} />
      <Field id={`${id}-reason`} label="Motivo de la corrección" error={e.reason} hint="Mínimo 5 caracteres.">
        <Textarea id={`${id}-reason`} name="reason" maxLength={500} aria-invalid={Boolean(e.reason)} aria-describedby={describedBy(`${id}-reason`, true, e.reason)} />
      </Field>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>{pending ? "Corrigiendo…" : "Registrar corrección"}</Button>
    </form>
  );
}
