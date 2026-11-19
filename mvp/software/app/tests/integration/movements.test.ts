import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { balancesOf, counts, createTestDb, destinationId, moveAs, registerAs, type TestDb } from "../helpers/db";

const CARTON = "DEMO-Z01-EST01-CARTON";
const LAB = "DEMO-Z02-EST01-ALUMINIO";

let db: TestDb;
let gestor: string;
let reuso: string;
let otro: string;
let z1: string;
let z2: string;
let admin: string;
let operator: string;
let reader: string;

/** Crea un lote DEMO con el neto indicado en el contenedor indicado. */
async function lot(net: number, code = CARTON, actor = admin) {
  const w = await registerAs(db, actor, { code, gross: net + 350, tare: 350 });
  return w.o_batch_id;
}
const expectErr = (p: Promise<unknown>, message: string, sqlstate?: string) =>
  expect(p).rejects.toMatchObject({ message, ...(sqlstate ? { code: sqlstate } : {}) });

beforeAll(async () => {
  db = await createTestDb();
  gestor = await destinationId(db, "gestor");
  reuso = await destinationId(db, "reutilizacion");
  otro = await destinationId(db, "otro");
  z1 = db.ids.zoneCowork;
  z2 = db.ids.zoneLab;
  admin = db.ids.admin;
  operator = db.ids.operator;
  reader = db.ids.reader;
});
afterAll(async () => {
  await db.drop();
});

describe("retiro parcial y saldo (casos de aceptación 3 y 4)", () => {
  it("despacho 9.000 g de un lote de 12.000 g ⇒ saldo 3.000 g; un segundo despacho de 4.000 g se rechaza", async () => {
    const b = await lot(12_000);
    const m = await moveAs(db, operator, { batchId: b, type: "despacho", quantityG: 9_000, from: z1, destinationId: gestor });
    expect(m.o_duplicate).toBe(false);
    expect(await balancesOf(db, b)).toEqual({ [z1]: 3_000 });
    await expectErr(moveAs(db, operator, { batchId: b, type: "despacho", quantityG: 4_000, from: z1, destinationId: gestor }), "insufficient_balance", "HC422");
    expect(await balancesOf(db, b)).toEqual({ [z1]: 3_000 });
    const batch = await db.admin.query("select initial_g from hc.batches where id = $1", [b]);
    expect(Number(batch.rows[0].initial_g)).toBe(12_000); // la captación inicial no cambia
  });

  it("el saldo puede agotarse exactamente y nunca queda negativo", async () => {
    const b = await lot(5_000);
    await moveAs(db, operator, { batchId: b, type: "despacho", quantityG: 5_000, from: z1, destinationId: otro });
    expect(await balancesOf(db, b)).toEqual({ [z1]: 0 });
    await expectErr(moveAs(db, operator, { batchId: b, type: "rechazo", quantityG: 1, from: z1, reason: "material mojado" }), "insufficient_balance");
  });

  it("rechazo y reutilización descuentan saldo", async () => {
    const b = await lot(10_000);
    await moveAs(db, operator, { batchId: b, type: "rechazo", quantityG: 1_500, from: z1, reason: "contaminado con aceite" });
    await moveAs(db, operator, { batchId: b, type: "reutilizacion", quantityG: 2_500, from: z1, destinationId: reuso });
    expect(await balancesOf(db, b)).toEqual({ [z1]: 6_000 });
  });
});

describe("traslado: conserva la masa y no suma captación (caso 3)", () => {
  it("traslado de 12.000 g entre zonas: captado sigue en 12.000 g, no hay pesajes ni lotes nuevos", async () => {
    const b = await lot(12_000);
    const before = await counts(db);
    await moveAs(db, admin, { batchId: b, type: "traslado", quantityG: 12_000, from: z1, to: z2 });
    const after = await counts(db);
    expect(after.weighings).toBe(before.weighings);
    expect(after.batches).toBe(before.batches);
    const bal = await balancesOf(db, b);
    expect(bal).toEqual({ [z1]: 0, [z2]: 12_000 });
    expect(Object.values(bal).reduce((a, x) => a + x, 0)).toBe(12_000);
  });

  it("traslado parcial reparte el saldo entre ubicaciones", async () => {
    const b = await lot(10_000);
    await moveAs(db, operator, { batchId: b, type: "traslado", quantityG: 4_000, from: z1, to: z2 });
    expect(await balancesOf(db, b)).toEqual({ [z1]: 6_000, [z2]: 4_000 });
  });
});

