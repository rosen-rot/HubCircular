import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { Scale } from "lucide-react";
import { Forbidden } from "@/components/forbidden";
import { Alert, Card, DemoBadge } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatSantiago } from "@/lib/time";
import { getTodaySummary } from "@/modules/weighing/queries";
import { formatWeighingRef } from "@/modules/weighing/refs";
import { formatKg } from "@/modules/weighing/units";
import { listContainers } from "@/modules/catalog/queries";
import { requireActorWith } from "@/modules/identity/guards";
import { WeighingForm, type ContainerChoice } from "./weighing-form";

export const metadata: Metadata = { title: "Nuevo pesaje" };
export const dynamic = "force-dynamic";

export default async function RegistroPage({ searchParams }: { searchParams: Promise<{ container?: string }> }) {
  const { container } = await searchParams;
  const { actor, allowed } = await requireActorWith("weighing:create", "/registro");
  if (!allowed) return <Forbidden what="el registro de pesajes" />;

  const options = await listContainers(actor, { onlyUsable: true });
  const choices: ContainerChoice[] = options.map((c) => ({
    code: c.code,
    label: `${c.code} — ${c.materialName} — ${c.zoneName}`,
    materialName: c.materialName,
    zoneName: c.zoneName,
    tareG: c.tareG,
    demo: c.dataOrigin === "demo",
  }));
  const today = await getTodaySummary(actor);
  const qr = (container ?? "").trim().toUpperCase();
  const initialCode = choices.some((c) => c.code === qr) ? qr : "";

  return (
    <div className="space-y-5">
      <PageHeader icon={Scale} title="Nuevo pesaje" subtitle="Registro manual de captación: bruto, tara y neto. Cada pesaje válido crea su lote." />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,42rem)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          {qr && !initialCode ? (
            <Alert tone="warning" role="alert">
              El código «{qr.slice(0, 64)}» no corresponde a un contenedor activo dentro de su ámbito. Elija uno de la lista.
            </Alert>
          ) : null}
          {choices.length === 0 ? (
            <Alert tone="warning">No hay contenedores activos disponibles en su ámbito. Pida a un administrador que configure uno.</Alert>
          ) : (
            // Una clave nueva por cada carga de la página: protege contra doble clic y reintentos de red.
            <WeighingForm containers={choices} initialCode={initialCode} idempotencyKey={randomUUID()} />
          )}
        </div>
        <aside aria-label="Resumen y recordatorio" className="min-w-0 space-y-4">
          <Card data-testid="resumen-hoy">
            <h2 className="text-lg font-bold text-brand-900">Resumen de hoy</h2>
            <p className="text-sm text-slate-700">Pesajes de su ámbito en el día de hoy (hora de Chile).</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt>Pesajes reales</dt><dd className="font-semibold tabular-nums">{today.real.weighings} · {formatKg(today.real.netG)}</dd></div>
              {today.demo.weighings > 0 ? (
                <div className="flex justify-between gap-3"><dt>Pesajes de demostración <DemoBadge /></dt><dd className="font-semibold tabular-nums">{today.demo.weighings} · {formatKg(today.demo.netG)}</dd></div>
              ) : null}
            </dl>
          </Card>
          <Card data-testid="mis-registros">
            <h2 className="text-lg font-bold text-brand-900">Mis últimos registros</h2>
            {today.mine.length === 0 ? (
              <p className="mt-1 text-sm text-slate-700">Todavía no ha registrado pesajes.</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100 text-sm">
                {today.mine.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-3 py-1.5">
                    <span>
                      <Link className="font-mono font-semibold text-brand-700 underline" href={`/pesajes/${r.id}`}>{formatWeighingRef(r.refNo)}</Link>{" "}
                      {r.dataOrigin === "demo" ? <DemoBadge /> : null}
                      <span className="block text-xs text-slate-600">{r.containerCode ?? "—"} · {r.materialName} · {formatSantiago(r.occurredAt)}</span>
                    </span>
                    <span className="tabular-nums">{formatKg(r.netG)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="border-sky-300 bg-sky-50">
            <h2 className="text-lg font-bold text-brand-900">Recordatorio</h2>
            <p className="mt-1 text-sm text-slate-800">
              Registre el peso bruto y la tara del recipiente vacío: el neto lo calcula el sistema. Si el día de medición no hubo residuos, confirme el «cero»
              desde Calendarios.
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
