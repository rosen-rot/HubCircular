"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { InfoTip, Term } from "@/components/help/info-tip";
import { Alert, DemoBadge } from "@/components/ui/card";
import { Field, Input, Select, Textarea, describedBy } from "@/components/ui/field";
import { formatGrams, formatKg, parseKgToGrams, previewNetGrams } from "@/modules/weighing/units";
import { registerWeighingAction, type RegisterState } from "./actions";

export interface ContainerChoice {
  code: string;
  label: string;
  materialName: string;
  zoneName: string;
  tareG: number | null;
  demo: boolean;
}

const kgInput = (g: number) => (g / 1000).toString().replace(".", ",");

export function WeighingForm({
  containers,
  initialCode,
  idempotencyKey,
}: {
  containers: ContainerChoice[];
  initialCode: string;
  idempotencyKey: string;
}) {
  const [state, action, pending] = useActionState<RegisterState, FormData>(registerWeighingAction, {});
  const errors = state.errors ?? {};

  const initial = containers.find((c) => c.code === initialCode) ?? null;
  const [code, setCode] = useState(initial?.code ?? "");
  const [gross, setGross] = useState("");
  const [tare, setTare] = useState(initial?.tareG != null ? kgInput(initial.tareG) : "");
  const [tareTouched, setTareTouched] = useState(false);
  const [notes, setNotes] = useState("");
  const [contamination, setContamination] = useState(false);
  const [occurredAt, setOccurredAt] = useState("");

  const container = containers.find((c) => c.code === code) ?? null;

  // La tara nominal del contenedor solo precarga el campo mientras la persona no lo haya editado.
  function onContainerChange(next: string) {
    setCode(next);
    const c = containers.find((x) => x.code === next);
    if (!tareTouched) setTare(c?.tareG != null ? kgInput(c.tareG) : "");
  }

  const net = useMemo(() => {
    const g = parseKgToGrams(gross);
    const t = parseKgToGrams(tare);
    if (!g.ok || !t.ok) return { kind: "pending" as const };
    const n = previewNetGrams(g.grams, t.grams);
    return n === null ? { kind: "invalid" as const } : { kind: "ok" as const, grams: n };
  }, [gross, tare]);

  // Al fallar, el foco va al resumen de errores (accesibilidad para lectores de pantalla y teclado).
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
            <p id="errores-titulo" className="font-semibold">
              No se registró el pesaje. Revise lo siguiente:
            </p>
            <ul className="mt-1 list-disc pl-5">
              {errorList.map(([k, v]) => (
                <li key={k}>{v}</li>
              ))}
            </ul>
          </Alert>
        </div>
      ) : null}

      <Field id="containerCode" label="Contenedor" help="contenedor" error={errors.containerCode} hint="Si llegó por un QR, el contenedor ya viene seleccionado. El QR solo identifica el contenedor; no otorga permisos.">
        <Select
          id="containerCode"
          name="containerCode"
          required
          value={code}
          onChange={(e) => onContainerChange(e.target.value)}
          aria-invalid={Boolean(errors.containerCode)}
          aria-describedby={describedBy("containerCode", true, errors.containerCode)}
        >
          <option value="">Seleccione un contenedor…</option>
          {containers.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>

      {container ? (
        <div className="rounded-lg bg-brand-50 p-3 text-sm" aria-live="polite">
          <p>
            <span className="font-semibold"><Term k="material">Material:</Term></span> {container.materialName} · <span className="font-semibold"><Term k="zona">Zona:</Term></span> {container.zoneName}{" "}
            {container.demo ? <DemoBadge /> : null}
          </p>
          {container.demo ? (
            <p className="mt-1 text-amber-900">Contenedor de demostración: este registro no cuenta como medición real.</p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="grossKg" label="Peso bruto: recipiente + material (kg)" help="bruto" error={errors.grossKg} hint="Lo que marca la balanza con todo junto. Use coma o punto: 6,40">
          <Input
            id="grossKg"
            name="grossKg"
            inputMode="decimal"
            autoComplete="off"
            required
            value={gross}
            onChange={(e) => setGross(e.target.value)}
            aria-invalid={Boolean(errors.grossKg)}
            aria-describedby={describedBy("grossKg", true, errors.grossKg)}
          />
        </Field>
        <Field id="tareKg" label="Tara: recipiente vacío (kg)" help="tara" error={errors.tareKg} hint="Peso del recipiente solo, sin material. Se propone la tara de referencia del contenedor.">
          <Input
            id="tareKg"
            name="tareKg"
            inputMode="decimal"
            autoComplete="off"
            required
            value={tare}
            onChange={(e) => {
              setTare(e.target.value);
              setTareTouched(true);
            }}
            aria-invalid={Boolean(errors.tareKg)}
            aria-describedby={describedBy("tareKg", true, errors.tareKg)}
          />
        </Field>
      </div>

      <div className="rounded-lg border border-slate-300 bg-white p-4" aria-live="polite" data-testid="net-preview">
        <p className="text-sm text-slate-700">
          <Term k="neto">Peso neto: solo el material (vista previa)</Term>
        </p>
        {net.kind === "ok" ? (
          <p className="text-2xl font-bold text-brand-900">
            {formatKg(net.grams)} <span className="text-base font-normal text-slate-600">({formatGrams(net.grams)})</span>
          </p>
        ) : net.kind === "invalid" ? (
          <p className="font-semibold text-red-800">La tara debe ser menor que el peso bruto.</p>
        ) : (
          <p className="text-slate-600">Ingrese peso bruto y tara.</p>
        )}
        <p className="mt-1 text-xs text-slate-600">El servidor vuelve a calcular y validar el neto al confirmar.</p>
      </div>

      <details className="rounded-lg border border-slate-300 bg-white p-4" open={Boolean(errors.occurredAtLocal)}>
        <summary className="cursor-pointer text-sm font-semibold">Fecha y hora del pesaje (opcional: por defecto, ahora)</summary>
        <div className="mt-3">
          <Field id="occurredAtLocal" label="Fecha y hora (hora de Chile)" help="hora_chile" error={errors.occurredAtLocal} hint="Solo si el pesaje se hizo antes de registrarlo.">
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

      <div className="flex flex-wrap items-center">
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            name="contaminationObserved"
            checked={contamination}
            onChange={(e) => setContamination(e.target.checked)}
            className="h-5 w-5"
          />
          Contaminación visible en el material
        </label>
        <InfoTip k="contaminacion" />
      </div>

      <Field id="notes" label="Observaciones (opcional)" error={errors.notes} hint="Máximo 500 caracteres.">
        <Textarea
          id="notes"
          name="notes"
          maxLength={500}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          aria-invalid={Boolean(errors.notes)}
          aria-describedby={describedBy("notes", true, errors.notes)}
        />
      </Field>

      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending}>
        {pending ? "Registrando…" : "Confirmar pesaje"}
      </Button>
    </form>
  );
}
