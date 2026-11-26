import type { Metadata } from "next";
import { Radio } from "lucide-react";
import { Forbidden } from "@/components/forbidden";
import { InfoTip } from "@/components/help/info-tip";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, DemoBadge } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { messageForCode } from "@/lib/errors";
import { formatSantiago } from "@/lib/time";
import { listContainers } from "@/modules/catalog/queries";
import { listDevices, listRecentReadings, type DeviceReading } from "@/modules/devices/queries";
import { DEVICE_STATE_LABEL, relativeAge, type DeviceState, type ReadingQuality } from "@/modules/devices/schema";
import { requireActorWith } from "@/modules/identity/guards";
import { can } from "@/modules/identity/permissions";
import { formatKg } from "@/modules/weighing/units";
import { revokeDeviceAction } from "./actions";
import { CreateDeviceForm, RotateTokenForm } from "./device-forms";

export const metadata: Metadata = { title: "Dispositivos" };
export const dynamic = "force-dynamic";

const OK_MSG: Record<string, string> = { revocado: "Dispositivo revocado: su credencial ya no permite enviar datos." };
const STATE_TONE: Record<DeviceState, "ok" | "warn" | "neutral" | "demo"> = { en_linea: "ok", desactualizado: "demo", sin_datos: "neutral", revocado: "warn" };
const QUALITY_LABEL: Record<ReadingQuality, string> = {
  stable: "Estable",
  unstable: "Inestable",
  uncalibrated: "Sin calibrar",
  sensor_error: "Error de sensor",
};

const pct = (n: number) => `${n.toFixed(1).replace(".", ",")} %`;
/** Un dato ausente se muestra como «—», nunca como cero. */
const weightText = (r: DeviceReading) => (r.weightG === null ? "—" : formatKg(r.weightG));
const distanceText = (r: DeviceReading) => (r.distanceMm === null ? "—" : `${r.distanceMm} mm`);
const fillText = (r: DeviceReading) => (r.fillPercent === null ? "—" : pct(r.fillPercent));

