import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import { Forbidden } from "@/components/forbidden";
import { InfoTip, Term } from "@/components/help/info-tip";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, DemoBadge } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { messageForCode } from "@/lib/errors";
import { addDays, santiagoToday } from "@/lib/time";
import { requireActorWith } from "@/modules/identity/guards";
import { can } from "@/modules/identity/permissions";
import { COVERAGE_LABEL, formatWeekdays, weekdayName } from "@/modules/indicators/coverage";
import { listContainerSchedules, listTodayMeasurements } from "@/modules/indicators/queries";
import { confirmZeroAction, createScheduleAction, endScheduleAction } from "./actions";

export const metadata: Metadata = { title: "Calendarios de medición" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const dmy = (d: string) => `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`;

const OK_MESSAGES: Record<string, string> = {
  calendario: "Calendario creado.",
  termino: "Calendario terminado.",
  cero: "«Cero» confirmado para hoy. No se creó ningún pesaje ni se sumó masa.",
  "cero-repetido": "Ese contenedor ya tenía «cero» confirmado hoy; no se registró nada nuevo.",
};

export default async function CalendariosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { actor, allowed } = await requireActorWith("measurement:zero", "/calendarios");
  if (!allowed) return <Forbidden what="los calendarios de medición" />;

  const canManage = can(actor, "schedule:manage");
  const today = santiagoToday();
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay() || 7;
  const [todayData, containers] = await Promise.all([listTodayMeasurements(actor), canManage ? listContainerSchedules(actor) : Promise.resolve([])]);
  const ok = OK_MESSAGES[one(sp.ok)];
  const err = one(sp.error);

  return (
    <div className="space-y-6">
      <PageHeader icon={CalendarDays} title={<Term k="calendario">Calendarios de medición</Term>} subtitle={<>Hoy es {weekdayName(dow)} {dmy(today)} (hora de Chile). Los calendarios definen qué días se espera medir cada contenedor; el tablero calcula la cobertura con ellos.</>} />

      {ok ? <Alert tone="success" role="status">{ok}</Alert> : null}
      {err ? <Alert tone="error" role="alert">{messageForCode(err)}</Alert> : null}

      <section aria-labelledby="h-hoy" className="space-y-3">
        <h2 id="h-hoy" className="text-xl font-bold text-brand-900">
          <Term k="medicion_esperada">Mediciones esperadas hoy</Term>
        </h2>
        {todayData.items.length === 0 ? (
          <Alert tone="info">Hoy no hay mediciones esperadas en su ámbito.</Alert>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {todayData.items.map(({ occurrence: o, container: c }) => (
              <li key={`${c.id}-${o.day}`}>
                <Card className="space-y-3">
                  <div>
                    <p className="font-mono text-sm font-semibold">{c.code} {c.dataOrigin === "demo" ? <DemoBadge /> : null}</p>
                    <p className="text-sm text-slate-700">{c.materialName} · {c.zoneName}</p>
                  </div>
                  <div>
                    <Badge tone={o.status === "pendiente" ? "neutral" : "ok"}>{COVERAGE_LABEL[o.status]}</Badge>
                    <InfoTip k={o.status === "pendiente" ? "pendiente" : o.status === "realizado" ? "con_pesaje" : "cero"} />
                    {o.status === "realizado" ? <span className="ml-2 text-sm">{o.weighings} pesaje{o.weighings === 1 ? "" : "s"} hoy</span> : null}
                    {o.status === "cero_confirmado" && o.zeroNote ? <span className="ml-2 text-sm">Nota: {o.zeroNote}</span> : null}
                  </div>
                  {o.status === "pendiente" ? (
                    <div className="space-y-3">
                      <Button asChild variant="outline"><Link href={`/registro?container=${encodeURIComponent(c.code)}`}>Registrar pesaje</Link></Button>
                      <form action={confirmZeroAction} className="space-y-2 border-t border-slate-200 pt-3" aria-label={`Confirmar cero en ${c.code}`}>
                        <input type="hidden" name="containerId" value={c.id} />
                        <Field id={`note-${c.id}`} label="Nota (opcional)" hint="Use «cero» solo si revisó el contenedor y no había residuos.">
                          <Textarea id={`note-${c.id}`} name="note" rows={2} maxLength={500} />
                        </Field>
                        <div className="flex flex-wrap items-center">
                          <Button type="submit" variant="outline">Confirmar cero: hoy revisé y está vacío</Button>
                          <InfoTip k="cero" />
                        </div>
                      </form>
                    </div>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canManage ? (
        <section aria-labelledby="h-cal" className="space-y-3">
          <h2 id="h-cal" className="text-xl font-bold text-brand-900">
            <Term k="calendario">Calendarios por contenedor</Term>
          </h2>
          <p className="text-sm text-slate-700">
            Los días son fijos de la semana. Un calendario no se edita hacia atrás: se crea desde hoy o después, y al terminarlo la fecha de término es como máximo ayer, para que lo esperado en días pasados no cambie. Para cambiar los días, termine el calendario actual y cree uno nuevo.
          </p>
          {containers.length === 0 ? (
            <Alert tone="info">No hay contenedores en su ámbito.</Alert>
          ) : (
            <div className="space-y-4">
              {containers.map(({ container: c, schedules }) => {
                const open = schedules.find((s) => s.endOn === null);
                const lastEnd = schedules.reduce<string | null>((acc, s) => (s.endOn && (!acc || s.endOn > acc) ? s.endOn : acc), null);
                const minStart = lastEnd && lastEnd >= today ? addDays(lastEnd, 1) : today;
                return (
                  <Card key={c.id} className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-mono text-sm font-semibold">{c.code} {c.dataOrigin === "demo" ? <DemoBadge /> : null} {!c.active ? <Badge tone="warn">inactivo</Badge> : null}</p>
                        <p className="text-sm text-slate-700">{c.materialName} · {c.zoneName}</p>
                      </div>
                      <p className="text-sm">{open ? <Badge tone="ok">Con calendario vigente</Badge> : <Badge>Sin calendario vigente</Badge>}</p>
                    </div>

                    {schedules.length > 0 ? (
                      <ul className="space-y-1 text-sm">
                        {schedules.map((s) => (
                          <li key={s.id}>
                            <strong>{formatWeekdays(s.weekdays)}</strong> · desde {dmy(s.startOn)} {s.endOn ? `hasta ${dmy(s.endOn)}` : "· sin fecha de término"}
                            <span className="text-slate-600"> · creado por {s.createdByName}{s.endedByName ? ` · terminado por ${s.endedByName}` : ""}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-slate-700">Aún no tiene calendario: la cobertura no cuenta mediciones esperadas para este contenedor.</p>
                    )}

                    {open ? (
                      <form action={endScheduleAction} className="flex flex-wrap items-end gap-3 border-t border-slate-200 pt-3" aria-label={`Terminar calendario de ${c.code}`}>
                        <input type="hidden" name="scheduleId" value={open.id} />
                        <Field id={`end-${open.id}`} label="Último día con medición esperada">
                          <Input id={`end-${open.id}`} name="endOn" type="date" required min={addDays(open.startOn, -1) > addDays(today, -1) ? addDays(open.startOn, -1) : addDays(today, -1)} defaultValue={addDays(today, -1) >= open.startOn ? addDays(today, -1) : addDays(open.startOn, -1)} />
                        </Field>
                        <Button type="submit" variant="outline">Terminar calendario</Button>
                      </form>
                    ) : c.active ? (
                      <form action={createScheduleAction} className="space-y-3 border-t border-slate-200 pt-3" aria-label={`Crear calendario de ${c.code}`}>
                        <input type="hidden" name="containerId" value={c.id} />
                        <fieldset>
                          <legend className="mb-1 text-sm font-semibold text-slate-800">Días de medición</legend>
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                              <label key={d} className="inline-flex min-h-9 items-center gap-2 text-sm">
                                <input type="checkbox" name="weekday" value={d} className="h-4 w-4" />
                                {weekdayName(d)}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <div className="max-w-xs">
                          <Field id={`start-${c.id}`} label="Desde" hint="Hoy o una fecha posterior.">
                            <Input id={`start-${c.id}`} name="startOn" type="date" required min={minStart} defaultValue={minStart} />
                          </Field>
                        </div>
                        <Button type="submit">Crear calendario</Button>
                      </form>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      <p className="text-sm">
        <Link className="font-semibold text-brand-700 underline" href="/dashboard">Ir al tablero de indicadores</Link>
      </p>
    </div>
  );
}
