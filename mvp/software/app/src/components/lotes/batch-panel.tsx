import Link from "next/link";
import { Badge, Card, DemoBadge } from "@/components/ui/card";
import { Timeline, type TimelineEvent } from "@/components/ui/timeline";
import { formatSantiago } from "@/lib/time";
import { BATCH_STATUS_LABEL, batchStatus } from "@/modules/inventory/filters";
import type { BatchDetail } from "@/modules/inventory/queries";
import { valorizationStatus, type MovementItem } from "@/modules/movements/queries";
import { DESTINATION_LABEL, EVIDENCE_LABEL, MOVEMENT_LABEL } from "@/modules/movements/schema";
import { formatBatchRef, formatMovementRef, formatWeighingRef } from "@/modules/weighing/refs";
import { formatKg } from "@/modules/weighing/units";

export const VALORIZATION_TEXT = {
  pendiente_evidencia: "Pendiente: sin evidencia",
  pendiente_verificacion: "Pendiente de verificación",
  confirmada: "Valorización confirmada",
  rechazada: "Verificación rechazada",
  corregido: "Corregido",
} as const;

export function movementRoute(m: Pick<MovementItem, "type" | "fromZone" | "toZone" | "destinationName" | "destinationType">): string {
  if (m.type === "traslado") return `${m.fromZone ?? "—"} → ${m.toZone ?? "—"}`;
  if (m.type === "ajuste" || m.type === "correccion") {
    if (m.fromZone && m.toZone) return `${m.fromZone} → ${m.toZone}`;
    return m.fromZone ? `Sale de ${m.fromZone}` : `Entra a ${m.toZone ?? "—"}`;
  }
  const dest = m.destinationName ? ` → ${m.destinationName}${m.destinationType ? ` (${DESTINATION_LABEL[m.destinationType]})` : ""}` : "";
  return `${m.fromZone ?? "—"}${dest}`;
}

/** Eventos de un movimiento en orden: el movimiento, luego su evidencia y sus verificaciones (solo lo que está registrado). */
export function movementEvents(m: MovementItem): TimelineEvent[] {
  const st = valorizationStatus(m);
  const ev: TimelineEvent[] = [
    {
      key: m.id,
      title: (
        <>
          {formatMovementRef(m.refNo)} · {MOVEMENT_LABEL[m.type]} · {formatKg(m.quantityG)}
        </>
      ),
      when: `${formatSantiago(m.occurredAt)} · ${m.createdByName}`,
      detail: (
        <>
          {movementRoute(m)}
          {m.reason ? <> — {m.reason}</> : null}
          {m.correctsRef !== null ? <> — corrige {formatMovementRef(m.correctsRef)}</> : null}
          {m.correctedByRef !== null ? <> — corregido por {formatMovementRef(m.correctedByRef)}</> : null}
        </>
      ),
      tone: "neutral",
    },
  ];
  for (const e of m.evidence) {
    ev.push({
      key: e.id,
      title: <>Evidencia: {EVIDENCE_LABEL[e.kind]}</>,
      when: `${formatSantiago(e.createdAt)} · ${e.createdByName}`,
      detail: <span className="font-mono">{e.reference}{e.note ? ` — ${e.note}` : ""}</span>,
      tone: "ok",
    });
  }
  for (const v of m.verifications) {
    ev.push({
      key: v.id,
      title: <>{v.status === "confirmada" ? "Verificación confirmada" : "Verificación rechazada"}</>,
      when: `${formatSantiago(v.decidedAt)} · ${v.decidedByName}`,
      detail: v.notes ?? undefined,
      tone: v.status === "confirmada" ? "ok" : "warn",
    });
  }
  if (m.type === "despacho" && (st === "pendiente_evidencia" || st === "pendiente_verificacion")) {
    ev.push({ key: `${m.id}-pend`, title: VALORIZATION_TEXT[st], detail: "Aún no se declara valorizado: falta registrar la decisión.", tone: "warn" });
  }
  return ev;
}

/** Panel lateral con el resumen y la trazabilidad de un lote. */
export function BatchPanel({ batch, movements, closeHref, canMove }: { batch: BatchDetail; movements: MovementItem[]; closeHref: string; canMove: boolean }) {
  const status = batchStatus(batch.initialG, batch.totalBalanceG);
  const events: TimelineEvent[] = [
    {
      key: "captacion",
      title: <>Captación · {formatKg(batch.initialG)}</>,
      when: formatSantiago(batch.createdAt),
      detail: (
        <>
          Pesaje <Link className="font-mono text-brand-700 underline" href={`/pesajes/${batch.weighingId}`}>{formatWeighingRef(batch.weighingRef)}</Link>
          {batch.originZoneName ? <> en {batch.originZoneName}</> : null}
        </>
      ),
      tone: "ok",
    },
    ...movements.flatMap(movementEvents),
  ];
  return (
    <Card className="space-y-4 lg:sticky lg:top-4" aria-label={`Detalle del lote ${formatBatchRef(batch.refNo)}`} role="region" data-testid="panel-lote">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-brand-900">Lote {formatBatchRef(batch.refNo)}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge tone={status === "sin_saldo" ? "neutral" : status === "parcial" ? "warn" : "ok"}>{BATCH_STATUS_LABEL[status]}</Badge>
            {batch.dataOrigin === "demo" ? <DemoBadge /> : null}
          </div>
        </div>
        <Link href={closeHref} className="rounded-lg px-2 py-1 text-sm font-semibold text-brand-700 underline">Cerrar panel</Link>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="font-semibold text-slate-700">Material</dt><dd>{batch.materialName}</dd></div>
        <div><dt className="font-semibold text-slate-700">Zona de origen</dt><dd>{batch.originZoneName ?? "—"}</dd></div>
        <div><dt className="font-semibold text-slate-700">Captación inicial</dt><dd className="font-semibold tabular-nums">{formatKg(batch.initialG)}</dd></div>
        <div><dt className="font-semibold text-slate-700">Saldo disponible</dt><dd className="font-semibold tabular-nums">{formatKg(batch.totalBalanceG)}</dd></div>
      </dl>
      {batch.balances.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Saldo por ubicación</h3>
          <ul className="mt-1 text-sm">
            {batch.balances.map((x) => (
              <li key={x.zoneId} className="flex justify-between border-b border-slate-100 py-1"><span>{x.zoneName ?? "—"}</span><span className="tabular-nums">{formatKg(x.balanceG)}</span></li>
            ))}
          </ul>
        </div>
      ) : null}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Trazabilidad</h3>
        <Timeline events={events} label="Trazabilidad del lote" />
      </div>
      <div className="flex flex-wrap gap-2 text-sm font-semibold">
        <Link href={`/lotes/${batch.id}`} className="text-brand-700 underline">Ver ficha completa</Link>
        {canMove ? <Link href={`/retiros?lote=${batch.id}`} className="text-brand-700 underline">Registrar movimiento</Link> : null}
      </div>
    </Card>
  );
}
