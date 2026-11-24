import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { FILL_NO_DATA_TEXT, FILL_REASON_TEXT, fillLevel, formatPercent, type FillView } from "@/modules/devices/fill";
import { DEVICE_STATE_LABEL, relativeAge, type DeviceState } from "@/modules/devices/schema";

const STATE_TONE: Record<DeviceState, "ok" | "warn" | "neutral" | "demo"> = {
  en_linea: "ok",
  desactualizado: "demo",
  sin_datos: "neutral",
  revocado: "warn",
};

/** Estado del sensor de un contenedor. Sin dispositivo: «Sin sensor». El texto siempre acompaña al color. */
export function SensorStateBadge({
  sensor,
  now,
}: {
  sensor: { state: DeviceState; lastSeenAt: Date | null; deviceCode: string } | null;
  now: Date;
}) {
  if (!sensor) {
    return (
      <span className="text-sm text-slate-700" data-testid="estado-sensor" data-state="sin_sensor">
        Sin sensor
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col gap-0.5" data-testid="estado-sensor" data-state={sensor.state}>
      <Badge tone={STATE_TONE[sensor.state]} className="w-fit gap-1">
        {sensor.state === "desactualizado" ? <Clock className="h-3 w-3" aria-hidden="true" /> : null}
        {DEVICE_STATE_LABEL[sensor.state]}
      </Badge>
      <span className="text-xs text-slate-700">
        {sensor.deviceCode} · último contacto {relativeAge(sensor.lastSeenAt, now)}
      </span>
    </span>
  );
}

const BAR: Record<"bajo" | "medio" | "alto", string> = {
  bajo: "bg-brand-500",
  medio: "bg-amber-500",
  alto: "bg-red-600",
};

/**
 * Llenado estimado por el sensor. Solo se dibuja si el contenedor tiene capacidad y hay un dato; si no, se explica
 * por qué no hay valor (nunca se muestra «0 %» inventado).
 */
export function FillMeter({ fill, compact = false }: { fill: FillView; compact?: boolean }) {
  if (fill.kind !== "ok") {
    return (
      <span className="text-sm text-slate-700" data-testid="llenado" data-kind={fill.kind}>
        {FILL_NO_DATA_TEXT[fill.kind]}
        {fill.kind === "sin_dato" && !compact ? <span className="block text-xs">({FILL_REASON_TEXT[fill.reason]})</span> : null}
      </span>
    );
  }
  const level = fillLevel(fill.percent);
  return (
    <span className="flex min-w-[8rem] flex-col gap-1" data-testid="llenado" data-kind="ok" data-stale={fill.stale ? "true" : "false"}>
      <span className={cn("text-sm font-semibold tabular-nums", fill.stale && "text-slate-600")}>
        {formatPercent(fill.percent)}
        <span className="font-normal text-slate-700">
          {" "}
          · ≈ {fill.approxLiters} de {fill.capacityL} L
        </span>
      </span>
      <span className="block h-2 w-full overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
        <span
          className={cn("block h-full rounded-full", fill.stale ? "bg-slate-400" : BAR[level])}
          style={{ width: `${fill.percent}%` }}
        />
      </span>
      {fill.stale ? <span className="text-xs text-amber-900">Último dato conocido: el sensor está desactualizado.</span> : null}
    </span>
  );
}
