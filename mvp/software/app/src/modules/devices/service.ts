import "server-only";
import { withActor, type Queryable } from "@/lib/db";
import { mapDbError } from "@/lib/errors";
import { assertCan } from "@/modules/identity/permissions";
import type { Actor } from "@/modules/identity/types";
import type { DeviceFormInput } from "./schema";
import { deviceTokenPrefix, hashDeviceToken, newDeviceToken } from "./token";

async function run<T>(actor: Actor, fn: (db: Queryable) => Promise<T>): Promise<T> {
  assertCan(actor, "device:manage");
  try {
    return await withActor(actor.userId, fn);
  } catch (err) {
    throw mapDbError(err);
  }
}

/** Crea el dispositivo y devuelve el token UNA sola vez (en la BD solo queda su hash). */
export async function createDevice(actor: Actor, input: DeviceFormInput): Promise<{ deviceId: string; token: string }> {
  assertCan(actor, "device:manage");
  const token = newDeviceToken();
  const deviceId = await run(actor, async (db) => {
    const r = await db.query<{ o_device_id: string }>("select * from hc.admin_create_device($1,$2,$3,$4,$5,$6,$7)", [
      actor.userId,
      input.code,
      input.name,
      input.containerId,
      hashDeviceToken(token),
      deviceTokenPrefix(token),
      input.staleAfterMinutes,
    ]);
    return r.rows[0]!.o_device_id;
  });
  return { deviceId, token };
}

/** Genera un token nuevo: el anterior deja de servir y, si estaba revocado, el dispositivo vuelve a quedar activo. */
export async function rotateDeviceToken(actor: Actor, deviceId: string): Promise<{ token: string }> {
  assertCan(actor, "device:manage");
  const token = newDeviceToken();
  await run(actor, async (db) => {
    await db.query("select hc.admin_rotate_device_token($1,$2,$3,$4)", [
      actor.userId,
      deviceId,
      hashDeviceToken(token),
      deviceTokenPrefix(token),
    ]);
  });
  return { token };
}

export async function revokeDevice(actor: Actor, deviceId: string): Promise<void> {
  await run(actor, async (db) => {
    await db.query("select hc.admin_revoke_device($1,$2)", [actor.userId, deviceId]);
  });
}