describe("concurrencia", () => {
  it("diez retiros simultáneos de 4.000 g sobre un saldo de 10.000 g: solo 2 prosperan y el saldo no es negativo", async () => {
    const b = await lot(10_000);
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => moveAs(db, operator, { batchId: b, type: "despacho", quantityG: 4_000, from: z1, destinationId: gestor })),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(2);
    expect(rejected).toHaveLength(8);
    expect(rejected.every((r) => r.reason.message === "insufficient_balance")).toBe(true);
    expect(await balancesOf(db, b)).toEqual({ [z1]: 2_000 });
    const n = await db.admin.query("select count(*)::int as n from hc.movements where batch_id = $1", [b]);
    expect(n.rows[0].n).toBe(2);
  });

  it("traslados cruzados simultáneos no se bloquean entre sí (sin interbloqueo) y conservan la masa total", async () => {
    const b = await lot(10_000);
    await moveAs(db, admin, { batchId: b, type: "traslado", quantityG: 5_000, from: z1, to: z2 });
    const jobs = Array.from({ length: 16 }, (_, i) =>
      i % 2 === 0
        ? moveAs(db, admin, { batchId: b, type: "traslado", quantityG: 700, from: z1, to: z2 })
        : moveAs(db, admin, { batchId: b, type: "traslado", quantityG: 700, from: z2, to: z1 }),
    );
    const results = await Promise.allSettled(jobs);
    const deadlocks = results.filter((r) => r.status === "rejected" && (r.reason.code === "40P01" || /deadlock/i.test(String(r.reason.message))));
    expect(deadlocks).toHaveLength(0);
    const bal = await balancesOf(db, b);
    expect(Object.values(bal).every((v) => v >= 0)).toBe(true);
    expect(Object.values(bal).reduce((a, x) => a + x, 0)).toBe(10_000);
  });

  it("el mismo envío repetido 10 veces a la vez crea un solo movimiento y descuenta una vez", async () => {
    const b = await lot(10_000);
    const key = crypto.randomUUID();
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => moveAs(db, operator, { batchId: b, type: "despacho", quantityG: 3_000, from: z1, destinationId: gestor, key })),
    );
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const ids = new Set(results.map((r) => (r as PromiseFulfilledResult<{ o_movement_id: string }>).value.o_movement_id));
    expect(ids.size).toBe(1);
    expect(await balancesOf(db, b)).toEqual({ [z1]: 7_000 });
  });
});

describe("idempotencia", () => {
  it("misma clave y mismos datos ⇒ resultado original; datos distintos ⇒ HC409", async () => {
    const b = await lot(10_000);
    const key = crypto.randomUUID();
    const p = { batchId: b, type: "despacho" as const, quantityG: 1_000, from: z1, destinationId: gestor, key };
    const a1 = await moveAs(db, operator, p);
    const a2 = await moveAs(db, operator, p);
    expect(a1.o_movement_id).toBe(a2.o_movement_id);
    expect(a2.o_duplicate).toBe(true);
    expect(await balancesOf(db, b)).toEqual({ [z1]: 9_000 });
    await expectErr(moveAs(db, operator, { ...p, quantityG: 2_000 }), "idempotency_conflict", "HC409");
  });

  it("la clave es por usuario: otro usuario puede reutilizar el mismo UUID", async () => {
    const b = await lot(10_000);
    const key = crypto.randomUUID();
    await moveAs(db, operator, { batchId: b, type: "despacho", quantityG: 100, from: z1, destinationId: gestor, key });
    await moveAs(db, admin, { batchId: b, type: "despacho", quantityG: 100, from: z1, destinationId: gestor, key });
    expect(await balancesOf(db, b)).toEqual({ [z1]: 9_800 });
  });
});

