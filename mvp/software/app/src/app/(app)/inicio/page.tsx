import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, House, Package, Recycle, Scale, TrendingDown, TrendingUp } from "lucide-react";
import { Forbidden } from "@/components/forbidden";
import { InfoTip } from "@/components/help/info-tip";
import { MaterialsDonut } from "@/components/inicio/materials-donut";
import { TrendChart, type TrendMetric } from "@/components/inicio/trend-chart";
import { Alert, Card, DemoBadge } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import { formatSantiago } from "@/lib/time";
import { requireActorWith } from "@/modules/identity/guards";
import { can } from "@/modules/identity/permissions";
import { HOME_PERIODS, parseHomeFilters, pctChange } from "@/modules/inicio/filters";
import { getHome } from "@/modules/inicio/queries";
import { formatWeighingRef } from "@/modules/weighing/refs";
import { formatKg } from "@/modules/weighing/units";

export const metadata: Metadata = { title: "Inicio" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const dmy = (d: string) => `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`;
const pctText = (p: number) => `${p > 0 ? "+" : ""}${String(p).replace(".", ",")} %`;

function Change({ now, before, what }: { now: number; before: number; what: string }) {
  const p = pctChange(now, before);
  if (p === null) return <span>Sin base de comparación en el período anterior.</span>;
  const Icon = p >= 0 ? TrendingUp : TrendingDown;
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span>
        <strong>{pctText(p)}</strong> {what}
      </span>
    </span>
  );
}

