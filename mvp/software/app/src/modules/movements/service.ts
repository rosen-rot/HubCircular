import "server-only";
import { withActor } from "@/lib/db";
import { mapDbError } from "@/lib/errors";
import { assertCan, type Permission } from "@/modules/identity/permissions";
import type { Actor } from "@/modules/identity/types";
import type { DestinationType, EvidenceKind, RegisterMovementInput } from "./schema";

export interface MovementResult {
  movementId: string;
  movementRef: number;
  duplicate: boolean;
}

interface MovementRow {
  o_movement_id: string;
  o_movement_ref: number;
  o_duplicate: boolean;
}

const toResult = (r: MovementRow): MovementResult => ({ movementId: r.o_movement_id, movementRef: r.o_movement_ref, duplicate: r.o_duplicate });

/** Ejecuta una función transaccional de la BD con permiso previo en la aplicación y traducción de errores. */
async function run<T>(actor: Actor, permission: Permission, fn: (db: Parameters<Parameters<typeof withActor>[1]>[0]) => Promise<T>): Promise<T> {
  assertCan(actor, permission);
  try {
    return await withActor(actor.userId, fn);
  } catch (err) {
    throw mapDbError(err);
  }
}

/**
 * Registra un movimiento (traslado, despacho, reutilización, rechazo o ajuste). La BD bloquea el lote,
 * valida saldo, ámbito y destino, y escribe movimiento, saldo y auditoría en una sola transacción.
 */
export async function registerMovement(actor: Actor, input: RegisterMovementInput): Promise<MovementResult> {
  return run(actor, input.type === "ajuste" ? "movement:adjust" : "movement:create", async (db) => {
    const r = await db.query<MovementRow>("select * from hc.register_movement($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [
      actor.userId,
      input.batchId,
      input.type,
      input.quantityG,
      input.fromLocationId,
      input.toLocationId,
      input.destinationId,
      input.occurredAt,
      input.reason,
      input.idempotencyKey,
    ]);
    return toResult(r.rows[0]!);
  });
}

/** Corrige un movimiento con otro de efecto inverso (nunca borra ni edita). Solo administrador. */
export async function correctMovement(actor: Actor, input: { movementId: string; reason: string; idempotencyKey: string }): Promise<MovementResult> {
  return run(actor, "movement:correct", async (db) => {
    const r = await db.query<MovementRow>("select * from hc.correct_movement($1,$2,$3,$4)", [
      actor.userId,
      input.movementId,
      input.reason,
      input.idempotencyKey,
    ]);
    return toResult(r.rows[0]!);
  });
}

export async function addEvidence(actor: Actor, input: { movementId: string; kind: EvidenceKind; reference: string; note: string | null }): Promise<string> {
  return run(actor, "evidence:add", async (db) => {
    const r = await db.query<{ o_evidence_id: string }>("select * from hc.add_movement_evidence($1,$2,$3,$4,$5)", [
      actor.userId,
      input.movementId,
      input.kind,
      input.reference,
      input.note,
    ]);
    return r.rows[0]!.o_evidence_id;
  });
}

/** Decide la verificación de valorización de un despacho. No crea movimientos ni modifica saldos. */
export async function verifyMovement(actor: Actor, input: { movementId: string; status: "confirmada" | "rechazada"; notes: string | null }): Promise<string> {
  return run(actor, "verification:decide", async (db) => {
    const r = await db.query<{ o_verification_id: string }>("select * from hc.verify_movement($1,$2,$3,$4)", [
      actor.userId,
      input.movementId,
      input.status,
      input.notes,
    ]);
    return r.rows[0]!.o_verification_id;
  });
}

export async function createDestination(actor: Actor, input: { name: string; type: DestinationType; demo: boolean }): Promise<string> {
  return run(actor, "destination:manage", async (db) => {
    const r = await db.query<{ o_destination_id: string }>("select * from hc.create_destination($1,$2,$3,$4)", [
      actor.userId,
      input.name,
      input.type,
      input.demo,
    ]);
    return r.rows[0]!.o_destination_id;
  });
}

export async function setDestinationActive(actor: Actor, destinationId: string, active: boolean): Promise<void> {
  await run(actor, "destination:manage", async (db) => {
    await db.query("select hc.set_destination_active($1,$2,$3)", [actor.userId, destinationId, active]);
  });
}
