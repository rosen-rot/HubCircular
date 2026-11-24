import type { Metadata } from "next";
import { Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import { InfoTip, Term } from "@/components/help/info-tip";
import { FillMeter, SensorStateBadge } from "@/components/sensores/sensor-status";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, DemoBadge } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { Forbidden } from "@/components/forbidden";
import { messageForCode } from "@/lib/errors";
import { listContainers } from "@/modules/catalog/queries";
import { listContainerSensors } from "@/modules/devices/queries";
import { requireActorWith } from "@/modules/identity/guards";
import { can } from "@/modules/identity/permissions";
import { formatKg } from "@/modules/weighing/units";
import { setCapacityAction } from "./actions";

export const metadata: Metadata = { title: "Contenedores" };
export const dynamic = "force-dynamic";

const OK_MSG: Record<string, string> = {
  capacidad: "Capacidad guardada. El llenado del sensor ahora se muestra para ese contenedor.",
  capacidad_quitada: "Capacidad quitada. Ese contenedor ya no muestra llenado.",
};

export default async function ContenedoresPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const sp = await searchParams;
  const { actor, allowed } = await requireActorWith("catalog:read", "/contenedores");
  if (!allowed) return <Forbidden what="el catálogo de contenedores" />;
  const now = new Date();
  const showSensors = can(actor, "device:read");
  const [containers, sensors] = await Promise.all([
    listContainers(actor),
    showSensors ? listContainerSensors(actor, { now }) : Promise.resolve(null),
  ]);
  const byId = new Map((sensors?.items ?? []).map((s) => [s.containerId, s]));
  const canRegister = can(actor, "weighing:create");
  const manage = can(actor, "catalog:manage") && sensors?.capacitySupported === true;

  return (
    <div className="space-y-5">
      <PageHeader icon={Trash2} title={<Term k="contenedor">Contenedores</Term>} subtitle={<>Contenedores visibles en su ámbito. El código del QR apunta a <code>/registro?container=CÓDIGO</code>.</>} />
      <Alert tone="info">
        El QR <strong>solo identifica</strong> el contenedor y precarga el formulario: para registrar hay que iniciar sesión y tener permiso. La administración
        del catálogo (altas, ediciones, inactivación) y la generación de imágenes QR llegan en la siguiente iteración; hoy el catálogo proviene de datos semilla.
      </Alert>
      {showSensors ? (
        <Alert tone="info" role="note" data-testid="aviso-llenado">
          «Sensor» y «Llenado» son <strong>datos del sensor</strong> (<InfoTip k="lectura_sensor" />): no suman captación ni crean lotes. El llenado solo se muestra
          si el contenedor tiene <Term k="capacidad">capacidad</Term> definida.
        </Alert>
      ) : null}
      {sensors && !sensors.capacitySupported ? (
        <Alert tone="warning" role="status" data-testid="aviso-sin-0012">
          Esta base de datos aún no tiene la migración de capacidad (0012): el llenado no se muestra en ningún contenedor.
        </Alert>
      ) : null}
      {sp.error ? <Alert tone="error" role="alert">{messageForCode(sp.error)}</Alert> : null}
      {sp.ok && OK_MSG[sp.ok] ? <Alert tone="success" role="status">{OK_MSG[sp.ok]}</Alert> : null}
      {containers.length === 0 ? (
        <Alert tone="warning">No hay contenedores configurados en su ámbito.</Alert>
      ) : (
        <div className="relative overflow-x-auto rounded-2xl border border-slate-200 bg-white" tabIndex={0} role="region" aria-label="Contenedores (se desplaza horizontalmente)">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">Contenedores</caption>
            <thead className="bg-brand-50"><tr>
              <th scope="col" className="px-3 py-2">Código</th><th scope="col" className="px-3 py-2">Material<InfoTip k="material" /></th><th scope="col" className="px-3 py-2">Estación<InfoTip k="estacion" /></th>
              <th scope="col" className="px-3 py-2">Zona<InfoTip k="zona" /></th><th scope="col" className="px-3 py-2 text-right">Tara de referencia<InfoTip k="tara_ref" /></th>
              {showSensors ? (
                <>
                  <th scope="col" className="px-3 py-2 text-right">Capacidad<InfoTip k="capacidad" /></th>
                  <th scope="col" className="px-3 py-2">Sensor<InfoTip k="estado_dispositivo" /></th>
                  <th scope="col" className="px-3 py-2">Llenado (sensor)<InfoTip k="llenado" /></th>
                </>
              ) : null}
              <th scope="col" className="px-3 py-2">Estado</th><th scope="col" className="px-3 py-2"><span className="sr-only">Acción</span></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-200">
              {containers.map((c) => {
                const s = byId.get(c.id);
                return (
                  <tr key={c.id} data-testid="fila-contenedor" data-code={c.code}>
                    <td className="px-3 py-2 font-mono text-xs">{c.code} {c.dataOrigin === "demo" ? <DemoBadge /> : null}</td>
                    <td className="px-3 py-2">{c.materialName}</td>
                    <td className="px-3 py-2">{c.stationName}</td>
                    <td className="px-3 py-2">{c.zoneName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.tareG != null ? formatKg(c.tareG) : "—"}</td>
                    {showSensors ? (
                      <>
                        <td className="px-3 py-2 text-right tabular-nums" data-testid="capacidad">{s?.capacityL != null ? `${s.capacityL} L` : "—"}</td>
                        <td className="px-3 py-2"><SensorStateBadge sensor={s?.sensor ?? null} now={now} /></td>
                        <td className="px-3 py-2">{s ? <FillMeter fill={s.fill} /> : "—"}</td>
                      </>
                    ) : null}
                    <td className="px-3 py-2">{c.fullyActive ? <Badge tone="ok">Activo</Badge> : <Badge tone="warn">Inactivo</Badge>}</td>
                    <td className="px-3 py-2">
                      {canRegister && c.fullyActive ? (
                        <Link className="font-semibold text-brand-700 underline" href={`/registro?container=${encodeURIComponent(c.code)}`}>Registrar pesaje</Link>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {manage && containers.length > 0 ? (
        <Card id="capacidad" className="max-w-2xl">
          <h2 className="text-lg font-semibold">Capacidad de un contenedor</h2>
          <p className="mb-3 text-sm text-slate-700">
            Litros que caben en el contenedor. Sirve para interpretar el llenado del sensor; no cambia pesajes ni inventario. Deje el campo vacío para quitarla.
          </p>
          <form action={setCapacityAction} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
            <Field id="cap-contenedor" label="Contenedor">
              <Select id="cap-contenedor" name="containerId" required defaultValue="">
                <option value="" disabled>Seleccione…</option>
                {containers.map((c) => {
                  const cap = byId.get(c.id)?.capacityL;
                  return (
                    <option key={c.id} value={c.id}>
                      {c.code} · {c.zoneName}{c.dataOrigin === "demo" ? " (DEMO)" : ""}{cap != null ? ` · ${cap} L` : ""}
                    </option>
                  );
                })}
              </Select>
            </Field>
            <Field id="cap-litros" label="Capacidad (litros)" help="capacidad">
              <Input id="cap-litros" name="capacityL" inputMode="numeric" pattern="[0-9]*" maxLength={5} placeholder="Ej. 120" autoComplete="off" />
            </Field>
            <Button type="submit">Guardar capacidad</Button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
