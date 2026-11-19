import "server-only";
import { withActor } from "@/lib/db";
import { mapDbError } from "@/lib/errors";
import { assertCan, type Permission } from "@/modules/identity/permissions";
import type { Actor } from "@/modules/identity/types";

async function run<T>(actor: Actor, permission: Permission, fn: Parameters<typeof withActor<T>>[1]): Promise<T> {
  assertCan(actor, permission);
  try {
    return await withActor(actor.userId, fn);
  } catch (err) {
    throw mapDbError(err);
  }
}

/** Crea un calendario de medición (días fijos de la semana) desde `startOn`. Solo administrador. */
export async function createSchedule(actor: Actor, input: { containerId: string; weekdays: number[]; startOn: string }): Promise<string> {
  return run(actor, "schedule:manage", async (db) => {
    const r = await db.query<{ o_schedule_id: string }>("select * from hc.create_measurement_schedule($1,$2,$3::int[],$4::date)", [
      actor.userId,
      input.containerId,
      input.weekdays,
      input.startOn,
    ]);
    return r.rows[0]!.o_schedule_id;
  });
}

/** Termina un calendario (fecha inclusive, como mínimo ayer). Solo administrador. */
export async function endSchedule(actor: Actor, input: { scheduleId: string; endOn: string }): Promise<void> {
  await run(actor, "schedule:manage", async (db) => {
    await db.query("select hc.end_measurement_schedule($1,$2,$3::date)", [actor.userId, input.scheduleId, input.endOn]);
  });
}

/** Confirma «cero» hoy: el contenedor se revisó y no había residuos. No crea pesaje ni suma masa. */
export async function confirmZero(actor: Actor, input: { containerId: string; note: string | null }): Promise<{ confirmationId: string; duplicate: boolean }> {
  return run(actor, "measurement:zero", async (db) => {
    const r = await db.query<{ o_confirmation_id: string; o_duplicate: boolean }>("select * from hc.confirm_zero_measurement($1,$2,$3)", [
      actor.userId,
      input.containerId,
      input.note,
    ]);
    return { confirmationId: r.rows[0]!.o_confirmation_id, duplicate: r.rows[0]!.o_duplicate };
  });
}
