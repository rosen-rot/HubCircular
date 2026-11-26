import type { Metadata } from "next";
import Link from "next/link";
import { Radio } from "lucide-react";
import { AutoRefresh } from "@/components/iot/auto-refresh";
import { Forbidden } from "@/components/forbidden";
import { Alert, Badge, Card, DemoBadge } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatSantiago } from "@/lib/time";
import { requireActorWith } from "@/modules/identity/guards";
import { can } from "@/modules/identity/permissions";
import { listDeviceStatus, listRecentReadings, type DeviceStatus } from "@/modules/iot/queries";
import { OFFLINE_AFTER_S, type ReadingQuality } from "@/modules/iot/schema";
import { formatKg } from "@/modules/weighing/units";

export const metadata: Metadata = { title: "Sensores" };
export const dynamic = "force-dynamic";

const QUALITY: Record<ReadingQuality, { label: string; tone: "ok" | "neutral" | "warn" }> = {
  stable: { label: "Estable", tone: "ok" },
  unstable: { label: "Moviéndose", tone: "neutral" },
  uncalibrated: { label: "Sin calibrar", tone: "warn" },
  sensor_error: { label: "Error de sensor", tone: "warn" },
};

function ago(from: Date | null, now: number): string {
  if (!from) return "nunca";
  const s = Math.max(0, Math.round((now - from.getTime()) / 1000));
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} d`;
}

function signal(rssi: number | null): string {
  if (rssi == null) return "—";
  const q = rssi >= -60 ? "buena" : rssi >= -75 ? "regular" : "débil";
  return `${rssi} dBm (${q})`;
}

function DeviceCard({ d, now, canRegister }: { d: DeviceStatus; now: number; canRegister: boolean }) {
  const r = d.latest;
  const online = d.lastSeenAt != null && now - d.lastSeenAt.getTime() <= OFFLINE_AFTER_S * 1000;
  const q = r ? QUALITY[r.quality] : null;
  const netG = r?.weightG != null && d.containerTareG != null ? r.weightG - d.containerTareG : null;
  return (
    <Card data-testid={`device-${d.code}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-mono text-lg font-bold text-brand-900">{d.code}</h2>
          <p className="text-sm text-slate-700">
            {d.containerCode} · {d.materialName} · {d.zoneName} {d.containerDemo ? <DemoBadge /> : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {d.kind === "simulator" ? <Badge tone="demo" title="Lecturas generadas por el simulador: no son mediciones reales">SIMULADOR</Badge> : <Badge>Sensor ESP32</Badge>}
          {!d.active ? <Badge tone="warn">Desactivado</Badge> : online ? <Badge tone="ok">En línea</Badge> : <Badge tone="warn">Sin señal</Badge>}
        </div>
      </div>

      {r ? (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
          <div className="col-span-2">
            <dt className="text-slate-600">Peso bruto sobre la balanza</dt>
            <dd className="text-3xl font-bold tabular-nums text-brand-900" aria-live="polite">{r.weightG != null ? formatKg(r.weightG) : "—"}</dd>
            {netG != null ? <dd className="text-xs text-slate-600">Estimado sin recipiente (tara de referencia): {formatKg(Math.max(0, netG))}</dd> : null}
          </div>
          <div>
            <dt className="text-slate-600">Llenado</dt>
            <dd className="text-xl font-semibold tabular-nums">{r.fillPercent != null ? `${r.fillPercent.toLocaleString("es-CL")} %` : "—"}</dd>
            {r.distanceMm != null ? <dd className="text-xs text-slate-600">Distancia: {r.distanceMm} mm</dd> : null}
          </div>
          <div>
            <dt className="text-slate-600">Estado de la lectura</dt>
            <dd>{q ? <Badge tone={q.tone}>{q.label}</Badge> : "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-600">Última lectura</dt>
            <dd className="font-semibold">{ago(r.receivedAt, now)}</dd>
            <dd className="text-xs text-slate-600">{formatSantiago(r.receivedAt)}</dd>
          </div>
          <div>
            <dt className="text-slate-600">Wi-Fi</dt>
            <dd>{signal(r.rssiDbm)}</dd>
          </div>
          <div>
            <dt className="text-slate-600">Lecturas en la última hora</dt>
            <dd className="tabular-nums">{d.readingsLastHour}</dd>
          </div>
          <div>
            <dt className="text-slate-600">Firmware</dt>
            <dd className="font-mono text-xs">{r.firmwareVersion ?? "—"}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-4 text-sm text-slate-700">Todavía no se reciben lecturas de este dispositivo.</p>
      )}

      {canRegister && r?.weightG != null && d.active ? (
        <p className="mt-4">
          <Link className="font-semibold text-brand-700 underline" href={`/registro?container=${encodeURIComponent(d.containerCode)}`}>
            Registrar pesaje de este contenedor
          </Link>{" "}
          <span className="text-sm text-slate-600">(el peso de la balanza se puede cargar en el formulario y se confirma a mano)</span>
        </p>
      ) : null}
    </Card>
  );
}

