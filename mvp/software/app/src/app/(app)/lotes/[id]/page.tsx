import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Card, DemoBadge } from "@/components/ui/card";
import { formatSantiago } from "@/lib/time";
import { requireActor } from "@/modules/identity/guards";
import { can } from "@/modules/identity/permissions";
import { getBatchDetail } from "@/modules/inventory/queries";
import { formatBatchRef, formatWeighingRef } from "@/modules/weighing/refs";
import { formatGrams, formatKg } from "@/modules/weighing/units";

export const metadata: Metadata = { title: "Lote" };

export default async function LotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor(`/lotes/${id}`);
  const b = can(actor, "batch:read") ? await getBatchDetail(actor, id) : null;
  if (!b) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-brand-900">Lote {formatBatchRef(b.refNo)}</h1>
        {b.dataOrigin === "demo" ? <DemoBadge /> : null}
      </div>
      <Card>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div><dt className="text-sm font-semibold text-slate-700">Material</dt><dd>{b.materialName}</dd></div>
          <div><dt className="text-sm font-semibold text-slate-700">Zona de origen</dt><dd>{b.originZoneName ?? "—"}</dd></div>
          <div><dt className="text-sm font-semibold text-slate-700">Cantidad inicial (captación)</dt><dd className="font-semibold">{formatKg(b.initialG)} ({formatGrams(b.initialG)})</dd></div>
          <div><dt className="text-sm font-semibold text-slate-700">Saldo disponible</dt><dd className="font-semibold">{formatKg(b.totalBalanceG)} ({formatGrams(b.totalBalanceG)})</dd></div>
          <div><dt className="text-sm font-semibold text-slate-700">Creado</dt><dd>{formatSantiago(b.createdAt)}</dd></div>
          <div><dt className="text-sm font-semibold text-slate-700">Pesaje de origen</dt><dd><Link className="font-mono text-brand-700 underline" href={`/pesajes/${b.weighingId}`}>{formatWeighingRef(b.weighingRef)}</Link></dd></div>
        </dl>
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-semibold">Saldo por ubicación</h2>
        <table className="w-full text-left text-sm">
          <thead className="text-slate-700"><tr><th scope="col" className="py-1">Ubicación (zona)</th><th scope="col" className="py-1 text-right">Saldo</th></tr></thead>
          <tbody className="divide-y divide-slate-200">
            {b.balances.map((x) => (
              <tr key={x.zoneId}><td className="py-2">{x.zoneName ?? "—"}</td><td className="py-2 text-right tabular-nums">{formatKg(x.balanceG)}</td></tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Alert tone="info">
        Traslados, retiros, rechazos, reutilización y ajustes aún <strong>no están disponibles</strong> (iteración 2 del plan). Por ahora el saldo
        es igual a la captación inicial.
      </Alert>
      <Link href="/historial" className="inline-block font-semibold text-brand-700 underline">← Volver al historial</Link>
    </div>
  );
}
