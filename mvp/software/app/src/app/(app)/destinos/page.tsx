import type { Metadata } from "next";
import { Truck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/forbidden";
import { InfoTip, Term } from "@/components/help/info-tip";
import { Badge, Card, DemoBadge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireActorWith } from "@/modules/identity/guards";
import { listDestinations } from "@/modules/movements/queries";
import { DESTINATION_LABEL } from "@/modules/movements/schema";
import { DestinationForm } from "./destination-form";
import { toggleDestinationAction } from "./actions";

export const metadata: Metadata = { title: "Destinos" };
export const dynamic = "force-dynamic";

export default async function DestinosPage() {
  const { actor, allowed } = await requireActorWith("destination:manage", "/destinos");
  if (!allowed) return <Forbidden what="la administración de destinos" />;
  const items = await listDestinations(actor);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader icon={Truck} title={<Term k="destino">Destinos</Term>} subtitle={<>Catálogo de destinos para despachos y reutilización. Un destino se desactiva, no se elimina: los movimientos anteriores conservan su referencia.</>} />
      <Card>
        <h2 className="mb-3 text-lg font-semibold">Nuevo destino</h2>
        <DestinationForm />
      </Card>
      <Card>
        <h2 className="mb-2 text-lg font-semibold">Destinos registrados</h2>
        {items.length === 0 ? (
          <p className="text-slate-700">Aún no hay destinos.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-slate-700">
              <tr>
                <th scope="col" className="py-1">Nombre</th>
                <th scope="col" className="py-1">Tipo<InfoTip k="gestor" /></th>
                <th scope="col" className="py-1">Estado</th>
                <th scope="col" className="py-1 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {items.map((d) => (
                <tr key={d.id}>
                  <td className="py-2">{d.name} {d.dataOrigin === "demo" ? <DemoBadge /> : null}</td>
                  <td className="py-2">{DESTINATION_LABEL[d.type]}</td>
                  <td className="py-2">{d.active ? <Badge tone="ok">Activo</Badge> : <Badge>Inactivo</Badge>}</td>
                  <td className="py-2 text-right">
                    <form action={toggleDestinationAction}>
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="active" value={d.active ? "false" : "true"} />
                      <Button type="submit" variant="outline" size="sm" aria-label={`${d.active ? "Desactivar" : "Activar"} ${d.name}`}>
                        {d.active ? "Desactivar" : "Activar"}
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