export default async function SensoresPage() {
  const { actor, allowed } = await requireActorWith("catalog:read", "/sensores");
  if (!allowed) return <Forbidden what="el panel de sensores" />;
  const [devices, recent] = await Promise.all([listDeviceStatus(actor), listRecentReadings(actor, 15)]);
  const canRegister = can(actor, "weighing:create");
  // eslint-disable-next-line react-hooks/purity -- página dinámica: se renderiza en el servidor en cada actualización
  const now = Date.now();

  return (
    <div className="space-y-5">
      <PageHeader icon={Radio} title="Sensores" subtitle="Lecturas en vivo de la balanza y del sensor de llenado (ESP32)." />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Alert tone="info" className="flex-1">
          Las lecturas del sensor son <strong>informativas</strong>: no suman captación. Un pesaje solo cuenta cuando un operador lo confirma en «Registro».
          «Sin señal» = sin lecturas en los últimos {OFFLINE_AFTER_S} s.
        </Alert>
        <AutoRefresh seconds={5} />
      </div>

      {devices.length === 0 ? (
        <Alert tone="warning">
          No hay dispositivos registrados en su ámbito. Un administrador los da de alta con <code>npm run iot:device -- create</code> (ver docs/27).
        </Alert>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {devices.map((d) => (
            <DeviceCard key={d.id} d={d} now={now} canRegister={canRegister} />
          ))}
        </div>
      )}

      {recent.length > 0 ? (
        <section aria-labelledby="ultimas-lecturas">
          <h2 id="ultimas-lecturas" className="mb-2 text-lg font-bold text-brand-900">Últimas lecturas recibidas</h2>
          <div className="relative overflow-x-auto rounded-2xl border border-slate-200 bg-white" tabIndex={0} role="region" aria-label="Últimas lecturas (se desplaza horizontalmente)">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">Últimas lecturas recibidas</caption>
              <thead className="bg-brand-50">
                <tr>
                  <th scope="col" className="px-3 py-2">Recibida</th>
                  <th scope="col" className="px-3 py-2">Dispositivo</th>
                  <th scope="col" className="px-3 py-2 text-right">Peso bruto</th>
                  <th scope="col" className="px-3 py-2 text-right">Llenado</th>
                  <th scope="col" className="px-3 py-2">Estado</th>
                  <th scope="col" className="px-3 py-2 text-right">Wi-Fi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2">{formatSantiago(r.receivedAt)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.deviceCode} {r.simulated ? <Badge tone="demo">SIM</Badge> : null}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.weightG != null ? formatKg(r.weightG) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.fillPercent != null ? `${r.fillPercent.toLocaleString("es-CL")} %` : "—"}</td>
                    <td className="px-3 py-2">{QUALITY[r.quality].label}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.rssiDbm ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
