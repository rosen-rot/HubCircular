import Link from "next/link";
import { Radio } from "lucide-react";
import { InfoTip } from "@/components/help/info-tip";
import { Card, DemoBadge } from "@/components/ui/card";
import type { ContainerSensorList } from "@/modules/devices/queries";
import type { DeviceState } from "@/modules/devices/schema";
import { FillMeter, SensorStateBadge } from "./sensor-status";

const SUMMARY: { state: DeviceState; label: string }[] = [
  { state: "en_linea", label: "En línea" },
  { state: "desactualizado", label: "Desactualizados" },
  { state: "sin_datos", label: "Sin datos aún" },
  { state: "revocado", label: "Revocados" },
];

/**
 * Tarjeta de Inicio: estado del sensor y llenado de los contenedores del origen elegido (real o DEMO, nunca juntos).
 * Datos de sensor: informativos, no son captación.
 */
export function SensorsCard({ data, demo, now, demoHref }: { data: ContainerSensorList; demo: boolean; now: Date; demoHref: string }) {
  const withSensor = data.items.filter((i) => i.sensor !== null);
  const withoutSensor = data.items.length - withSensor.length;
  const counts = new Map<DeviceState, number>();
  for (const i of withSensor) counts.set(i.sensor!.state, (counts.get(i.sensor!.state) ?? 0) + 1);
  // Primero lo que requiere atención: desactualizados, luego en línea (más lleno primero), sin datos y revocados.
  const order: Record<DeviceState, number> = { desactualizado: 0, en_linea: 1, sin_datos: 2, revocado: 3 };
  const rows = [...withSensor].sort((a, b) => {
    const d = order[a.sensor!.state] - order[b.sensor!.state];
    if (d !== 0) return d;
    const pa = a.fill.kind === "ok" ? a.fill.percent : -1;
    const pb = b.fill.kind === "ok" ? b.fill.percent : -1;
    return pb - pa || a.code.localeCompare(b.code);
  });

  return (
    <Card className="min-w-0" data-testid="tarjeta-sensores">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-brand-900">
            <Radio className="h-5 w-5" aria-hidden="true" />
            Sensores de contenedores {demo ? <DemoBadge /> : null}
            <InfoTip k="lectura_sensor" />
          </h2>
          <p className="text-sm text-slate-700">Estado actual y llenado estimado. Son datos del sensor: no suman captación.</p>
        </div>
        <Link href="/contenedores" className="text-sm font-semibold text-brand-700 underline">Ver contenedores</Link>
      </div>

      {withSensor.length === 0 ? (
        <p className="mt-3 text-sm text-slate-700" data-testid="sin-sensores">
          {demo ? (
            "No hay sensores en los contenedores de demostración de su ámbito."
          ) : (
            <>
              Aún no hay sensores instalados en contenedores reales de su ámbito.{" "}
              <Link className="font-semibold underline" href={demoHref}>Ver los sensores de demostración</Link> (nunca se mezclan con los reales).
            </>
          )}
        </p>
      ) : (
        <>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Resumen de sensores" data-testid="resumen-sensores">
            {SUMMARY.filter((s) => (counts.get(s.state) ?? 0) > 0 || s.state === "en_linea" || s.state === "desactualizado").map((s) => (
              <li key={s.state} data-state={s.state}>
                {s.label}: <strong className="tabular-nums">{counts.get(s.state) ?? 0}</strong>
              </li>
            ))}
            {withoutSensor > 0 ? (
              <li data-state="sin_sensor">
                Contenedores sin sensor: <strong className="tabular-nums">{withoutSensor}</strong>
              </li>
            ) : null}
          </ul>
          {/* Lista (no tabla): en teléfono cada contenedor se apila y el llenado queda a la vista sin desplazar. */}
          {/* Contenedor div (no párrafo): InfoTip usa un elemento details y no puede ir dentro de un párrafo. */}
          <div className="mt-1 flex flex-wrap items-center gap-x-4 text-xs text-slate-700">
            <span className="inline-flex items-center">¿Qué es el estado del sensor?<InfoTip k="estado_dispositivo" /></span>
            <span className="inline-flex items-center">¿Qué es el llenado?<InfoTip k="llenado" /></span>
          </div>
          <div className="mt-3 hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b border-slate-200 pb-1.5 text-sm font-semibold text-slate-700 sm:grid" aria-hidden="true">
            <span>Contenedor</span>
            <span>Sensor</span>
            <span>Llenado</span>
          </div>
          <ul className="divide-y divide-slate-100" aria-label="Sensores por contenedor">
            {rows.map((r) => (
              <li
                key={r.containerId}
                className="grid grid-cols-1 gap-2 py-2.5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] sm:gap-3"
                data-testid="fila-sensor"
                data-code={r.code}
              >
                <div className="min-w-0">
                  <span className="font-mono text-xs font-semibold">{r.code}</span>
                  <span className="block text-xs text-slate-700">{r.materialName} · {r.zoneName}</span>
                </div>
                <div className="min-w-0">
                  <span className="sr-only">Sensor: </span>
                  <SensorStateBadge sensor={r.sensor} now={now} />
                </div>
                <div className="min-w-0">
                  <span className="sr-only">Llenado: </span>
                  <FillMeter fill={r.fill} compact />
                </div>
              </li>
            ))}
          </ul>
          {!data.capacitySupported ? (
            <p className="mt-2 text-xs text-slate-700">El llenado no se muestra: la base de datos aún no tiene la migración de capacidad (0012).</p>
          ) : null}
        </>
      )}
    </Card>
  );
}
