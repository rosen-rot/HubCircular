"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Term } from "@/components/help/info-tip";
import { Alert, DemoBadge } from "@/components/ui/card";
import { Field, Input, Select, Textarea, describedBy } from "@/components/ui/field";
import { DESTINATION_LABEL, MOVEMENT_LABEL, MOVEMENT_TYPES, type DestinationType, type MovementType } from "@/modules/movements/schema";
import { formatBatchRef } from "@/modules/weighing/refs";
import { formatGrams, formatKg, parseKgToGrams } from "@/modules/weighing/units";
import { registerMovementAction, type MovementState } from "./actions";

export interface BatchChoice {
  id: string;
  refNo: number;
  materialName: string;
  dataOrigin: "real" | "demo";
  totalG: number;
  balances: { zoneId: string; zoneName: string; balanceG: number }[];
}
export interface DestinationChoice {
  id: string;
  name: string;
  type: DestinationType;
  dataOrigin: "real" | "demo";
}

const HELP: Record<MovementType, string> = {
  traslado: "Mueve saldo entre ubicaciones. La captación y la masa total del lote no cambian.",
  despacho: "Entrega material a un gestor. Queda «pendiente de verificación» hasta registrar evidencia y confirmarla; no se declara valorizado.",
  reutilizacion: "Material que se reutiliza internamente. Descuenta saldo.",
  rechazo: "Material que no se puede aceptar. Exige un motivo y descuenta saldo.",
  ajuste: "Corrección de inventario (solo administradores). Exige un motivo.",
};

