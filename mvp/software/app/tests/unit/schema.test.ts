import { describe, expect, it } from "vitest";
import { parseWeighingForm } from "@/modules/weighing/schema";

const KEY = "7b7c2c0e-4d6e-4a4e-9a6a-2f0f0a9d4e11";
const base = { containerCode: "demo-z01-est01-carton", grossKg: "4,250", tareKg: "0,350", notes: "", idempotencyKey: KEY };

describe("parseWeighingForm", () => {
  it("convierte kg a gramos y normaliza el código (caso de aceptación 1: 4.250 g − 350 g)", () => {
    const r = parseWeighingForm(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toMatchObject({ containerCode: "DEMO-Z01-EST01-CARTON", grossG: 4250, tareG: 350, notes: null, contaminationObserved: false });
    }
  });

  it("tara mayor o igual que el bruto → error en tara", () => {
    for (const tare of ["4,250", "5"]) {
      const r = parseWeighingForm({ ...base, tareKg: tare });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.tareKg).toMatch(/menor que el peso bruto/);
    }
  });

  it("rechaza pesos negativos, cero, texto y más de 1.000 kg", () => {
    expect(parseWeighingForm({ ...base, grossKg: "-4" }).ok).toBe(false);
    const zero = parseWeighingForm({ ...base, grossKg: "0" });
    expect(!zero.ok && zero.errors.grossKg).toMatch(/mayor que 0/);
    expect(parseWeighingForm({ ...base, grossKg: "cuatro" }).ok).toBe(false);
    const big = parseWeighingForm({ ...base, grossKg: "1000,001", tareKg: "0" });
    expect(!big.ok && big.errors.grossKg).toMatch(/1\.000 kg/);
  });

  it("exige contenedor y clave de idempotencia válida", () => {
    const r = parseWeighingForm({ ...base, containerCode: "", idempotencyKey: "no-es-uuid" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.containerCode).toBeTruthy();
      expect(r.errors.form).toBeTruthy();
    }
  });

  it("valida fecha futura, inexistente y formato; acepta una pasada (hora de Santiago)", () => {
    const future = parseWeighingForm({ ...base, occurredAtLocal: "2999-01-01T10:00" });
    expect(!future.ok && future.errors.occurredAtLocal).toMatch(/futuro/);
    expect(parseWeighingForm({ ...base, occurredAtLocal: "ayer" }).ok).toBe(false);
    const ok = parseWeighingForm({ ...base, occurredAtLocal: "2026-07-01T10:00" });
    expect(ok.ok && ok.value.occurredAt?.toISOString()).toBe("2026-07-01T14:00:00.000Z");
  });

  it("limita observaciones a 500 caracteres y limpia caracteres de control", () => {
    expect(parseWeighingForm({ ...base, notes: "x".repeat(501) }).ok).toBe(false);
    const r = parseWeighingForm({ ...base, notes: "  hola\u0000 mundo\u0007  " });
    expect(r.ok && r.value.notes).toBe("hola mundo");
  });

  it("la casilla de contaminación visible solo vale con 'on'", () => {
    const yes = parseWeighingForm({ ...base, contaminationObserved: "on" });
    const no = parseWeighingForm({ ...base, contaminationObserved: "true" });
    expect(yes.ok && yes.value.contaminationObserved).toBe(true);
    expect(no.ok && no.value.contaminationObserved).toBe(false);
  });
});
