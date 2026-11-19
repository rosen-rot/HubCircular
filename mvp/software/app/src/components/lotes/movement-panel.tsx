import Link from "next/link";
import { Badge, Card, DemoBadge } from "@/components/ui/card";
import { Timeline } from "@/components/ui/timeline";
import { formatSantiago } from "@/lib/time";
import { valorizationStatus, type MovementItem } from "@/modules/movements/queries";
import { MOVEMENT_LABEL } from "@/modules/movements/schema";
import { formatBatchRef, formatMovementRef } from "@/modules/weighing/refs";
import { formatKg } from "@/modules/weighing/units";
import { VALORIZATION_TEXT, movementEvents, movementRoute } from "./batch-panel";

export const STATE_TONE = { pendiente_evidencia: "warn", pendiente_verificacion: "neutral", confirmada: "ok", rechazada: "warn", corregido: "neutral" } as const;

/** Panel lateral con el detalle y la línea de tiempo de un movimiento (despacho → evidencia → verificación). */
export function MovementPanel({
  movement,
  batchId,
  batchRef,
  demo,
  closeHref,
}: {
  movement: MovementItem;
  batchId: string;
  batchRef: number;
  demo: boolean;
  closeHref: string;
}) {
  const st = valorizationStatus(movement);
  return (
    <Card className="space-y-4 xl:sticky xl:top-4" role="region" aria-label={`Detalle del movimiento ${formatMovementRef(movement.refNo)}`} data-testid="panel-movimiento">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-brand-900">Movimiento {formatMovementRef(movement.refNo)}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge>{MOVEMENT_LABEL[movement.type]}</Badge>
            {st ? <Badge tone={STATE_TONE[st]}>{VALORIZATION_TEXT[st]}</Badge> : null}
            {demo ? <DemoBadge /> : null}
          </div>
        </div>
        <Link href={closeHref} className="rounded-lg px-2 py-1 text-sm font-semibold text-brand-700 underline">Cerrar panel</Link>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="font-semibold text-slate-700">Lote</dt><dd><Link className="font-mono text-brand-700 underline" href={`/lotes/${batchId}`}>{formatBatchRef(batchRef)}</Link></dd></div>
        <div><dt className="font-semibold text-slate-700">Cantidad</dt><dd className="font-semibold tabular-nums">{formatKg(movement.quantityG)}</dd></div>
        <div className="col-span-2"><dt className="font-semibold text-slate-700">Recorrido</dt><dd>{movementRoute(movement)}</dd></div>
        <div className="col-span-2"><dt className="font-semibold text-slate-700">Registrado</dt><dd>{formatSantiago(movement.occurredAt)} · {movement.createdByName}</dd></div>
        {movement.reason ? <div className="col-span-2"><dt className="font-semibold text-slate-700">Motivo / observación</dt><dd>{movement.reason}</dd></div> : null}
      </dl>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Trazabilidad</h3>
        <Timeline events={movementEvents(movement)} label="Trazabilidad del movimiento" />
      </div>
      <p className="text-sm">
        <Link href={`/lotes/${batchId}`} className="font-semibold text-brand-700 underline">Abrir el lote</Link>{" "}
        <span className="text-slate-700">para agregar evidencia, verificar o corregir (según su rol).</span>
      </p>
    </Card>
  );
}