export default async function InicioPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { actor, allowed } = await requireActorWith("indicators:read", "/inicio");
  if (!allowed) return <Forbidden what="el inicio" />;

  const f = parseHomeFilters(sp);
  const metric: TrendMetric = (Array.isArray(sp.serie) ? sp.serie[0] : sp.serie) === "n" ? "n" : "kg";
  const h = await getHome(actor, f);
  const demo = f.origin === "demo";
  const noDataAtAll = !demo && !h.hasRealData;
  const canHistory = can(actor, "weighing:read");
  const canRegister = can(actor, "weighing:create");
  const q = (over: Record<string, string>) => new URLSearchParams({ days: String(f.days), origin: f.origin, serie: metric, ...over }).toString();
  const cov = h.todayCoverage;
  const attended = cov.realized + cov.zeroConfirmed;

  const pill = (active: boolean) =>
    cn(
      "inline-flex min-h-9 items-center rounded-full px-3 text-sm font-semibold",
      active ? "bg-brand-600 text-white" : "bg-white text-brand-900 ring-1 ring-slate-300 hover:bg-brand-50",
    );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={House}
        title={
          <>
            Inicio {demo ? <DemoBadge /> : null}
          </>
        }
        subtitle={`Del ${dmy(h.from)} al ${dmy(h.to)} · días en hora de Chile · masas en kilogramos. Solo se muestra lo que su rol y zona permiten ver.`}
        actions={
          canRegister ? (
            <Link href="/registro" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
              <Scale className="h-4 w-4" aria-hidden="true" />
              Registrar pesaje
            </Link>
          ) : null
        }
      />

      {demo ? (
        <Alert tone="warning" role="status">
          <strong>Datos de demostración.</strong> No son mediciones reales: no los use para informar resultados del piloto.
        </Alert>
      ) : null}
      {noDataAtAll ? (
        <Alert tone="info" role="status">
          Aún no hay pesajes reales registrados en su ámbito, por eso las cifras muestran cero. Puede{" "}
          <Link className="font-semibold underline" href={`/inicio?${q({ origin: "demo" })}`}>ver los datos de demostración</Link> (nunca se mezclan con los reales).
        </Alert>
      ) : null}

      <nav aria-label="Período y origen de los datos" className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-700">Período:</span>
        {HOME_PERIODS.map((d) => (
          <Link key={d} href={`/inicio?${q({ days: String(d) })}`} className={pill(f.days === d)} aria-current={f.days === d ? "true" : undefined}>
            {d} días
          </Link>
        ))}
        <span className="ml-2 text-sm font-semibold text-slate-700">Datos:</span>
        <Link href={`/inicio?${q({ origin: "real" })}`} className={pill(!demo)} aria-current={!demo ? "true" : undefined}>Reales</Link>
        <Link href={`/inicio?${q({ origin: "demo" })}`} className={pill(demo)} aria-current={demo ? "true" : undefined}>DEMO</Link>
      </nav>

      <section aria-labelledby="resumen" className="space-y-3">
        <h2 id="resumen" className="sr-only">Resumen del período</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard icon={Recycle} tone="mint" label="Reciclable captado" help={<InfoTip k="reciclable_captado" />} value={formatKg(h.capturedG)}>
            <p><Change now={h.capturedG} before={h.prevCapturedG} what={`vs. los ${f.days} días anteriores`} /></p>
          </KpiCard>
          <KpiCard icon={Scale} tone="sky" label="Pesajes" value={String(h.weighings)}>
            <p>Hoy: <strong>{h.weighingsToday}</strong> · ayer: {h.weighingsYesterday}</p>
          </KpiCard>
          <KpiCard icon={Package} tone="amber" label="Inventario actual" help={<InfoTip k="inventario" />} value={formatKg(h.currentG)}>
            <p>Saldo al día de hoy, según los movimientos registrados.</p>
          </KpiCard>
          <KpiCard icon={CalendarCheck} tone="lilac" label="Contenedores activos" value={String(h.activeContainers)}>
            <p>
              Medición de hoy:{" "}
              {cov.total === 0 ? "sin calendario" : <><strong>{attended}</strong> de {cov.total} atendida{cov.total === 1 ? "" : "s"}</>}
            </p>
          </KpiCard>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="min-w-0 lg:col-span-2">
          <h2 className="text-lg font-bold text-brand-900">Materiales captados</h2>
          <p className="mb-3 text-sm text-slate-700">Reparto del reciclable captado en el período.</p>
          <MaterialsDonut materials={h.materials} />
        </Card>
        <Card className="min-w-0 lg:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-brand-900">Tendencia diaria</h2>
              <p className="text-sm text-slate-700">{metric === "kg" ? "Kilogramos captados por día." : "Pesajes registrados por día."}</p>
            </div>
            <div className="flex gap-2" role="group" aria-label="Serie del gráfico">
              <Link href={`/inicio?${q({ serie: "kg" })}`} className={pill(metric === "kg")} aria-current={metric === "kg" ? "true" : undefined}>Kg</Link>
              <Link href={`/inicio?${q({ serie: "n" })}`} className={pill(metric === "n")} aria-current={metric === "n" ? "true" : undefined}>N.º de pesajes</Link>
            </div>
          </div>
          <div className="mt-2">
            <TrendChart daily={h.daily} metric={metric} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="min-w-0 lg:col-span-2">
          <h2 className="text-lg font-bold text-brand-900">
            Medición de hoy
            <InfoTip k="medicion_esperada" />
          </h2>
          {cov.total === 0 ? (
            <p className="mt-2 text-sm text-slate-700">No hay mediciones esperadas hoy: no se han programado calendarios para los contenedores de este ámbito o hoy no toca medir.</p>
          ) : (
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><dt>Con pesaje</dt><dd className="font-semibold tabular-nums">{cov.realized}</dd></div>
              <div className="flex justify-between"><dt>Cero confirmado</dt><dd className="font-semibold tabular-nums">{cov.zeroConfirmed}</dd></div>
              <div className="flex justify-between"><dt>Pendientes</dt><dd className="font-semibold tabular-nums">{cov.pending}</dd></div>
            </dl>
          )}
          <p className="mt-3 text-sm">
            <Link href="/calendarios" className="font-semibold text-brand-700 underline">Ver calendarios</Link>
          </p>
        </Card>
        <Card className="min-w-0 lg:col-span-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-brand-900">Últimos pesajes</h2>
            {canHistory ? <Link href="/historial" className="text-sm font-semibold text-brand-700 underline">Ver historial</Link> : null}
          </div>
          {h.recent.length === 0 ? (
            <p className="mt-2 text-sm text-slate-700">Todavía no hay pesajes registrados.</p>
          ) : (
            <div className="mt-2 relative overflow-x-auto" tabIndex={0} role="region" aria-label="Últimos pesajes (se desplaza horizontalmente)">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Los 6 pesajes más recientes</caption>
                <thead>
                  <tr className="border-b border-slate-200 text-slate-700">
                    <th scope="col" className="py-1.5 pr-3">Pesaje</th>
                    <th scope="col" className="py-1.5 pr-3">Fecha y hora</th>
                    <th scope="col" className="py-1.5 pr-3">Contenedor</th>
                    <th scope="col" className="py-1.5 pr-3">Material</th>
                    <th scope="col" className="py-1.5 text-right">Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {h.recent.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100">
                      <th scope="row" className="whitespace-nowrap py-1.5 pr-3 font-semibold">{formatWeighingRef(r.refNo)}</th>
                      <td className="whitespace-nowrap py-1.5 pr-3">{formatSantiago(r.occurredAt)}</td>
                      <td className="py-1.5 pr-3">{r.containerCode ?? "—"}</td>
                      <td className="py-1.5 pr-3">{r.materialName}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatKg(r.netG)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