describe("validaciones y autorización", () => {
  let b: string;
  beforeAll(async () => {
    b = await lot(10_000);
  });
  const base = () => ({ batchId: b, type: "despacho" as const, quantityG: 1_000, from: z1, destinationId: gestor });

  it("cantidad no positiva, excesiva o no entera ⇒ rechazo", async () => {
    await expectErr(moveAs(db, operator, { ...base(), quantityG: 0 }), "invalid_mass", "HC422");
    await expectErr(moveAs(db, operator, { ...base(), quantityG: -5 }), "invalid_mass");
    await expectErr(moveAs(db, operator, { ...base(), quantityG: 1_000_001 }), "mass_too_large");
  });

  it("forma según tipo: despacho exige destino; traslado exige dos ubicaciones distintas y sin destino", async () => {
    await expectErr(moveAs(db, operator, { ...base(), destinationId: null }), "invalid_movement_shape");
    await expectErr(moveAs(db, operator, { batchId: b, type: "traslado", quantityG: 10, from: z1, to: z1 }), "invalid_movement_shape");
    await expectErr(moveAs(db, operator, { batchId: b, type: "traslado", quantityG: 10, from: z1, to: z2, destinationId: gestor }), "invalid_movement_shape");
    await expectErr(moveAs(db, operator, { batchId: b, type: "traslado", quantityG: 10, from: z1 }), "invalid_movement_shape");
    await expectErr(moveAs(db, operator, { ...base(), to: z2 }), "invalid_movement_shape");
  });

  it("tipo desconocido ⇒ rechazo", async () => {
    // @ts-expect-error tipo inválido a propósito
    await expectErr(moveAs(db, operator, { ...base(), type: "venta" }), "invalid_movement_type");
    // @ts-expect-error la corrección solo se crea con hc.correct_movement
    await expectErr(moveAs(db, admin, { ...base(), type: "correccion" }), "invalid_movement_type");
  });

  it("el tipo de destino debe corresponder: despacho no admite «reutilización» y reutilización solo admite «reutilización»", async () => {
    await expectErr(moveAs(db, operator, { ...base(), destinationId: reuso }), "destination_invalid");
    await expectErr(moveAs(db, operator, { ...base(), type: "reutilizacion", destinationId: gestor }), "destination_invalid");
    await expectErr(moveAs(db, operator, { ...base(), destinationId: crypto.randomUUID() }), "destination_invalid");
  });

  it("rechazo y ajuste exigen motivo (mínimo 5 caracteres)", async () => {
    await expectErr(moveAs(db, operator, { batchId: b, type: "rechazo", quantityG: 10, from: z1 }), "reason_required");
    await expectErr(moveAs(db, operator, { batchId: b, type: "rechazo", quantityG: 10, from: z1, reason: "abc" }), "reason_required");
    await expectErr(moveAs(db, admin, { batchId: b, type: "ajuste", quantityG: 10, from: z1 }), "reason_required");
  });

  it("el lector no puede mover; el operador no puede ajustar", async () => {
    await expectErr(moveAs(db, reader, base()), "forbidden", "HC403");
    await expectErr(moveAs(db, operator, { batchId: b, type: "ajuste", quantityG: 10, from: z1, reason: "recuento de inventario" }), "forbidden", "HC403");
  });

  it("un operador sin ámbito en la zona de origen no puede mover ese lote", async () => {
    const lab = await lot(2_000, LAB);
    await expectErr(moveAs(db, operator, { batchId: lab, type: "despacho", quantityG: 100, from: z2, destinationId: gestor }), "forbidden", "HC403");
    expect(await balancesOf(db, lab)).toEqual({ [z2]: 2_000 });
  });

  it("lote inexistente, zona sin saldo o actor falso", async () => {
    await expectErr(moveAs(db, operator, { ...base(), batchId: crypto.randomUUID() }), "batch_not_found", "HC404");
    await expectErr(moveAs(db, admin, { batchId: b, type: "despacho", quantityG: 10, from: z2, destinationId: gestor }), "insufficient_balance");
    await expect(
      db.asActor(operator, (c) =>
        c.query("select * from hc.register_movement($1,$2,'despacho',10,$3,null,$4,null,null,$5)", [admin, b, z1, gestor, crypto.randomUUID()]),
      ),
    ).rejects.toMatchObject({ message: "unauthenticated", code: "HC401" });
  });

  it("fecha: no futura y no anterior al pesaje del lote", async () => {
    await expectErr(moveAs(db, operator, { ...base(), occurredAt: new Date(Date.now() + 3_600_000) }), "occurred_in_future");
    await expectErr(moveAs(db, operator, { ...base(), occurredAt: new Date("2020-01-01T00:00:00Z") }), "occurred_before_batch");
  });

  it("un destino inactivo no se puede usar", async () => {
    const d = await db.admin.query("insert into hc.destinations (name, type, data_origin, active) values ('Inactivo DEMO','gestor','demo',false) returning id");
    await expectErr(moveAs(db, operator, { ...base(), destinationId: d.rows[0].id }), "destination_inactive");
  });

  it("no se mezclan destinos reales con lotes DEMO", async () => {
    const created = await db.asActor(admin, (c) => c.query("select * from hc.create_destination($1,'Gestor real de ejemplo','gestor',false)", [admin]));
    await expectErr(moveAs(db, operator, { ...base(), destinationId: created.rows[0].o_destination_id }), "destination_invalid");
  });

  it("todo movimiento rechazado deja saldo y registros intactos", async () => {
    const before = await db.admin.query("select count(*)::int as n from hc.movements");
    await expectErr(moveAs(db, operator, { ...base(), quantityG: 99_999_999 }), "mass_too_large");
    const after = await db.admin.query("select count(*)::int as n from hc.movements");
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});

describe("ajustes (solo administrador, con motivo)", () => {
  it("ajuste positivo y negativo; el negativo no puede dejar saldo < 0", async () => {
    const b = await lot(1_000);
    await moveAs(db, admin, { batchId: b, type: "ajuste", quantityG: 250, to: z1, reason: "diferencia de balanza en recuento" });
    expect(await balancesOf(db, b)).toEqual({ [z1]: 1_250 });
    await moveAs(db, admin, { batchId: b, type: "ajuste", quantityG: 50, from: z1, reason: "merma por humedad" });
    expect(await balancesOf(db, b)).toEqual({ [z1]: 1_200 });
    await expectErr(moveAs(db, admin, { batchId: b, type: "ajuste", quantityG: 5_000, from: z1, reason: "error de digitación" }), "insufficient_balance");
  });
});

describe("correcciones (RF-08): sin borrado silencioso", () => {
  const correct = (actor: string, movementId: string, reason: string | null = "error de registro del operador", key = crypto.randomUUID()) =>
    db.asActor(actor, async (c) => (await c.query("select * from hc.correct_movement($1,$2,$3,$4)", [actor, movementId, reason, key])).rows[0] as { o_movement_id: string; o_movement_ref: number; o_duplicate: boolean });

  it("corregir un despacho restituye el saldo y deja un movimiento nuevo con referencia al original, actor y motivo", async () => {
    const b = await lot(10_000);
    const m = await moveAs(db, operator, { batchId: b, type: "despacho", quantityG: 4_000, from: z1, destinationId: gestor });
    const c = await correct(admin, m.o_movement_id);
    expect(await balancesOf(db, b)).toEqual({ [z1]: 10_000 });
    const rows = await db.admin.query("select type, corrects_movement_id, created_by, reason, quantity_g from hc.movements where id = $1", [c.o_movement_id]);
    expect(rows.rows[0]).toMatchObject({ type: "correccion", corrects_movement_id: m.o_movement_id, created_by: admin, reason: "error de registro del operador" });
    const orig = await db.admin.query("select count(*)::int as n from hc.movements where id = $1", [m.o_movement_id]);
    expect(orig.rows[0].n).toBe(1); // el original sigue existiendo
    const audit = await db.admin.query("select count(*)::int as n from hc.audit_logs where entity = 'movement' and entity_id = $1 and action = 'correct'", [c.o_movement_id]);
    expect(audit.rows[0].n).toBe(1);
  });

  it("corregir un traslado lo revierte", async () => {
    const b = await lot(6_000);
    const m = await moveAs(db, admin, { batchId: b, type: "traslado", quantityG: 2_000, from: z1, to: z2 });
    expect(await balancesOf(db, b)).toEqual({ [z1]: 4_000, [z2]: 2_000 });
    await correct(admin, m.o_movement_id);
    expect(await balancesOf(db, b)).toEqual({ [z1]: 6_000, [z2]: 0 });
  });

  it("no se puede corregir dos veces ni corregir una corrección; exige motivo y administrador", async () => {
    const b = await lot(6_000);
    const m = await moveAs(db, operator, { batchId: b, type: "despacho", quantityG: 1_000, from: z1, destinationId: gestor });
    await expectErr(correct(operator, m.o_movement_id), "forbidden", "HC403");
    await expectErr(correct(admin, m.o_movement_id, null), "reason_required");
    await expectErr(correct(admin, m.o_movement_id, "x"), "reason_required");
    const c = await correct(admin, m.o_movement_id);
    await expectErr(correct(admin, m.o_movement_id), "already_corrected");
    await expectErr(correct(admin, c.o_movement_id), "cannot_correct_correction");
    await expectErr(correct(admin, crypto.randomUUID()), "movement_not_found", "HC404");
  });

  it("la corrección es idempotente (mismo envío ⇒ mismo resultado)", async () => {
    const b = await lot(6_000);
    const m = await moveAs(db, operator, { batchId: b, type: "despacho", quantityG: 1_000, from: z1, destinationId: gestor });
    const key = crypto.randomUUID();
    const c1 = await correct(admin, m.o_movement_id, "duplicado por error", key);
    const c2 = await correct(admin, m.o_movement_id, "duplicado por error", key);
    expect(c2.o_duplicate).toBe(true);
    expect(c2.o_movement_id).toBe(c1.o_movement_id);
    expect(await balancesOf(db, b)).toEqual({ [z1]: 6_000 });
  });

  it("no se puede revertir si el saldo ya no alcanza (el saldo nunca queda negativo)", async () => {
    const b = await lot(1_000);
    const adj = await moveAs(db, admin, { batchId: b, type: "ajuste", quantityG: 500, to: z1, reason: "recuento al alza" });
    await moveAs(db, operator, { batchId: b, type: "despacho", quantityG: 1_400, from: z1, destinationId: gestor });
    await expectErr(correct(admin, adj.o_movement_id), "insufficient_balance");
    expect(await balancesOf(db, b)).toEqual({ [z1]: 100 });
  });
});

describe("evidencia y verificación de valorización (H-05): no crean otra salida", () => {
  const evidence = (actor: string, movementId: string, kind = "guia_despacho", ref = "GD-001") =>
    db.asActor(actor, (c) => c.query("select * from hc.add_movement_evidence($1,$2,$3,$4,null)", [actor, movementId, kind, ref]));
  const verify = (actor: string, movementId: string, status: string, notes: string | null = null) =>
    db.asActor(actor, (c) => c.query("select * from hc.verify_movement($1,$2,$3,$4)", [actor, movementId, status, notes]));

  it("sin evidencia no se puede confirmar; con evidencia se confirma sin mover saldo ni crear movimientos", async () => {
    const b = await lot(10_000);
    const m = await moveAs(db, operator, { batchId: b, type: "despacho", quantityG: 9_000, from: z1, destinationId: gestor });
    await expectErr(verify(admin, m.o_movement_id, "confirmada"), "evidence_required");
    await evidence(operator, m.o_movement_id);
    const before = await db.admin.query("select count(*)::int as n from hc.movements");
    await verify(admin, m.o_movement_id, "confirmada");
    const after = await db.admin.query("select count(*)::int as n from hc.movements");
    expect(after.rows[0].n).toBe(before.rows[0].n);
    expect(await balancesOf(db, b)).toEqual({ [z1]: 1_000 });
  });

  it("evidencia duplicada, tipos no verificables, rechazo con motivo y decisiones repetidas", async () => {
    const b = await lot(10_000);
    const d = await moveAs(db, operator, { batchId: b, type: "despacho", quantityG: 1_000, from: z1, destinationId: gestor });
    const t = await moveAs(db, operator, { batchId: b, type: "traslado", quantityG: 1_000, from: z1, to: z2 });
    await evidence(operator, d.o_movement_id, "certificado", "CERT-9");
    await expectErr(evidence(operator, d.o_movement_id, "certificado", "CERT-9"), "evidence_duplicate", "HC409");
    await expectErr(evidence(operator, t.o_movement_id), "movement_not_verifiable");
    await expectErr(verify(admin, t.o_movement_id, "confirmada"), "movement_not_verifiable");
    await expectErr(verify(admin, d.o_movement_id, "rechazada"), "reason_required");
    await verify(admin, d.o_movement_id, "rechazada", "el certificado no corresponde al lote");
    await expectErr(verify(admin, d.o_movement_id, "rechazada", "el certificado no corresponde al lote"), "verification_unchanged", "HC409");
    await verify(admin, d.o_movement_id, "confirmada");
    const hist = await db.admin.query("select status from hc.movement_verifications where movement_id = $1 order by decided_at, id", [d.o_movement_id]);
    expect(hist.rows.map((r) => r.status)).toEqual(["rechazada", "confirmada"]); // historial conservado
  });

  it("solo el administrador verifica; el lector no agrega evidencia; el operador de otra zona tampoco", async () => {
    const b = await lot(5_000);
    const d = await moveAs(db, operator, { batchId: b, type: "despacho", quantityG: 500, from: z1, destinationId: gestor });
    await expectErr(verify(operator, d.o_movement_id, "confirmada"), "forbidden", "HC403");
    await expectErr(evidence(reader, d.o_movement_id), "forbidden", "HC403");
  });

  it("un despacho con valorización confirmada no se corrige hasta rechazar la verificación", async () => {
    const b = await lot(5_000);
    const d = await moveAs(db, operator, { batchId: b, type: "despacho", quantityG: 500, from: z1, destinationId: gestor });
    await evidence(operator, d.o_movement_id);
    await verify(admin, d.o_movement_id, "confirmada");
    const correct = () => db.asActor(admin, (c) => c.query("select * from hc.correct_movement($1,$2,'registrado por error',$3)", [admin, d.o_movement_id, crypto.randomUUID()]));
    await expectErr(correct(), "verification_blocks_correction");
    await verify(admin, d.o_movement_id, "rechazada", "la guía era de otro retiro");
    await correct();
    expect(await balancesOf(db, b)).toEqual({ [z1]: 5_000 });
    await expectErr(evidence(operator, d.o_movement_id, "otro", "X"), "already_corrected");
  });
});

describe("destinos (administración básica)", () => {
  it("el administrador crea y desactiva; nombres duplicados se rechazan; el operador no puede", async () => {
    const created = await db.asActor(admin, (c) => c.query("select * from hc.create_destination($1,'  Reciclador Demo Norte ','gestor',true)", [admin]));
    const id = created.rows[0].o_destination_id as string;
    await expectErr(db.asActor(admin, (c) => c.query("select * from hc.create_destination($1,'reciclador demo norte','gestor',true)", [admin])), "destination_exists", "HC409");
    await expectErr(db.asActor(operator, (c) => c.query("select * from hc.create_destination($1,'Otro Demo X','gestor',true)", [operator])), "forbidden", "HC403");
    await expectErr(db.asActor(admin, (c) => c.query("select * from hc.create_destination($1,'x','gestor',true)", [admin])), "destination_invalid");
    await expectErr(db.asActor(admin, (c) => c.query("select * from hc.create_destination($1,'Valido','otro_tipo',true)", [admin])), "destination_invalid");
    await db.asActor(admin, (c) => c.query("select hc.set_destination_active($1,$2,false)", [admin, id]));
    const r = await db.admin.query("select active from hc.destinations where id = $1", [id]);
    expect(r.rows[0].active).toBe(false);
    await expectErr(db.asActor(operator, (c) => c.query("select hc.set_destination_active($1,$2,true)", [operator, id])), "forbidden");
  });
});

describe("integridad en la base de datos (aunque se omita la función)", () => {
  it("los movimientos, la evidencia y las verificaciones son de solo anexado", async () => {
    const b = await lot(1_000);
    const m = await moveAs(db, operator, { batchId: b, type: "despacho", quantityG: 100, from: z1, destinationId: gestor });
    await expect(db.admin.query("update hc.movements set quantity_g = 1 where id = $1", [m.o_movement_id])).rejects.toMatchObject({ code: "HC423" });
    await expect(db.admin.query("delete from hc.movements where id = $1", [m.o_movement_id])).rejects.toMatchObject({ code: "HC423" });
  });

  it("restricciones: forma inválida, cantidad ≤ 0, saldo negativo y origen de datos distinto", async () => {
    const b = await lot(1_000);
    const ins = (q: string) => db.admin.query(q);
    await expect(
      ins(`insert into hc.movements (batch_id,type,quantity_g,from_location_id,occurred_at,created_by,idempotency_key,data_origin)
           values ('${b}','despacho',10,'${z1}',now(),'${admin}',gen_random_uuid(),'demo')`),
    ).rejects.toMatchObject({ code: "23514" }); // despacho sin destino
    await expect(
      ins(`insert into hc.movements (batch_id,type,quantity_g,from_location_id,destination_id,occurred_at,created_by,idempotency_key,data_origin)
           values ('${b}','despacho',0,'${z1}','${gestor}',now(),'${admin}',gen_random_uuid(),'demo')`),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      ins(`update hc.batch_location_balances set balance_g = -1 where batch_id = '${b}'`),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      ins(`insert into hc.movements (batch_id,type,quantity_g,from_location_id,destination_id,occurred_at,created_by,idempotency_key,data_origin)
           values ('${b}','despacho',10,'${z1}','${gestor}',now(),'${admin}',gen_random_uuid(),'real')`),
    ).rejects.toMatchObject({ code: "HC422" }); // origen distinto al del lote
  });

  it("hc_app no puede escribir directamente en las tablas nuevas", async () => {
    const b = await lot(1_000);
    for (const sql of [
      `insert into hc.movements (batch_id,type,quantity_g,from_location_id,destination_id,occurred_at,created_by,idempotency_key,data_origin) values ('${b}','despacho',10,'${z1}','${gestor}',now(),'${admin}',gen_random_uuid(),'demo')`,
      `insert into hc.destinations (name,type) values ('Intruso','gestor')`,
      `update hc.batch_location_balances set balance_g = 999999 where batch_id = '${b}'`,
      `insert into hc.movement_verifications (movement_id,status,decided_by) values (gen_random_uuid(),'confirmada','${admin}')`,
    ]) {
      await expect(db.asActor(admin, (c) => c.query(sql))).rejects.toThrow(/permission denied/i);
    }
  });

  it("anon y authenticated no tienen privilegios sobre las tablas ni funciones nuevas", async () => {
    const r = await db.admin.query(
      `select
         (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'hc' and c.relkind = 'r'
           cross join unnest(array['anon','authenticated']) r
           where has_table_privilege(r, c.oid, 'SELECT') or has_table_privilege(r, c.oid, 'INSERT')) as tablas,
         (select count(*) from pg_proc f join pg_namespace n on n.oid = f.pronamespace and n.nspname = 'hc'
           cross join unnest(array['anon','authenticated']) r where has_function_privilege(r, f.oid, 'EXECUTE')) as funciones,
         (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'hc' and c.relkind = 'r' where not c.relrowsecurity and c.relname <> 'schema_migrations') as sin_rls`,
    );
    expect(Number(r.rows[0].tablas)).toBe(0);
    expect(Number(r.rows[0].funciones)).toBe(0);
    expect(Number(r.rows[0].sin_rls)).toBe(0);
  });
});

describe("RLS de lectura de movimientos", () => {
  it("un operador ve movimientos de su zona y no los del laboratorio; tras un traslado, el operador de destino ve el lote", async () => {
    const own = await lot(3_000);
    const lab = await lot(3_000, LAB);
    const mOwn = await moveAs(db, operator, { batchId: own, type: "despacho", quantityG: 100, from: z1, destinationId: gestor });
    const mLab = await moveAs(db, admin, { batchId: lab, type: "despacho", quantityG: 100, from: z2, destinationId: gestor });
    const seen = await db.asActor(operator, async (c) => (await c.query("select id from hc.movements")).rows.map((r) => r.id as string));
    expect(seen).toContain(mOwn.o_movement_id);
    expect(seen).not.toContain(mLab.o_movement_id);
    const labBatchVisible = await db.asActor(operator, async (c) => (await c.query("select id from hc.batches where id = $1", [lab])).rows.length);
    expect(labBatchVisible).toBe(0);

    // operador con ámbito solo en el laboratorio
    const u = await db.admin.query("insert into hc.profiles (email, display_name) values ('operador.lab@demo.hubcircular.test','Operador Lab DEMO') returning id");
    const labOp = u.rows[0].id as string;
    await db.admin.query("insert into hc.user_roles (user_id, role, zone_id) values ($1,'operador',$2)", [labOp, z2]);
    expect(await db.asActor(labOp, async (c) => (await c.query("select id from hc.batches where id = $1", [own])).rows.length)).toBe(0);
    const t = await moveAs(db, admin, { batchId: own, type: "traslado", quantityG: 500, from: z1, to: z2 });
    expect(await db.asActor(labOp, async (c) => (await c.query("select id from hc.batches where id = $1", [own])).rows.length)).toBe(1);
    expect(await db.asActor(labOp, async (c) => (await c.query("select w.id from hc.weighings w join hc.batches b on b.weighing_id = w.id where b.id = $1", [own])).rows.length)).toBe(1);
    expect(await db.asActor(labOp, async (c) => (await c.query("select id from hc.movements where id = $1", [t.o_movement_id])).rows.length)).toBe(1);
    // …y puede despachar lo que recibió, pero no lo que quedó en Cowork
    await moveAs(db, labOp, { batchId: own, type: "despacho", quantityG: 200, from: z2, destinationId: gestor });
    await expectErr(moveAs(db, labOp, { batchId: own, type: "despacho", quantityG: 100, from: z1, destinationId: gestor }), "forbidden");
  });

  it("evidencia y verificaciones solo son visibles junto con su movimiento", async () => {
    const b = await lot(2_000, LAB);
    const m = await moveAs(db, admin, { batchId: b, type: "despacho", quantityG: 100, from: z2, destinationId: gestor });
    await db.asActor(admin, (c) => c.query("select * from hc.add_movement_evidence($1,$2,'correo','mail-1',null)", [admin, m.o_movement_id]));
    expect(await db.asActor(operator, async (c) => (await c.query("select id from hc.movement_evidence")).rows.length)).toBe(
      (await db.admin.query("select count(*)::int as n from hc.movement_evidence e join hc.movements m on m.id = e.movement_id where m.from_location_id = $1", [z1])).rows[0].n,
    );
    expect(await db.asActor(admin, async (c) => (await c.query("select id from hc.movement_evidence where movement_id = $1", [m.o_movement_id])).rows.length)).toBe(1);
  });
});

describe("auditoría", () => {
  it("cada movimiento deja un registro de auditoría con actor y resumen sin datos sensibles", async () => {
    const b = await lot(1_000);
    const m = await moveAs(db, operator, { batchId: b, type: "despacho", quantityG: 100, from: z1, destinationId: gestor });
    const a = await db.admin.query("select actor_id, new_summary from hc.audit_logs where entity = 'movement' and entity_id = $1 and action = 'create'", [m.o_movement_id]);
    expect(a.rows).toHaveLength(1);
    expect(a.rows[0].actor_id).toBe(operator);
    expect(a.rows[0].new_summary).toMatchObject({ type: "despacho", quantityG: 100, dataOrigin: "demo" });
  });
});
