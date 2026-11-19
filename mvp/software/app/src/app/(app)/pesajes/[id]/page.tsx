import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InfoTip } from "@/components/help/info-tip";
import { Alert, Card, DemoBadge } from "@/components/ui/card";
import type { GlossaryKey } from "@/lib/glossary";
import { Button } from "@/components/ui/button";
import { formatSantiago } from "@/lib/time";
import { requireActor } from "@/modules/identity/guards";
import { can } from "@/modules/identity/permissions";
import { formatBatchRef, formatWeighingRef } from "@/modules/weighing/refs";
import { getWeighing } from "@/modules/weighing/queries";
import { formatGrams, formatKg } from "@/modules/weighing/units";

export const metadata: Metadata = { title: "Pesaje" };

export default async function PesajePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nuevo?: string; duplicado?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const actor = await requireActor(`/pesajes/${id}`);
  const w = can(actor, "weighing:read") ? await getWeighing(actor, id) : null;
  if (!w) notFound();

  const rows: [string, React.ReactNode, GlossaryKey?][] = [
    ["Referencia del pesaje", <span key="r" className="font-mono">{formatWeighingRef(w.refNo)}</span>],
    ["Lote", w.batchId && w.batchRef ? <Link key="l" className="font-mono font-semibold text-brand-700 underline" href={`/lotes/${w.batchId}`}>{formatBatchRef(w.batchRef)}</Link> : "—", "lote"],
    ["Contenedor", w.containerCode ?? "—", "contenedor"],
    ["Material", w.materialName, "material"],
    ["Zona", w.zoneName ?? "—", "zona"],
    ["Peso bruto (recipiente + material)", `${formatKg(w.grossG)} (${formatGrams(w.grossG)})`, "bruto"],
    ["Tara (recipiente vacío)", `${formatKg(w.tareG)} (${formatGrams(w.tareG)})`, "tara"],
    ["Peso neto (solo el material)", <strong key="n">{formatKg(w.netG)} ({formatGrams(w.netG)})</strong>, "neto"],
    ["Fecha del pesaje (hora de Chile)", formatSantiago(w.occurredAt), "hora_chile"],
    ["Registrado", `${formatSantiago(w.createdAt)} por ${w.createdByName ?? "—"}`],
    ["Origen del registro", w.source === "manual" ? "Pesaje manual" : "Confirmación de lectura IoT"],
    ["Contaminación visible", w.contaminationObserved ? "Sí" : "No", "contaminacion"],
    ["Observaciones", w.notes ?? "—"],
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {sp.nuevo ? (
        <Alert tone="success" role="status">
          <strong>Pesaje registrado.</strong> Se creó el lote {w.batchRef ? formatBatchRef(w.batchRef) : ""} con {formatKg(w.netG)} netos.
        </Alert>
      ) : null}
      {sp.duplicado ? (
        <Alert tone="info" role="status">
          Este envío ya estaba registrado: <strong>no se creó un pesaje duplicado</strong>. Se muestra el registro original.
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-brand-900">Pesaje {formatWeighingRef(w.refNo)}</h1>
        {w.dataOrigin === "demo" ? <DemoBadge /> : null}
      </div>
      <Card>
        <dl className="divide-y divide-slate-200">
          {rows.map(([k, v, help]) => (
            <div key={k} className="grid gap-1 py-2 sm:grid-cols-3">
              <dt className="text-sm font-semibold text-slate-700">
                {k}
                {help ? <InfoTip k={help} /> : null}
              </dt>
              <dd className="sm:col-span-2">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <div className="flex flex-wrap gap-3">
        {can(actor, "weighing:create") ? (
          <Button asChild>
            <Link href={w.containerCode ? `/registro?container=${encodeURIComponent(w.containerCode)}` : "/registro"}>Registrar otro pesaje</Link>
          </Button>
        ) : null}
        <Button asChild variant="outline">
          <Link href="/historial">Ver historial</Link>
        </Button>
      </div>
    </div>
  );
}
