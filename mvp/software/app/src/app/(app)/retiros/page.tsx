import type { Metadata } from "next";
import { ArrowLeftRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { randomUUID } from "node:crypto";
import { Forbidden } from "@/components/forbidden";
import { Alert } from "@/components/ui/card";
import { can } from "@/modules/identity/permissions";
import { requireActorWith } from "@/modules/identity/guards";
import { listActiveZones, listDestinations, listMovableBatches } from "@/modules/movements/queries";
import { MovementForm } from "./movement-form";

export const metadata: Metadata = { title: "Movimientos de inventario" };
export const dynamic = "force-dynamic";

export default async function RetirosPage({ searchParams }: { searchParams: Promise<{ lote?: string }> }) {
  const { lote } = await searchParams;
  const { actor, allowed } = await requireActorWith("movement:create", "/retiros");
  if (!allowed) return <Forbidden what="el registro de movimientos" />;

  const batches = await listMovableBatches(actor);
  const destinations = await listDestinations(actor, { onlyActive: true });
  const zones = await listActiveZones(actor);
  const initialBatch = batches.some((b) => b.id === lote) ? (lote as string) : "";

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader icon={ArrowLeftRight} title={'Movimientos de inventario'} subtitle={<>Traslados, despachos, reutilización, rechazos y ajustes. Un movimiento cambia el saldo del lote; <strong>no</strong> modifica la captación
          registrada.</>} />
      {batches.length === 0 ? (
        <Alert tone="warning">No hay lotes con saldo disponible en su ámbito.</Alert>
      ) : (
        <MovementForm
          batches={batches}
          destinations={destinations}
          zones={zones}
          initialBatchId={initialBatch}
          canAdjust={can(actor, "movement:adjust")}
          idempotencyKey={randomUUID()}
        />
      )}
    </div>
  );
}
