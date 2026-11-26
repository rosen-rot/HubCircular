"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DomainError } from "@/lib/errors";
import { setContainerCapacity } from "@/modules/catalog/service";
import { parseCapacity } from "@/modules/devices/fill";
import { getCurrentActor } from "@/modules/identity/service";

/** Fija o quita la capacidad (litros) de un contenedor. Solo administrador; la BD vuelve a verificar rol y ámbito. */
export async function setCapacityAction(formData: FormData): Promise<void> {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login?next=%2Fcontenedores");
  const containerId = String(formData.get("containerId") ?? "");
  if (!z.string().uuid().safeParse(containerId).success) redirect("/contenedores?error=container_required#capacidad");
  const parsed = parseCapacity(formData.get("capacityL"));
  if (!parsed.ok) redirect("/contenedores?error=capacity_invalid#capacidad");
  try {
    await setContainerCapacity(actor, containerId, parsed.value);
  } catch (err) {
    const e = err instanceof DomainError ? err : new DomainError("unexpected");
    if (e.code === "unauthenticated") redirect("/login?next=%2Fcontenedores");
    redirect(`/contenedores?error=${encodeURIComponent(e.code)}#capacidad`);
  }
  revalidatePath("/contenedores");
  revalidatePath("/inicio");
  redirect(`/contenedores?ok=${parsed.value === null ? "capacidad_quitada" : "capacidad"}#capacidad`);
}
