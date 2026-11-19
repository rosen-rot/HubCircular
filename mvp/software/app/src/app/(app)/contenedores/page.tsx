import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Badge, DemoBadge } from "@/components/ui/card";
import { Forbidden } from "@/components/forbidden";
import { listContainers } from "@/modules/catalog/queries";
import { requireActorWith } from "@/modules/identity/guards";
import { can } from "@/modules/identity/permissions";
import { formatKg } from "@/modules/weighing/units";

export const metadata: Metadata = { title: "Contenedores" };
export const dynamic = "force-dynamic";

export default async function ContenedoresPage() {
  const { actor, allowed } = await requireActorWith("catalog:read", "/contenedores");
  if (!allowed) return <Forbidden what="el catálogo de contenedores" />;
  const containers = await listContainers(actor);
  const canRegister = can(actor, "weighing:create");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">Contenedores</h1>
        <p className="text-slate-700">Contenedores visibles en su ámbito. El código del QR apunta a <code>/registro?container=CÓDIGO</code>.</p>
      </div>
      <Alert tone="info">
        El QR <strong>solo identifica</strong> el contenedor y precarga el formulario: para registrar hay que iniciar sesión y tener permiso. La administración
        del catálogo (altas, ediciones, inactivación) y la generación de imágenes QR llegan en la siguiente iteración; hoy el catálogo proviene de datos semilla.
      </Alert>
      {containers.length === 0 ? (
        <Alert tone="warning">No hay contenedores configurados en su ámbito.</Alert>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">Contenedores</caption>
            <thead className="bg-brand-50"><tr>
              <th scope="col" className="px-3 py-2">Código</th><th scope="col" className="px-3 py-2">Material</th><th scope="col" className="px-3 py-2">Estación</th>
              <th scope="col" className="px-3 py-2">Zona</th><th scope="col" className="px-3 py-2 text-right">Tara nominal</th><th scope="col" className="px-3 py-2">Estado</th><th scope="col" className="px-3 py-2"><span className="sr-only">Acción</span></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-200">
              {containers.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2 font-mono text-xs">{c.code} {c.dataOrigin === "demo" ? <DemoBadge /> : null}</td>
                  <td className="px-3 py-2">{c.materialName}</td>
                  <td className="px-3 py-2">{c.stationName}</td>
                  <td className="px-3 py-2">{c.zoneName}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.tareG != null ? formatKg(c.tareG) : "—"}</td>
                  <td className="px-3 py-2">{c.fullyActive ? <Badge tone="ok">Activo</Badge> : <Badge tone="warn">Inactivo</Badge>}</td>
                  <td className="px-3 py-2">
                    {canRegister && c.fullyActive ? (
                      <Link className="font-semibold text-brand-700 underline" href={`/registro?container=${encodeURIComponent(c.code)}`}>Registrar pesaje</Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
