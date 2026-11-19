import type { Metadata } from "next";
import { History } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import { Forbidden } from "@/components/forbidden";
import { InfoTip } from "@/components/help/info-tip";
import { Alert, Badge, Card, DemoBadge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { formatSantiago } from "@/lib/time";
import { loadFilterOptions } from "@/modules/catalog/queries";
import { requireActorWith } from "@/modules/identity/guards";
import { listWeighings, type HistoryFilters } from "@/modules/weighing/queries";
import { formatBatchRef, formatWeighingRef } from "@/modules/weighing/refs";
import { formatKg } from "@/modules/weighing/units";

export const metadata: Metadata = { title: "Historial" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function HistorialPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { actor, allowed } = await requireActorWith("weighing:read", "/historial");
  if (!allowed) return <Forbidden what="el historial" />;

  const filters: HistoryFilters = {
    from: one(sp.from),
    to: one(sp.to),
    materialId: one(sp.material),
    zoneId: one(sp.zone),
    userId: one(sp.user),
    ref: one(sp.ref),
    page: Number(one(sp.page)) || 1,
  };
  const [options, result] = await Promise.all([loadFilterOptions(actor), listWeighings(actor, filters)]);
  const hasFilters = Boolean(filters.from || filters.to || filters.materialId || filters.zoneId || filters.userId || filters.ref);
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  const link = (page: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ from: filters.from, to: filters.to, material: filters.materialId, zone: filters.zoneId, user: filters.userId, ref: filters.ref })) {
      if (v) q.set(k, v);
    }
    q.set("page", String(page));
    return `/historial?${q.toString()}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader icon={History} title={'Historial de pesajes'} subtitle={<>Captaciones registradas, de la más reciente a la más antigua. Fechas en hora de Chile.</>} />

      <Card>
        <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Filtros">
          <Field id="from" label="Desde">
            <Input id="from" name="from" type="date" defaultValue={filters.from} />
          </Field>
          <Field id="to" label="Hasta">
            <Input id="to" name="to" type="date" defaultValue={filters.to} />
          </Field>
          <Field id="ref" label="Referencia o contenedor" hint="Ej.: P-12, L-7, DEMO-Z01">
            <Input id="ref" name="ref" defaultValue={filters.ref} maxLength={64} />
          </Field>
          <Field id="material" label="Material">
            <Select id="material" name="material" defaultValue={filters.materialId}>
              <option value="">Todos</option>
              {options.materials.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
          </Field>
          <Field id="zone" label="Zona">
            <Select id="zone" name="zone" defaultValue={filters.zoneId}>
              <option value="">Todas</option>
              {options.zones.map((z) => (
                <option key={z.id} value={z.id}>{z.name}</option>
              ))}
            </Select>
          </Field>
          <Field id="user" label="Registrado por">
            <Select id="user" name="user" defaultValue={filters.userId}>
              <option value="">Todos</option>
              {options.users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-3">
            <Button type="submit">Filtrar</Button>
            {hasFilters ? (
              <Button asChild variant="ghost">
                <Link href="/historial">Limpiar filtros</Link>
              </Button>
            ) : null}
          </div>
        </form>
      </Card>

      <p className="text-sm text-slate-700" role="status">
        {result.total === 0 ? "Sin resultados" : `${result.total} pesaje${result.total === 1 ? "" : "s"}`}
        {totalPages > 1 ? ` · página ${result.page} de ${totalPages}` : ""}
      </p>

      {result.rows.length === 0 ? (
        <Alert tone="info">
          {hasFilters ? "Ningún pesaje coincide con los filtros." : "Aún no hay pesajes registrados en su ámbito."}
        </Alert>
      ) : (
        <div className="relative overflow-x-auto rounded-2xl border border-slate-200 bg-white" tabIndex={0} role="region" aria-label="Pesajes registrados (se desplaza horizontalmente)">
          <table className="w-full min-w-[820px] text-left text-sm">
            <caption className="sr-only">Pesajes registrados</caption>
            <thead className="bg-brand-50 text-slate-800">
              <tr>
                <th scope="col" className="px-3 py-2">Pesaje<InfoTip k="pesaje" /></th>
                <th scope="col" className="px-3 py-2">Fecha</th>
                <th scope="col" className="px-3 py-2">Contenedor / material</th>
                <th scope="col" className="px-3 py-2">Zona<InfoTip k="zona" /></th>
                <th scope="col" className="px-3 py-2 text-right">Bruto<InfoTip k="bruto" /></th>
                <th scope="col" className="px-3 py-2 text-right">Tara (envase)<InfoTip k="tara" /></th>
                <th scope="col" className="px-3 py-2 text-right">Neto (material)<InfoTip k="neto" /></th>
                <th scope="col" className="px-3 py-2">Lote<InfoTip k="lote" /></th>
                <th scope="col" className="px-3 py-2">Registró</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {result.rows.map((w) => (
                <tr key={w.id}>
                  <td className="px-3 py-2">
                    <Link className="font-mono font-semibold text-brand-700 underline" href={`/pesajes/${w.id}`}>
                      {formatWeighingRef(w.refNo)}
                    </Link>{" "}
                    {w.dataOrigin === "demo" ? <DemoBadge /> : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{formatSantiago(w.occurredAt)}</td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs">{w.containerCode ?? "—"}</span>
                    <br />
                    {w.materialName}
                    {w.contaminationObserved ? <> <Badge tone="warn" title="Se vio basura u otro material mezclado">contaminación</Badge></> : null}
                  </td>
                  <td className="px-3 py-2">{w.zoneName ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatKg(w.grossG)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatKg(w.tareG)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatKg(w.netG)}</td>
                  <td className="px-3 py-2">
                    {w.batchId && w.batchRef ? (
                      <Link className="font-mono text-brand-700 underline" href={`/lotes/${w.batchId}`}>
                        {formatBatchRef(w.batchRef)}
                      </Link>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2">{w.createdByName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Paginación" className="flex items-center gap-3">
          {result.page > 1 ? <Button asChild variant="outline"><Link href={link(result.page - 1)}>← Anterior</Link></Button> : null}
          {result.page < totalPages ? <Button asChild variant="outline"><Link href={link(result.page + 1)}>Siguiente →</Link></Button> : null}
        </nav>
      ) : null}
    </div>
  );
}
