import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, ClipboardCheck, FileWarning, Truck } from "lucide-react";
import { Forbidden } from "@/components/forbidden";
import { MovementPanel, STATE_TONE } from "@/components/lotes/movement-panel";
import { VALORIZATION_TEXT, movementRoute } from "@/components/lotes/batch-panel";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, DemoBadge } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import { formatSantiago } from "@/lib/time";
import { requireActorWith } from "@/modules/identity/guards";
import { can } from "@/modules/identity/permissions";
import { MOVEMENT_FILTER_TYPES, VALORIZATION_STATES, parseMovementFilters, parseSelectedMovement, type MovementFilters } from "@/modules/movements/filters";
import { getMovementDetail, listMovements } from "@/modules/movements/queries";
import { MOVEMENT_LABEL } from "@/modules/movements/schema";
import { formatBatchRef, formatMovementRef } from "@/modules/weighing/refs";
import { formatKg } from "@/modules/weighing/units";

export const metadata: Metadata = { title: "Movimientos" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

function queryOf(f: MovementFilters, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  const base: Record<string, string> = { from: f.from, to: f.to, tipo: f.type ?? "", estado: f.state ?? "", ref: f.ref, origin: f.origin === "demo" ? "demo" : "" };
  for (const [k, v] of Object.entries({ ...base, ...extra })) if (v) q.set(k, v);
  return q.toString();
}

export default async function MovimientosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { actor, allowed } = await requireActorWith("movement:read", "/movimientos");
  if (!allowed) return <Forbidden what="los movimientos" />;

  const f = parseMovementFilters(sp);
  const selectedId = parseSelectedMovement(sp);
  const list = await listMovements(actor, f);
  const detail = selectedId ? await getMovementDetail(actor, selectedId) : null;
  const demo = f.origin === "demo";
  const hasFilters = Boolean(f.from || f.to || f.type || f.state || f.ref);
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const page = (n: number) => `/movimientos?${queryOf(f, { page: String(n) })}`;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={ArrowLeftRight}
        title={<>Movimientos {demo ? <DemoBadge /> : null}</>}
        subtitle="Traslados, despachos, reutilización, rechazos, ajustes y correcciones. Un movimiento cambia el saldo del lote; no modifica la captación registrada."
        actions={
          can(actor, "movement:create") ? (
            <Link href="/retiros" className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
              Registrar movimiento
            </Link>
          ) : null
        }
      />

      {demo ? (
        <Alert tone="warning" role="status">
          <strong>Datos de demostración.</strong> No son mediciones reales: no los use para informar resultados del piloto.
        </Alert>
      ) : null}
      {!demo && list.total === 0 && !hasFilters ? (
        <Alert tone="info" role="status">
          Aún no hay movimientos reales en su ámbito. Puede <Link className="font-semibold underline" href="/movimientos?origin=demo">ver los movimientos de demostración</Link> (nunca se mezclan con los reales).
        </Alert>
      ) : null}

      <section aria-labelledby="resumen-mov">
        <h2 id="resumen-mov" className="sr-only">Resumen de los movimientos filtrados</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard icon={ArrowLeftRight} tone="mint" label="Movimientos" value={String(list.total)} />
          <KpiCard icon={Truck} tone="sky" label="Despachos" value={String(list.totals.dispatches)}>
            <p>Salidas hacia un gestor</p>
          </KpiCard>
          <KpiCard icon={FileWarning} tone="amber" label="Sin evidencia" value={String(list.totals.pendingEvidence)}>
            <p>Despachos sin guía ni certificado</p>
          </KpiCard>
          <KpiCard icon={ClipboardCheck} tone="lilac" label="Por verificar" value={String(list.totals.pendingVerification)}>
            <p>Con evidencia, esperando decisión</p>
          </KpiCard>
        </div>
      </section>

      <Card>
        <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Filtros de movimientos">
          <Field id="ref" label="Referencia" hint="M-12 (movimiento) o L-7 (lote)">
            <Input id="ref" name="ref" defaultValue={f.ref} placeholder="M-000012" />
          </Field>
          <Field id="tipo" label="Tipo">
            <Select id="tipo" name="tipo" defaultValue={f.type ?? ""}>
              <option value="">Todos</option>
              {MOVEMENT_FILTER_TYPES.map((t) => <option key={t} value={t}>{MOVEMENT_LABEL[t]}</option>)}
            </Select>
          </Field>
          <Field id="estado" label="Estado del despacho" help="valorizacion">
            <Select id="estado" name="estado" defaultValue={f.state ?? ""}>
              <option value="">Todos</option>
              {VALORIZATION_STATES.map((s) => <option key={s} value={s}>{VALORIZATION_TEXT[s]}</option>)}
            </Select>
          </Field>
          <Field id="origin" label="Origen de los datos" help="origen_datos">
            <Select id="origin" name="origin" defaultValue={f.origin}>
              <option value="real">Reales</option>
              <option value="demo">DEMO (demostración)</option>
            </Select>
          </Field>
          <Field id="from" label="Desde"><Input id="from" name="from" type="date" defaultValue={f.from} /></Field>
          <Field id="to" label="Hasta"><Input id="to" name="to" type="date" defaultValue={f.to} /></Field>
          <div className="flex items-end gap-3 sm:col-span-2">
            <Button type="submit">Aplicar filtros</Button>
            {hasFilters ? <Link href={`/movimientos${demo ? "?origin=demo" : ""}`} className="text-sm font-semibold text-brand-700 underline">Limpiar</Link> : null}
          </div>
        </form>
      </Card>

      <div className={cn("grid grid-cols-1 gap-4", detail ? "xl:grid-cols-[minmax(0,1fr)_26rem]" : "")}>
        <div className="min-w-0 space-y-3">
          {list.total === 0 ? (
            <Card><p className="text-slate-700">{hasFilters ? "Ningún movimiento coincide con los filtros." : "Todavía no hay movimientos."}</p></Card>
          ) : (
            <div className="relative overflow-x-auto rounded-2xl border border-slate-200 bg-white" tabIndex={0} role="region" aria-label="Movimientos (se desplaza horizontalmente)">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Movimientos, del más reciente al más antiguo</caption>
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th scope="col" className="px-3 py-2">Movimiento</th>
                    <th scope="col" className="px-3 py-2">Tipo y estado</th>
                    <th scope="col" className="px-3 py-2">Lote</th>
                    <th scope="col" className="px-3 py-2 text-right">Cantidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {list.rows.map((m) => {
                    const active = m.id === selectedId;
                    return (
                      <tr key={m.id} className={active ? "bg-brand-50" : undefined} data-testid="movimiento-fila">
                        <th scope="row" className="whitespace-nowrap px-3 py-2 font-normal">
                          <Link href={`/movimientos?${queryOf(f, { page: f.page > 1 ? String(f.page) : "", mov: m.id })}`} aria-current={active ? "true" : undefined} className="font-mono font-semibold text-brand-700 underline">
                            {formatMovementRef(m.refNo)}
                          </Link>{" "}
                          {m.dataOrigin === "demo" ? <DemoBadge /> : null}
                          <div className="text-xs text-slate-600">{formatSantiago(m.occurredAt)}</div>
                        </th>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            <Badge>{MOVEMENT_LABEL[m.type]}</Badge>
                            {m.state ? <Badge tone={STATE_TONE[m.state]}>{VALORIZATION_TEXT[m.state]}</Badge> : null}
                          </div>
                          <div className="mt-1 text-xs text-slate-600">{movementRoute(m)}</div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2"><Link className="font-mono text-brand-700 underline" href={`/lotes/${m.batchId}`}>{formatBatchRef(m.batchRef)}</Link></td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatKg(m.quantityG)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {totalPages > 1 ? (
            <nav aria-label="Páginas de movimientos" className="flex items-center justify-between text-sm">
              <span>Página {list.page} de {totalPages} · {list.total} movimientos</span>
              <span className="flex gap-3">
                {list.page > 1 ? <Link className="font-semibold text-brand-700 underline" href={page(list.page - 1)}>← Anterior</Link> : null}
                {list.page < totalPages ? <Link className="font-semibold text-brand-700 underline" href={page(list.page + 1)}>Siguiente →</Link> : null}
              </span>
            </nav>
          ) : null}
        </div>
        {detail ? (
          <MovementPanel movement={detail.movement} batchId={detail.batchId} batchRef={detail.batchRef} demo={demo} closeHref={`/movimientos?${queryOf(f, { page: f.page > 1 ? String(f.page) : "" })}`} />
        ) : selectedId ? (
          <Alert tone="warning" role="status">El movimiento pedido no existe o no está dentro de su ámbito.</Alert>
        ) : null}
      </div>
    </div>
  );
}
