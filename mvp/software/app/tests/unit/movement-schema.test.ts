import { describe, expect, it } from "vitest";
import {
  parseCorrectionForm,
  parseDestinationForm,
  parseEvidenceForm,
  parseMovementForm,
  parseVerificationForm,
} from "@/modules/movements/schema";
import { can } from "@/modules/identity/permissions";
import { DomainError, mapDbError } from "@/lib/errors";
import { formatMovementRef } from "@/modules/weighing/refs";
import type { Actor } from "@/modules/identity/types";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const base = {
  batchId: U(1),
  type: "despacho",
  from: U(2),
  destinationId: U(3),
  quantityKg: "9,00",
  idempotencyKey: U(9),
};
const ok = (raw: Record<string, string>) => {
  const r = parseMovementForm(raw);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
};
const errs = (raw: Record<string, string>) => {
  const r = parseMovementForm(raw);
  if (r.ok) throw new Error("se esperaba error");
  return r.errors;
};

describe("parseMovementForm", () => {
  it("despacho: convierte kg a gramos y conserva origen y destino; ignora campos que no corresponden", () => {
    const v = ok({ ...base, to: U(5) });
    expect(v).toMatchObject({ type: "despacho", quantityG: 9000, fromLocationId: U(2), toLocationId: null, destinationId: U(3), reason: null });
  });

  it("traslado: exige origen y destino distintos y no lleva destino externo", () => {
    expect(errs({ ...base, type: "traslado", to: "" }).to).toBeTruthy();
    expect(errs({ ...base, type: "traslado", to: U(2) }).to).toMatch(/distinto/);
    const v = ok({ ...base, type: "traslado", to: U(5) });
    expect(v).toMatchObject({ fromLocationId: U(2), toLocationId: U(5), destinationId: null });
  });

  it("despacho y reutilización exigen destino", () => {
    expect(errs({ ...base, destinationId: "" }).destinationId).toBeTruthy();
    expect(errs({ ...base, type: "reutilizacion", destinationId: "x" }).destinationId).toBeTruthy();
  });

  it("rechazo y ajuste exigen motivo de 5+ caracteres", () => {
    expect(errs({ ...base, type: "rechazo", destinationId: "", reason: "abc" }).reason).toBeTruthy();
    expect(ok({ ...base, type: "rechazo", destinationId: "", reason: "  contaminado  " }).reason).toBe("contaminado");
    expect(errs({ ...base, type: "ajuste", adjustSign: "baja", reason: "" }).reason).toBeTruthy();
  });

  it("ajuste: el signo decide qué ubicación se usa", () => {
    expect(ok({ ...base, type: "ajuste", adjustSign: "baja", reason: "merma por humedad" })).toMatchObject({ fromLocationId: U(2), toLocationId: null });
    expect(ok({ ...base, type: "ajuste", adjustSign: "sube", to: U(5), from: U(2), reason: "recuento al alza" })).toMatchObject({ fromLocationId: null, toLocationId: U(5) });
    expect(errs({ ...base, type: "ajuste", reason: "recuento al alza" }).form).toBeTruthy();
  });

  it("cantidad: formato, decimales, cero y máximo", () => {
    expect(errs({ ...base, quantityKg: "" }).quantityKg).toBeTruthy();
    expect(errs({ ...base, quantityKg: "abc" }).quantityKg).toMatch(/números/);
    expect(errs({ ...base, quantityKg: "1,2345" }).quantityKg).toMatch(/decimales/);
    expect(errs({ ...base, quantityKg: "0" }).quantityKg).toMatch(/mayor que 0/);
    expect(errs({ ...base, quantityKg: "1000,001" }).quantityKg).toMatch(/1\.000 kg/);
    expect(ok({ ...base, quantityKg: "0,001" }).quantityG).toBe(1);
  });

  it("clave de idempotencia, lote y tipo inválidos", () => {
    expect(errs({ ...base, idempotencyKey: "no-uuid" }).form).toBeTruthy();
    expect(errs({ ...base, batchId: "" }).batchId).toBeTruthy();
    expect(errs({ ...base, type: "venta" }).type).toBeTruthy();
    expect(errs({ ...base, type: "correccion" }).type).toBeTruthy(); // la corrección no se crea con este formulario
  });

  it("fecha: rechaza futuro e inválidas; limpia caracteres de control del motivo", () => {
    expect(errs({ ...base, occurredAtLocal: "2999-01-01T10:00" }).occurredAtLocal).toMatch(/futuro/);
    expect(errs({ ...base, occurredAtLocal: "ayer" }).occurredAtLocal).toBeTruthy();
    expect(ok({ ...base, reason: "con\u0000control\u0007" }).reason).toBe("concontrol");
  });
});

