import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { Forbidden } from "@/components/forbidden";
import { Alert } from "@/components/ui/card";
import { listContainers } from "@/modules/catalog/queries";
import { requireActorWith } from "@/modules/identity/guards";
import { WeighingForm, type ContainerChoice } from "./weighing-form";

export const metadata: Metadata = { title: "Nuevo pesaje" };
export const dynamic = "force-dynamic";

export default async function RegistroPage({ searchParams }: { searchParams: Promise<{ container?: string }> }) {
  const { container } = await searchParams;
  const { actor, allowed } = await requireActorWith("weighing:create", "/registro");
  if (!allowed) return <Forbidden what="el registro de pesajes" />;

  const options = await listContainers(actor, { onlyUsable: true });
  const choices: ContainerChoice[] = options.map((c) => ({
    code: c.code,
    label: `${c.code} — ${c.materialName} — ${c.zoneName}`,
    materialName: c.materialName,
    zoneName: c.zoneName,
    tareG: c.tareG,
    demo: c.dataOrigin === "demo",
  }));
  const qr = (container ?? "").trim().toUpperCase();
  const initialCode = choices.some((c) => c.code === qr) ? qr : "";

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">Nuevo pesaje</h1>
        <p className="text-slate-700">Registro manual de captación: bruto, tara y neto. Cada pesaje válido crea su lote.</p>
      </div>
      {qr && !initialCode ? (
        <Alert tone="warning" role="alert">
          El código «{qr.slice(0, 64)}» no corresponde a un contenedor activo dentro de su ámbito. Elija uno de la lista.
        </Alert>
      ) : null}
      {choices.length === 0 ? (
        <Alert tone="warning">No hay contenedores activos disponibles en su ámbito. Pida a un administrador que configure uno.</Alert>
      ) : (
        // Una clave nueva por cada carga de la página: protege contra doble clic y reintentos de red.
        <WeighingForm containers={choices} initialCode={initialCode} idempotencyKey={randomUUID()} />
      )}
    </div>
  );
}
