import "server-only";
import { withActor } from "@/lib/db";
import { mapDbError } from "@/lib/errors";
import { assertCan } from "@/modules/identity/permissions";
import type { Actor } from "@/modules/identity/types";
import type { RegisterWeighingInput } from "./schema";

export interface RegisterWeighingResult {
  weighingId: string;
  batchId: string;
  netG: number;
  duplicate: boolean;
  weighingRef: number;
  batchRef: number;
}

interface Row {
  o_weighing_id: string;
  o_batch_id: string;
  o_net_g: number;
  o_duplicate: boolean;
  o_weighing_ref: number;
  o_batch_ref: number;
}

/**
 * Caso de uso: registrar un pesaje manual. Permiso en aplicación + función transaccional en BD, que
 * calcula el neto, valida y crea pesaje, lote, saldo inicial y auditoría en una sola transacción.
 */
export async function registerWeighing(actor: Actor, input: RegisterWeighingInput): Promise<RegisterWeighingResult> {
  assertCan(actor, "weighing:create");
  try {
    const rows = await withActor(actor.userId, async (db) => {
      const r = await db.query<Row>(
        "select * from hc.register_weighing($1, $2, $3, $4, $5, $6, $7, $8)",
        [
          actor.userId,
          input.containerCode,
          input.grossG,
          input.tareG,
          input.occurredAt,
          input.notes,
          input.contaminationObserved,
          input.idempotencyKey,
        ],
      );
      return r.rows;
    });
    const row = rows[0]!;
    return {
      weighingId: row.o_weighing_id,
      batchId: row.o_batch_id,
      netG: row.o_net_g,
      duplicate: row.o_duplicate,
      weighingRef: row.o_weighing_ref,
      batchRef: row.o_batch_ref,
    };
  } catch (err) {
    throw mapDbError(err);
  }
}