export default async function DispositivosPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const sp = await searchParams;
  const { actor, allowed } = await requireActorWith("device:read", "/dispositivos");
  if (!allowed) return <Forbidden what="los dispositivos" />;
  const manage = can(actor, "device:manage");
  const now = new Date();
  const [devices, recent, containers] = await Promise.all([
    listDevices(actor, now),
    listRecentReadings(actor, 15),
    manage ? listContainers(actor, { onlyUsable: true }) : Promise.resolve([]),
  ]);
  const containerOptions = containers.map((c) => ({
    id: c.id,
    label: `${c.code} · ${c.zoneName}${c.dataOrigin === "demo" ? " (DEMO)" : ""}`,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        icon={Radio}
        title="Dispositivos"
        subtitle="Equipos con sensores instalados en los contenedores: último contacto, estado y última lectura."
      />
      <Alert tone="info" role="note" data-testid="aviso-telemetria">
        Las lecturas de los sensores son <strong>datos informativos</strong> (<InfoTip k="lectura_sensor" />): no suman captación ni crean lotes.
        La captación cambia solo cuando una persona confirma un pesaje en <strong>Registro</strong>.
      </Alert>
      {sp.error ? <Alert tone="error" role="alert">{messageForCode(sp.error)}</Alert> : null}
      {sp.ok && OK_MSG[sp.ok] ? <Alert tone="success" role="status">{OK_MSG[sp.ok]}</Alert> : null}

      {manage ? (
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Nuevo dispositivo</h2>
          <CreateDeviceForm containers={containerOptions} />
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Dispositivos registrados ({devices.length})</h2>
        {devices.length === 0 ? (
          <p className="text-slate-700" data-testid="sin-dispositivos">
            Aún no hay dispositivos registrados{manage ? ". Cree el primero con el formulario de arriba." : "."}
          </p>
        ) : (
          <ul className="space-y-4">
            {devices.map((d) => (
              <li key={d.id} className="rounded-lg border border-slate-200 p-3" data-testid="dispositivo" data-state={d.state}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{d.code}</span>
                  <span className="text-sm text-slate-700">{d.name}</span>
                  <Badge tone={STATE_TONE[d.state]} data-testid="estado-dispositivo">{DEVICE_STATE_LABEL[d.state]}</Badge>
                  {d.dataOrigin === "demo" ? <DemoBadge /> : null}
                </div>
                <p className="text-sm text-slate-700">
                  Contenedor {d.containerCode} · {d.zoneName} · {d.materialName}
                </p>
                <p className="text-sm text-slate-700" data-testid="ultimo-contacto">
                  Último contacto:{" "}
                  {d.lastSeenAt ? (
                    <>
                      {relativeAge(d.lastSeenAt, now)} <span className="text-slate-600">({formatSantiago(d.lastSeenAt)})</span>
                    </>
                  ) : (
                    "nunca"
                  )}
                  {" · "}se marca desactualizado tras {d.staleAfterMinutes} min sin datos
                </p>

                {d.last ? (
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4" data-testid="ultima-lectura">
                    <div className="min-w-0"><dt className="text-slate-600">Peso del sensor</dt><dd className="font-semibold tabular-nums">{weightText(d.last)}</dd></div>
                    <div className="min-w-0"><dt className="text-slate-600">Distancia</dt><dd className="font-semibold tabular-nums">{distanceText(d.last)}</dd></div>
                    <div className="min-w-0"><dt className="text-slate-600">Llenado estimado</dt><dd className="font-semibold tabular-nums">{fillText(d.last)}</dd></div>
                    <div className="min-w-0"><dt className="text-slate-600">Calidad</dt><dd className="font-semibold">{QUALITY_LABEL[d.last.quality]}</dd></div>
                  </dl>
                ) : null}
                <p className="mt-1 text-sm text-slate-700">
                  Últimas 24 h: {d.readings24h} lecturas
                  {d.sensorErrors24h > 0 ? ` · ${d.sensorErrors24h} con error de sensor` : ""}
                  {d.clockIssues24h > 0 ? ` · ${d.clockIssues24h} con reloj dudoso (se usó la hora del servidor)` : ""}
                </p>
                {manage ? (
                  <div className="mt-2 flex flex-wrap items-start gap-3">
                    <div className="w-full text-sm text-slate-600">
                      Credencial <InfoTip k="token_dispositivo" />: <span className="font-mono">{d.tokenPrefix}…</span>
                      {d.tokenRotatedAt ? ` · rotada el ${formatSantiago(d.tokenRotatedAt)}` : ""}
                    </div>
                    <RotateTokenForm deviceId={d.id} code={d.code} />
                    {d.revokedAt ? null : (
                      <form action={revokeDeviceAction} className="mt-2">
                        <input type="hidden" name="deviceId" value={d.id} />
                        <Button type="submit" variant="ghost" size="sm" aria-label={`Revocar ${d.code}: dejará de aceptarse su credencial`}>
                          Revocar
                        </Button>
                      </form>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Últimas lecturas</h2>
        {recent.length === 0 ? (
          <p className="text-slate-700">Todavía no se recibieron lecturas.</p>
        ) : (
          <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="Últimas lecturas de sensores">
            <table className="w-full min-w-[40rem] text-left text-sm" data-testid="tabla-lecturas">
              <thead>
                <tr className="border-b border-slate-300 text-slate-700">
                  <th scope="col" className="py-2 pr-3">Momento</th>
                  <th scope="col" className="py-2 pr-3">Dispositivo</th>
                  <th scope="col" className="py-2 pr-3 text-right">Peso</th>
                  <th scope="col" className="py-2 pr-3 text-right">Distancia</th>
                  <th scope="col" className="py-2 pr-3 text-right">Llenado</th>
                  <th scope="col" className="py-2">Calidad</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="whitespace-nowrap py-2 pr-3">
                      {formatSantiago(r.effectiveAt)}
                      {r.clockOk ? null : <span className="ml-1 text-xs text-amber-900" title="El reloj del dispositivo no era creíble: se usó la hora del servidor">(hora del servidor)</span>}
                    </td>
                    <td className="py-2 pr-3">
                      {r.deviceCode} {r.dataOrigin === "demo" ? <DemoBadge /> : null}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{weightText(r)}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{distanceText(r)}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{fillText(r)}</td>
                    <td className="py-2">{QUALITY_LABEL[r.quality]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
