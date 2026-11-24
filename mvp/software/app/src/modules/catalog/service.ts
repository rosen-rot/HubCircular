import "server-only";
import { withActor } from "@/lib/db";
import { mapDbError } from "@/lib/errors";
import { assertCan } from "@/modules/identity/permissions";
import type { Actor } from "@/modules/identity/types";

/**
 * Fija (o borra, con null) la capacidad en litros de un contenedor. Solo administrador con ámbito sobre la zona;
 * la BD vuelve a verificar rol y ámbito y deja auditoría (migración 0012). No afecta pesajes, lotes ni lecturas.
 */
export async function setContainerCapacity(actor: Actor, containerId: string, capacityL: number | null): Promise<void> {
  assertCan(actor, "catalog:manage");
  try {
    await withActor(actor.userId, async (db) => {
      await db.query("select hc.admin_set_container_capacity($1,$2,$3)", [actor.userId, containerId, capacityL]);
    });
  } catch (err) {
    throw mapDbError(err);
  }
}