export function MovementForm({
  batches,
  destinations,
  zones,
  initialBatchId,
  canAdjust,
  idempotencyKey,
}: {
  batches: BatchChoice[];
  destinations: DestinationChoice[];
  zones: { id: string; name: string }[];
  initialBatchId: string;
  canAdjust: boolean;
  idempotencyKey: string;
}) {
  const [state, action, pending] = useActionState<MovementState, FormData>(registerMovementAction, {});
  const errors = state.errors ?? {};

  const [batchId, setBatchId] = useState(initialBatchId);
  const [type, setType] = useState<MovementType | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dest, setDest] = useState("");
  const [qty, setQty] = useState("");
  const [sign, setSign] = useState<"sube" | "baja">("baja");
  const [reason, setReason] = useState("");
  const [occurredAt, setOccurredAt] = useState("");

  const batch = batches.find((b) => b.id === batchId) ?? null;
  const types = MOVEMENT_TYPES.filter((t) => t !== "ajuste" || canAdjust);
  const fromZoneId = from || batch?.balances[0]?.zoneId || "";
  const available = batch?.balances.find((b) => b.zoneId === (from || batch.balances[0]?.zoneId))?.balanceG ?? null;

  const destOptions =
    !batch || !type
      ? []
      : destinations.filter(
          (d) => d.dataOrigin === batch.dataOrigin && (type === "reutilizacion" ? d.type === "reutilizacion" : d.type !== "reutilizacion"),
        );

  const q = parseKgToGrams(qty);
  const exceeds = type && type !== "ajuste" && q.ok && available !== null && q.grams > available;
  const needsFrom = type === "traslado" || type === "despacho" || type === "reutilizacion" || type === "rechazo" || (type === "ajuste" && sign === "baja");
  const needsTo = type === "traslado" || (type === "ajuste" && sign === "sube");
  const needsDest = type === "despacho" || type === "reutilizacion";
  const reasonRequired = type === "rechazo" || type === "ajuste";

  const summaryRef = useRef<HTMLDivElement>(null);
  const errorKeys = Object.keys(errors).join(",");
  useEffect(() => {
    if (errorKeys) summaryRef.current?.focus();
  }, [errorKeys, state]);
  const errorList = Object.entries(errors);

  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      {errorList.length > 0 ? (
        <div ref={summaryRef} tabIndex={-1} role="alert" aria-labelledby="errores-titulo">
          <Alert tone="error">
            <p id="errores-titulo" className="font-semibold">No se registró el movimiento. Revise lo siguiente:</p>
            <ul className="mt-1 list-disc pl-5">
              {errorList.map(([k, v]) => (
                <li key={k}>{v}</li>
              ))}
            </ul>
          </Alert>
        </div>
      ) : null}

      <Field id="batchId" label="Lote" help="lote" error={errors.batchId}>
        <Select
          id="batchId"
          name="batchId"
          required
          value={batchId}
          onChange={(e) => {
            setBatchId(e.target.value);
            setFrom("");
            setTo("");
            setDest("");
          }}
          aria-invalid={Boolean(errors.batchId)}
          aria-describedby={describedBy("batchId", false, errors.batchId)}
        >
          <option value="">Seleccione un lote…</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {formatBatchRef(b.refNo)} — {b.materialName} — saldo {formatKg(b.totalG)}
              {b.dataOrigin === "demo" ? " (DEMO)" : ""}
            </option>
          ))}
        </Select>
      </Field>

      {batch ? (
        <div className="rounded-lg bg-brand-50 p-3 text-sm" aria-live="polite">
          <p className="font-semibold">
            <Term k="saldo">Saldo por ubicación</Term> {batch.dataOrigin === "demo" ? <DemoBadge /> : null}
          </p>
          <ul className="mt-1">
            {batch.balances.map((b) => (
              <li key={b.zoneId}>
                {b.zoneName}: <span className="font-semibold tabular-nums">{formatKg(b.balanceG)}</span> ({formatGrams(b.balanceG)})
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Field id="type" label="Tipo de movimiento" help="movimiento" error={errors.type} hint={type ? HELP[type] : undefined}>
        <Select
          id="type"
          name="type"
          required
          value={type}
          onChange={(e) => setType(e.target.value as MovementType | "")}
          aria-invalid={Boolean(errors.type)}
          aria-describedby={describedBy("type", Boolean(type), errors.type)}
        >
          <option value="">Seleccione…</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {MOVEMENT_LABEL[t]}
            </option>
          ))}
        </Select>
      </Field>

      {type === "ajuste" ? (
        <fieldset className="space-y-1">
          <legend className="mb-1 text-sm font-semibold">El ajuste…</legend>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="radio" name="adjustSign" value="baja" checked={sign === "baja"} onChange={() => setSign("baja")} className="h-5 w-5" /> Disminuye el saldo
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="radio" name="adjustSign" value="sube" checked={sign === "sube"} onChange={() => setSign("sube")} className="h-5 w-5" /> Aumenta el saldo
          </label>
        </fieldset>
      ) : null}

      {batch && type && needsFrom ? (
        <Field id="from" label={type === "traslado" ? "Ubicación de origen" : "Ubicación"} help="zona" error={errors.from} hint="Zona donde está el material.">
          <Select
            id="from"
            name="from"
            required
            value={fromZoneId}
            onChange={(e) => setFrom(e.target.value)}
            aria-invalid={Boolean(errors.from)}
            aria-describedby={describedBy("from", true, errors.from)}
          >
            {batch.balances.map((b) => (
              <option key={b.zoneId} value={b.zoneId}>
                {b.zoneName} — {formatKg(b.balanceG)}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {batch && type && needsTo ? (
        <Field id="to" label={type === "traslado" ? "Ubicación de destino" : "Ubicación"} help="zona" error={errors.to}>
          <Select
            id="to"
            name="to"
            required
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-invalid={Boolean(errors.to)}
            aria-describedby={describedBy("to", false, errors.to)}
          >
            <option value="">Seleccione…</option>
            {zones
              .filter((z) => type !== "traslado" || z.id !== fromZoneId)
              .map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
          </Select>
        </Field>
      ) : null}

      {batch && needsDest ? (
        <Field
          id="destinationId"
          label="Destino"
          help="destino"
          error={errors.destinationId}
          hint={destOptions.length === 0 ? "No hay destinos activos de este tipo. Pida a un administrador que cree uno." : undefined}
        >
          <Select
            id="destinationId"
            name="destinationId"
            required
            value={dest}
            onChange={(e) => setDest(e.target.value)}
            aria-invalid={Boolean(errors.destinationId)}
            aria-describedby={describedBy("destinationId", destOptions.length === 0, errors.destinationId)}
          >
            <option value="">Seleccione un destino…</option>
            {destOptions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({DESTINATION_LABEL[d.type]})
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <Field id="quantityKg" label="Cantidad (kg)" error={errors.quantityKg} hint="Use coma o punto: 9,00">
        <Input
          id="quantityKg"
          name="quantityKg"
          inputMode="decimal"
          autoComplete="off"
          required
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          aria-invalid={Boolean(errors.quantityKg)}
          aria-describedby={describedBy("quantityKg", true, errors.quantityKg)}
        />
      </Field>
      {exceeds ? (
        <p className="text-sm font-medium text-amber-900" role="status">
          La cantidad supera el saldo disponible en esa ubicación ({formatKg(available ?? 0)}). El servidor la rechazará.
        </p>
      ) : null}

      {type ? (
        <Field
          id="reason"
          label={reasonRequired ? "Motivo (obligatorio)" : "Observaciones (opcional)"}
          error={errors.reason}
          hint="Máximo 500 caracteres."
        >
          <Textarea
            id="reason"
            name="reason"
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={Boolean(errors.reason)}
            aria-describedby={describedBy("reason", true, errors.reason)}
          />
        </Field>
      ) : null}

      <details className="rounded-lg border border-slate-300 bg-white p-4" open={Boolean(errors.occurredAtLocal)}>
        <summary className="cursor-pointer text-sm font-semibold">Fecha y hora del movimiento (opcional: por defecto, ahora)</summary>
        <div className="mt-3">
          <Field id="occurredAtLocal" label="Fecha y hora (hora de Chile)" help="hora_chile" error={errors.occurredAtLocal} hint="Solo si el movimiento ocurrió antes de registrarlo.">
            <Input
              id="occurredAtLocal"
              name="occurredAtLocal"
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              aria-invalid={Boolean(errors.occurredAtLocal)}
              aria-describedby={describedBy("occurredAtLocal", true, errors.occurredAtLocal)}
            />
          </Field>
        </div>
      </details>

      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending}>
        {pending ? "Registrando…" : "Confirmar movimiento"}
      </Button>
    </form>
  );
}
