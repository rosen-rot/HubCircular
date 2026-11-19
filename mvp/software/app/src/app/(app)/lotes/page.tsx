import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, Layers, Package, Scale } from "lucide-react";
import { Forbidden } from "@/components/forbidden";
import { BatchPanel } from "@/components/lotes/batch-panel";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, DemoBadge } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import { formatSantiago } from "@/lib/time";
import { requireActorWith } from "@/modules/identity/guards";
import { can } from "@/modules/identity/permissions";
import { loadIndicatorOptions } from "@/modules/indicators/queries";
import { BATCH_STATUS_LABEL, batchStatus, parseBatchFilters, parseSelected, type BatchFilters } from "@/modules/inventory/filters";
import { getBatchDetail, listBatches } from "@/modules/inventory/queries";
import { listBatchMovements } from "@/modules/movements/queries";
import { formatBatchRef } from "@/modules/weighing/refs";
import { formatKg } from "@/modules/weighing/units";

export const metadata: Metadata = { title: "Lotes" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

function queryOf(f: BatchFilters, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  const base: Record<string, string> = {
    from: f.from, to: f.to, material: f.materialId ?? "", zone: f.zoneId ?? "", estado: f.status ?? "", ref: f.ref,
    origin: f.origin === "demo" ? "demo" : "",
  };
  for (const [k, v] of Object.entries({ ...base, ...extra })) if (v) q.set(k, v);
  return q.toString();
}

export default async function LotesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { actor, allowed } = await requireActorWith("batch:read", "/lotes");
  if (!allowed) return <Forbidden what="los lotes" />;

  const f = parseBatchFilters(sp);
  const selectedId = parseSelected(sp);
  const [options, list] = await Promise.all([loadIndicatorOptions(actor, f.origin), listBatches(actor, f)]);
  const selected = selectedId ? await getBatchDetail(actor, selectedId) : null;
  const movements = selected && can(actor, "movement:read") ? await listBatchMovements(actor, selected.id) : [];
  const demo = f.origin === "demo";
  const hasFilters = Boolean(f.from || f.to || f.materialId || f.zoneId || f.status || f.ref);
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const page = (n: number) => `/lotes?${queryOf(f, { page: String(n) })}`;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Boxes}
        title={<>Lotes {demo ? <DemoBadge /> : null}</>}
        subtitle="Cada pesaje confirmado crea un lote. El saldo cambia con los movimientos; la captación inicial no se modifica. Fechas en hora de Chile."
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
          Aún no hay lotes reales en su ámbito. Puede <Link className="font-semibold underline" href="/lotes?origin=demo">ver los lotes de demostración</Link> (nunca se mezclan con los reales).
        </Alert>
      ) : null}

      <section aria-labelledby="resumen-lotes">
        <h2 id="resumen-lotes" className="sr-only">Resumen de los lotes filtrados</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard icon={Boxes} tone="mint" label="Lotes" value={String(list.total)}>
            <p>{list.totals.withBalance} con saldo disponible</p>
          </KpiCard>
          <KpiCard icon={Scale} tone="sky" label="Captación inicial" value={formatKg(list.totals.initialG)}>
            <p>Suma de los lotes filtrados</p>
          </KpiCard>
          <KpiCard icon={Package} tone="amber" label="Saldo actual" value={formatKg(list.totals.balanceG)}>
            <p>Lo que sigue disponible</p>
          </KpiCard>
          <KpiCard icon={Layers} tone="lilac" label="Ya movido" value={formatKg(Math.max(0, list.totals.initialG - list.totals.balanceG))}>
            <p>Despachos, reutilización, rechazos y ajustes</p>
          </KpiCard>
        </div>
      </section>

      <Card>
        <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Filtros de lotes">
          <Field id="ref" label="Referencia" hint="L-12, P-7 o parte del código del contenedor">
            <Input id="ref" name="ref" defaultValue={f.ref} placeholder="L-000012" />
          </Field>
          <Field id="material" label="Material">
            <Select id="material" name="material" defaultValue={f.materialId ?? ""}>
              <option value="">Todos</option>
              {options.materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </Field>
          <Field id="zone" label="Ubicación con saldo" help="zona">
            <Select id="zone" name="zone" defaultValue={f.zoneId ?? ""}>
              <option value="">Todas</option>
              {options.zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </Select>
          </Field>
          <Field id="estado" label="Estado">
            <Select id="estado" name="estado" defaultValue={f.status ?? ""}>
              <option value="">Todos</option>
              {(Object.keys(BATCH_STATUS_LABEL) as (keyof typeof BATCH_STATUS_LABEL)[]).map((s) => <option key={s} value={s}>{BATCH_STATUS_LABEL[s]}</option>)}
            </Select>
          </Field>
          <Field id="from" label="Captado desde"><Input id="from" name="from" type="date" defaultValue={f.from} /></Field>
          <Field id="to" label="Captado hasta"><Input id="to" name="to" type="date" defaultValue={f.to} /></Field>
          <Field id="origin" label="Origen de los datos" help="origen_datos">
            <Select id="origin" name="origin" defaultValue={f.origin}>
              <option value="real">Reales</option>
              <option value="demo">DEMO (demostración)</option>
            </Select>
          </Field>
          <div className="flex items-end gap-3">
            <Button type="submit">Aplicar filtros</Button>
            {hasFilters ? <Link href={`/lotes${demo ? "?origin=demo" : ""}`} className="text-sm font-semibold text-brand-700 underline">Limpiar</Link> : null}
          </div>
        </form>
      </Card>

      <div className={cn("grid grid-cols-1 gap-4", selected ? "xl:grid-cols-[minmax(0,1fr)_26rem]" : "")}>
        <div className="min-w-0 space-y-3">
          {list.total === 0 ? (
            <Card><p className="text-slate-700">{hasFilters ? "Ningún lote coincide con los filtros." : "Todavía no hay lotes."}</p></Card>
          ) : (
            <div className="relative overflow-x-auto rounded-2xl border border-slate-200 bg-white" tabIndex={0} role="region" aria-label="Lotes (se desplaza horizontalmente)">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Lotes, del más reciente al más antiguo</caption>
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th scope="col" className="px-3 py-2">Lote</th>
                    <th scope="col" className="px-3 py-2">Material y origen</th>
                    <th scope="col" className="px-3 py-2 text-right">Captación</th>
                    <th scope="col" className="px-3 py-2 text-right">Saldo</th>
                    <th scope="col" className="px-3 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {list.rows.map((b) => {
                    const st = batchStatus(b.initialG, b.balanceG);
                    const active = b.id === selectedId;
                    return (
                      <tr key={b.id} className={active ? "bg-brand-50" : undefined} data-testid="lote">
                        <th scope="row" className="whitespace-nowrap px-3 py-2 font-normal">
                          <Link href={`/lotes?${queryOf(f, { page: f.page > 1 ? String(f.page) : "", lote: b.id })}`} aria-current={active ? "true" : undefined} className="font-mono font-semibold text-brand-700 underline">
                            {formatBatchRef(b.refNo)}
                          </Link>{" "}
                          {b.dataOrigin === "demo" ? <DemoBadge /> : null}
                          <div className="text-xs text-slate-600">{formatSantiago(b.createdAt)}</div>
                        </th>
                        <td className="px-3 py-2">
                          {b.materialName}
                          <div className="text-xs text-slate-600">{b.originZoneName ?? "—"}</div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatKg(b.initialG)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatKg(b.balanceG)}</td>
                        <td className="px-3 py-2"><Badge tone={st === "sin_saldo" ? "neutral" : st === "parcial" ? "warn" : "ok"}>{BATCH_STATUS_LABEL[st]}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {totalPages > 1 ? (
            <nav aria-label="Páginas de lotes" className="flex items-center justify-between text-sm">
              <span>Página {list.page} de {totalPages} · {list.total} lotes</span>
              <span className="flex gap-3">
                {list.page > 1 ? <Link className="font-semibold text-brand-700 underline" href={page(list.page - 1)}>← Anterior</Link> : null}
                {list.page < totalPages ? <Link className="font-semibold text-brand-700 underline" href={page(list.page + 1)}>Siguiente →</Link> : null}
              </span>
            </nav>
          ) : null}
        </div>
        {selected ? (
          <BatchPanel batch={selected} movements={movements} closeHref={`/lotes?${queryOf(f, { page: f.page > 1 ? String(f.page) : "" })}`} canMove={can(actor, "movement:create") && selected.totalBalanceG > 0} />
        ) : selectedId ? (
          <Alert tone="warning" role="status">El lote pedido no existe o no está dentro de su ámbito.</Alert>
        ) : null}
      </div>
    </div>
  );
}