describe("otros formularios", () => {
  it("evidencia", () => {
    expect(parseEvidenceForm({ movementId: U(1), kind: "guia_despacho", reference: "  GD-77 " })).toMatchObject({ ok: true, value: { reference: "GD-77", note: null } });
    expect(parseEvidenceForm({ movementId: U(1), kind: "otro", reference: "" })).toMatchObject({ ok: false });
    expect(parseEvidenceForm({ movementId: U(1), kind: "video", reference: "x" })).toMatchObject({ ok: false });
    expect(parseEvidenceForm({ movementId: U(1), kind: "otro", reference: "x".repeat(201) })).toMatchObject({ ok: false });
  });
  it("verificación: el rechazo exige motivo", () => {
    expect(parseVerificationForm({ movementId: U(1), status: "confirmada" })).toMatchObject({ ok: true });
    expect(parseVerificationForm({ movementId: U(1), status: "rechazada", notes: "no" })).toMatchObject({ ok: false });
    expect(parseVerificationForm({ movementId: U(1), status: "rechazada", notes: "guía de otro retiro" })).toMatchObject({ ok: true });
    expect(parseVerificationForm({ movementId: U(1), status: "aprobada" })).toMatchObject({ ok: false });
  });
  it("corrección y destino", () => {
    expect(parseCorrectionForm({ movementId: U(1), idempotencyKey: U(2), reason: "error de registro" })).toMatchObject({ ok: true });
    expect(parseCorrectionForm({ movementId: U(1), idempotencyKey: U(2), reason: "x" })).toMatchObject({ ok: false });
    expect(parseDestinationForm({ name: "  Gestor   Norte ", type: "gestor" })).toMatchObject({ ok: true, value: { name: "Gestor Norte", demo: false } });
    expect(parseDestinationForm({ name: "A", type: "gestor" })).toMatchObject({ ok: false });
    expect(parseDestinationForm({ name: "Gestor", type: "otro_tipo" })).toMatchObject({ ok: false });
    expect(parseDestinationForm({ name: "Gestor DEMO", type: "gestor", demo: "on" })).toMatchObject({ ok: true, value: { demo: true } });
  });
});

describe("permisos y errores de movimientos", () => {
  const actor = (role: "administrador" | "operador" | "lector"): Actor =>
    ({ userId: U(1), displayName: "x", email: "x@y.z", roles: [{ role, zoneId: null }] }) as unknown as Actor;
  it("matriz de permisos", () => {
    expect(can(actor("operador"), "movement:create")).toBe(true);
    expect(can(actor("operador"), "movement:adjust")).toBe(false);
    expect(can(actor("operador"), "movement:correct")).toBe(false);
    expect(can(actor("operador"), "verification:decide")).toBe(false);
    expect(can(actor("operador"), "destination:manage")).toBe(false);
    expect(can(actor("lector"), "movement:create")).toBe(false);
    expect(can(actor("lector"), "evidence:add")).toBe(false);
    expect(can(actor("lector"), "movement:read")).toBe(true);
    for (const p of ["movement:adjust", "movement:correct", "verification:decide", "destination:manage"] as const) {
      expect(can(actor("administrador"), p)).toBe(true);
    }
  });
  it("mapea los códigos SQL nuevos a errores de dominio con su estado HTTP", () => {
    const cases: [string, string, number][] = [
      ["insufficient_balance", "HC422", 422],
      ["batch_not_found", "HC404", 404],
      ["movement_not_found", "HC404", 404],
      ["destination_exists", "HC409", 409],
      ["evidence_duplicate", "HC409", 409],
      ["verification_unchanged", "HC409", 409],
      ["already_corrected", "HC422", 422],
    ];
    for (const [message, code, status] of cases) {
      const e = mapDbError({ code, message });
      expect(e).toBeInstanceOf(DomainError);
      expect(e.code).toBe(message);
      expect(e.status).toBe(status);
      expect(e.userMessage.length).toBeGreaterThan(10);
    }
    expect(mapDbError({ code: "HC422", message: "algo_desconocido" }).code).toBe("unexpected");
  });
  it("referencia legible M-", () => {
    expect(formatMovementRef(42)).toBe("M-000042");
  });
});
