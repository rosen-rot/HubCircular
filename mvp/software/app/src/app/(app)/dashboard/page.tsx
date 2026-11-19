import type { Metadata } from "next";
import Link from "next/link";
import { Forbidden } from "@/components/forbidden";
import { ExportPicker } from "@/components/indicators/export-picker";
import { WeeklyChart } from "@/components/indicators/weekly-chart";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, DemoBadge } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { formatSantiago, santiagoToday } from "@/lib/time";
import { requireActorWith } from "@/modules/identity/guards";
import { can } from "@/modules/identity/permissions";
import { InfoTip, Term } from "@/components/help/info-tip";
import type { GlossaryKey } from "@/lib/glossary";
import { COVERAGE_LABEL, summarizeCoverage, type CoverageStatus } from "@/modules/indicators/coverage";
import { filtersToParams, includesToday, parseIndicatorFilters } from "@/modules/indicators/filters";
import { getIndicators, listPeriodMovements, loadIndicatorOptions } from "@/modules/indicators/queries";
import { MOVEMENT_LABEL } from "@/modules/movements/schema";
import { formatBatchRef } from "@/modules/weighing/refs";
import { formatGrams, formatKg } from "@/modules/weighing/units";

export const metadata: Metadata = { title: "Tablero de indicadores" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

const dmy = (d: string) => `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`;

function Tile({ title, help, value, children, tone = "neutral" }: { title: string; help: GlossaryKey; value: string; children?: React.ReactNode; tone?: "neutral" | "warn" }) {
  return (
    <Card className={tone === "warn" ? "border-amber-400" : undefined}>
      <h3 className="text-sm font-semibold text-slate-700">
        {title}
        <InfoTip k={help} />
      </h3>
      <p className="mt-1 text-3xl font-bold tabular-nums text-brand-900">{value}</p>
      {children ? <div className="mt-2 space-y-0.5 text-sm text-slate-700">{children}</div> : null}
    </Card>
  );
}

const statusTone: Record<CoverageStatus, "ok" | "neutral" | "warn" | "demo"> = {
  realizado: "ok",
  cero_confirmado: "ok",
  omitido: "warn",
  pendiente: "neutral",
};

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { actor, allowed } = await requireActorWith("indicators:read", "/dashboard");
  if (!allowed) return <Forbidden what="el tablero de indicadores" />;

  const today = santiagoToday();
  const { filters, notices } = parseIndicatorFilters(sp, today);
  const [options, data, moves] = await Promise.all([
    loadIndicatorOptions(actor, filters.origin),
    getIndicators(actor, filters),
    listPeriodMovements(actor, filters),
  ]);
  const k = data.kpis;
  const cov = summarizeCoverage(data.occurrences);
  const incomplete = includesToday(filters, today);
  const demo = filters.origin === "demo";
  const noDataAtAll = !demo && !data.hasRealData;
  const closingCalc = k.openingG + k.capturedG + k.adjustInG - k.adjustOutG - k.dispatchedG - k.reusedG - k.rejectedG + k.transferInG - k.transferOutG;
  const closingMatches = closingCalc === k.closingG;

  // Cobertura por contenedor
  const perContainer = new Map<string, typeof data.occurrences>();
  for (const o of data.occurrences) perContainer.set(o.containerId, [...(perContainer.get(o.containerId) ?? []), o]);
  const containerRows = [...perContainer.entries()]
    .map(([id, occ]) => ({ info: data.containers[id], occ, sum: summarizeCoverage(occ) }))
    .filter((r) => r.info)
    .sort((a, b) => a.info!.code.localeCompare(b.info!.code));
  const omittedDays = data.occurrences.filter((o) => o.status === "omitido");

  const historyQuery = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.zoneId) historyQuery.set("zone", filters.zoneId);
  if (filters.materialId) historyQuery.set("material", filters.materialId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">
            Tablero de indicadores {demo ? <DemoBadge /> : null}
          </h1>
          <p className="text-slate-700">
            Del {dmy(filters.from)} al {dmy(filters.to)} · días en hora de Chile (America/Santiago) · masas en kilogramos. Solo se muestra lo que su rol y zona permiten ver.
          </p>
          <div className="mt-3">
            <ExportPicker filters={Object.fromEntries(filtersToParams(filters))} />
          </div>
        </div>
      </div>

      {demo ? (
        <Alert tone="warning" role="status">
          <strong>Datos de demostración.</strong> No son mediciones reales: no los use para informar resultados del piloto.
        </Alert>
      ) : null}
      {noDataAtAll ? (
        <Alert tone="info" role="status">
          Aún no hay pesajes reales registrados en su ámbito, por eso los indicadores muestran cero. Puede{" "}
          <Link className="font-semibold underline" href={`/dashboard?${filtersToParams({ ...filters, origin: "demo" }).toString()}`}>ver los datos de demostración</Link>{" "}
          (nunca se mezclan con los reales).
        </Alert>
      ) : null}
      {notices.map((n) => (
        <Alert key={n} tone="warning" role="status">{n}</Alert>
      ))}
      {incomplete ? (
        <Alert tone="info" role="status">
          El período incluye hoy, un día todavía incompleto: las cifras pueden aumentar durante el día
          {cov.pending > 0 ? ` y hay ${cov.pending} medición${cov.pending === 1 ? "" : "es"} de hoy pendiente${cov.pending === 1 ? "" : "s"} (no cuentan como omitidas hasta que termine el día)` : ""}.
        </Alert>
      ) : null}

      <Card>
        <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5" aria-label="Filtros del tablero">
          <Field id="from" label="Desde">
            <Input id="from" name="from" type="date" defaultValue={filters.from} max={today} />
          </Field>
          <Field id="to" label="Hasta">
            <Input id="to" name="to" type="date" defaultValue={filters.to} max={today} />
          </Field>
          <Field id="zone" label="Zona" help="zona">
            <Select id="zone" name="zone" defaultValue={filters.zoneId ?? ""}>
              <option value="">Todas</option>
              {options.zones.map((z) => (
                <option key={z.id} value={z.id}>{z.name}</option>
              ))}
            </Select>
          </Field>
          <Field id="material" label="Material">
            <Select id="material" name="material" defaultValue={filters.materialId ?? ""}>
              <option value="">Todos</option>
              {options.materials.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
          </Field>
          <Field id="origin" label="Origen de los datos" help="origen_datos">
            <Select id="origin" name="origin" defaultValue={filters.origin}>
              <option value="real">Reales</option>
              <option value="demo">DEMO (demostración)</option>
            </Select>
          </Field>
          <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-5">
            <Button type="submit">Aplicar</Button>
            <Button asChild variant="ghost"><Link href="/dashboard">Restablecer</Link></Button>
          </div>
        </form>
      </Card>

      <section aria-labelledby="h-resumen" className="space-y-3">
        <h2 id="h-resumen" className="text-xl font-bold text-brand-900">Resumen del período</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Tile title="Reciclable captado" help="reciclable_captado" value={formatKg(k.capturedG)}>
            <div>{k.weighings} pesaje{k.weighings === 1 ? "" : "s"} · {k.contaminated} con contaminación observada<InfoTip k="contaminacion" /></div>
            <p>
              <Link className="font-semibold text-brand-700 underline" href={`/historial?${historyQuery.toString()}`}>Ver pesajes</Link>
            </p>
          </Tile>
          <Tile title="Despachado a gestor" help="despacho" value={formatKg(k.dispatchedG)}>
            <div>Valorización confirmada<InfoTip k="valorizacion" />: <strong>{formatKg(k.dispatchedConfirmedG)}</strong></div>
            <p>Verificación rechazada: {formatKg(k.dispatchedRejectedG)}</p>
            <div>Sin decisión<InfoTip k="sin_decision" />: {formatKg(k.dispatchedPendingG)}{k.dispatchedPendingNoEvidenceG > 0 ? ` (de ellos ${formatKg(k.dispatchedPendingNoEvidenceG)} sin evidencia)` : ""}</div>
            <p className="text-slate-600">Fecha del despacho, no de la confirmación.</p>
          </Tile>
          <Tile title="Reutilizado" help="reutilizacion" value={formatKg(k.reusedG)}>
            <div>Respaldado con evidencia<InfoTip k="evidencia" />: <strong>{formatKg(k.reusedBackedG)}</strong></div>
            <p>Solo registrado: {formatKg(k.reusedG - k.reusedBackedG)}</p>
          </Tile>
          <Tile title="Rechazado" help="rechazo" value={formatKg(k.rejectedG)}>
            <p>Material que salió del inventario por rechazo.</p>
          </Tile>
          <Tile title="Inventario al cierre" help="inventario" value={formatKg(k.closingG)}>
            <p>Al inicio del período: {formatKg(k.openingG)}</p>
            <p>Hoy (actual): <strong>{formatKg(k.currentG)}</strong></p>
          </Tile>
          <Tile title="Cobertura de medición" help="cobertura" value={cov.percent === null ? "Sin datos" : `${String(cov.percent).replace(".", ",")} %`} tone={cov.omitted > 0 ? "warn" : "neutral"}>
            <p>{cov.realized} con pesaje · {cov.zeroConfirmed} revisado{cov.zeroConfirmed === 1 ? "" : "s"} sin residuos (cero) · {cov.omitted} sin revisar (omitida{cov.omitted === 1 ? "" : "s"})</p>
            {cov.pending > 0 ? <p>{cov.pending} pendiente{cov.pending === 1 ? "" : "s"} de hoy (fuera del cálculo)</p> : null}
            {cov.evaluated === 0 ? <p>No hay calendarios con mediciones esperadas en este período y ámbito.</p> : null}
          </Tile>
        </div>
      </section>

      <section aria-labelledby="h-cierre" className="space-y-3">
        <h2 id="h-cierre" className="text-xl font-bold text-brand-900">
          <Term k="cierre_contable">Cierre contable del inventario</Term>
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[420px] text-left text-sm">
            <caption className="sr-only">Conciliación del inventario del período</caption>
            <tbody className="divide-y divide-slate-200">
              {[
                ["Inventario al inicio", k.openingG, ""],
                ["+ Captación (pesajes)", k.capturedG, "+"],
                ["+ Ajustes de entrada", k.adjustInG, "+"],
                ["− Ajustes de salida", k.adjustOutG, "−"],
                ["− Despachos", k.dispatchedG, "−"],
                ["− Reutilización", k.reusedG, "−"],
                ["− Rechazos", k.rejectedG, "−"],
                ["+ Traslados que entran a su ámbito", k.transferInG, "+"],
                ["− Traslados que salen de su ámbito", k.transferOutG, "−"],
              ].map(([label, g]) => (
                <tr key={label as string}>
                  <th scope="row" className="px-3 py-2 font-normal">{label}</th>
                  <td className="px-3 py-2 text-right tabular-nums">{formatGrams(g as number)}</td>
                </tr>
              ))}
              <tr className="bg-brand-50">
                <th scope="row" className="px-3 py-2">= Inventario al cierre</th>
                <td className="px-3 py-2 text-right font-bold tabular-nums">{formatGrams(k.closingG)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {closingMatches ? (
          <p className="text-sm text-slate-600">La suma coincide con el inventario reconstruido del libro de movimientos. El traslado entre zonas conserva la masa: no es captación.</p>
        ) : (
          <Alert tone="error" role="alert">La suma de los componentes ({formatGrams(closingCalc)}) no coincide con el inventario al cierre ({formatGrams(k.closingG)}). Avise a un administrador: no use estas cifras hasta revisarlo.</Alert>
        )}
      </section>

      <section aria-labelledby="h-semanal" className="space-y-3">
        <h2 id="h-semanal" className="text-xl font-bold text-brand-900">Captación semanal por material</h2>
        <Card>
          <WeeklyChart weekly={data.weekly} materials={options.materials} from={filters.from} to={filters.to} />
        </Card>
      </section>

      <section aria-labelledby="h-cobertura" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="h-cobertura" className="text-xl font-bold text-brand-900">
            <Term k="cobertura">Cobertura por contenedor</Term>
          </h2>
          {can(actor, "schedule:manage") || can(actor, "measurement:zero") ? (
            <Button asChild variant="outline"><Link href="/calendarios">Calendarios y «cero confirmado»</Link></Button>
          ) : null}
        </div>
        <p className="text-sm text-slate-700">
          Una medición esperada se considera atendida si hay un pesaje del contenedor ese día calendario o si se confirmó «cero» (revisado y sin residuos). La ausencia de registro no equivale a cero: queda como omitida.
        </p>
        {containerRows.length === 0 ? (
          <Alert tone="info">No hay mediciones esperadas en este período: aún no se han programado calendarios para los contenedores de este ámbito.</Alert>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[700px] text-left text-sm">
              <caption className="sr-only">Cobertura de medición por contenedor</caption>
              <thead className="bg-brand-50 text-slate-800">
                <tr>
                  <th scope="col" className="px-3 py-2">Contenedor<InfoTip k="contenedor" /></th>
                  <th scope="col" className="px-3 py-2">Zona</th>
                  <th scope="col" className="px-3 py-2 text-right">Con pesaje<InfoTip k="con_pesaje" /></th>
                  <th scope="col" className="px-3 py-2 text-right">Revisado, sin residuos (cero)<InfoTip k="cero" /></th>
                  <th scope="col" className="px-3 py-2 text-right">Sin revisar (omitidas)<InfoTip k="omitida" /></th>
                  <th scope="col" className="px-3 py-2 text-right">Pendientes de hoy<InfoTip k="pendiente" /></th>
                  <th scope="col" className="px-3 py-2 text-right">Cobertura<InfoTip k="cobertura" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {containerRows.map((r) => (
                  <tr key={r.info!.id}>
                    <td className="px-3 py-2"><span className="font-mono text-xs">{r.info!.code}</span><br />{r.info!.materialName}</td>
                    <td className="px-3 py-2">{r.info!.zoneName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.sum.realized}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.sum.zeroConfirmed}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.sum.omitted}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.sum.pending}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{r.sum.percent === null ? "—" : `${String(r.sum.percent).replace(".", ",")} %`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {omittedDays.length > 0 ? (
          <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold text-brand-900">Ver mediciones omitidas ({omittedDays.length})</summary>
            <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              {omittedDays.slice(0, 200).map((o) => (
                <li key={`${o.containerId}-${o.day}`}>
                  <Badge tone={statusTone[o.status]}>{COVERAGE_LABEL[o.status]}</Badge> {dmy(o.day)} · <span className="font-mono text-xs">{data.containers[o.containerId]?.code ?? "—"}</span>
                </li>
              ))}
            </ul>
            {omittedDays.length > 200 ? <p className="mt-2 text-sm text-slate-600">Se muestran las primeras 200; el CSV de cobertura las incluye todas.</p> : null}
          </details>
        ) : null}
        {data.unplannedWeighings > 0 ? (
          <p className="text-sm text-slate-600">
            Informativo: {data.unplannedWeighings} pesaje{data.unplannedWeighings === 1 ? "" : "s"} en días sin medición esperada (contenedores con calendario). No cuentan en el porcentaje.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="h-mov" className="space-y-3">
        <h2 id="h-mov" className="text-xl font-bold text-brand-900">Movimientos del período</h2>
        <p className="text-sm text-slate-700">Registros que respaldan los indicadores (sin correcciones ni los movimientos corregidos). Más recientes primero.</p>
        {moves.rows.length === 0 ? (
          <Alert tone="info">No hay movimientos en este período y ámbito.</Alert>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[760px] text-left text-sm">
              <caption className="sr-only">Movimientos efectivos del período</caption>
              <thead className="bg-brand-50 text-slate-800">
                <tr>
                  <th scope="col" className="px-3 py-2">Fecha</th>
                  <th scope="col" className="px-3 py-2">Tipo</th>
                  <th scope="col" className="px-3 py-2">Lote / material</th>
                  <th scope="col" className="px-3 py-2">Origen → destino</th>
                  <th scope="col" className="px-3 py-2 text-right">Cantidad</th>
                  <th scope="col" className="px-3 py-2">Valorización<InfoTip k="valorizacion" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {moves.rows.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap px-3 py-2">{formatSantiago(m.occurredAt)}</td>
                    <td className="px-3 py-2">{MOVEMENT_LABEL[m.type as keyof typeof MOVEMENT_LABEL] ?? m.type}</td>
                    <td className="px-3 py-2">
                      <Link className="font-mono text-brand-700 underline" href={`/lotes/${m.batchId}`}>{formatBatchRef(m.batchRef)}</Link>
                      <br />{m.materialName}
                    </td>
                    <td className="px-3 py-2">{m.fromName ?? "—"} → {m.toName ?? m.destinationName ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatKg(m.quantityG)}</td>
                    <td className="px-3 py-2">
                      {m.verification === null ? "—" : m.verification === "confirmada" ? <Badge tone="ok">Confirmada</Badge> : m.verification === "rechazada" ? <Badge tone="warn">Rechazada</Badge> : <Badge>Sin decisión{m.evidenceCount === 0 ? " · sin evidencia" : ""}</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {moves.truncated ? <p className="text-sm text-slate-600">Se muestran los 100 más recientes; el CSV de movimientos trae el detalle completo.</p> : null}
      </section>

      <section aria-labelledby="h-def">
        <Card>
          <h2 id="h-def" className="text-lg font-bold text-brand-900">Cómo se calculan estas cifras</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li><strong>Captado:</strong> suma del neto de los pesajes del período. Los traslados entre zonas y los ajustes no son captación.</li>
            <li><strong>Despachos, reutilización, rechazos y ajustes:</strong> se asignan al período por la fecha del propio movimiento. Un movimiento corregido y su corrección se anulan mutuamente; una corrección posterior puede cambiar períodos ya consultados.</li>
            <li><strong>Valorización:</strong> «confirmada» es la última decisión de verificación del despacho (con evidencia); se cuenta por la fecha del despacho. No genera otra salida de inventario.</li>
            <li><strong>Inventario:</strong> reconstruido desde los lotes y movimientos; el valor «actual» coincide con los saldos por ubicación.</li>
            <li><strong>Cobertura:</strong> (con pesaje + cero confirmado) ÷ (con pesaje + cero confirmado + omitidas). Las de hoy quedan pendientes y no entran en el denominador.</li>
            <li><strong>Ámbito:</strong> cada persona ve solo sus zonas. Los datos DEMO y los reales nunca se suman.</li>
            <li>
              <strong>Decisiones abiertas con el Hub</strong> que podrían cambiar estas definiciones: ubicación = zona (H-01), valorización como verificación sin segunda salida (H-05) y material único por contenedor sin excepciones (H-07). Las cifras de inventario y ubicaciones dependen de H-01; las de valorización, de H-05; las de captación por material, de H-07.
            </li>
          </ul>
          <p className="mt-3 text-sm">
            ¿Algún término no queda claro? Mire el icono (i) junto a cada cifra o el{" "}
            <Link className="font-semibold text-brand-700 underline" href="/ayuda">glosario de Ayuda</Link>.
          </p>
        </Card>
      </section>
    </div>
  );
}
