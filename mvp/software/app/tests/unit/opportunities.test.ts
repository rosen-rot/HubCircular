import { describe, expect, it } from "vitest";
import {
  accumulationRule,
  contaminationRule,
  missedMeasurementsRule,
  RULES,
  THRESHOLDS,
  type BalanceRow,
  type ContainerOccurrences,
  type ZoneWeighing,
} from "../../src/modules/opportunities/rules";

const NOW = new Date("2026-11-24T15:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const bal = (over: Partial<BalanceRow> = {}): BalanceRow => ({
  batchId: crypto.randomUUID(), batchRef: "L-000001", zoneId: "z1", zoneName: "Cowork", materialId: "m1", materialName: "Cartón",
  balanceG: 5_000, capturedAt: daysAgo(20), ...over,
});

describe("regla 1 · acumulación prolongada", () => {
  it("exige AMBAS condiciones: saldo ≥ 20 kg y lote más antiguo ≥ 14 días", () => {
    // 20 kg justos y 14 días justos → caso
    expect(accumulationRule([bal({ balanceG: 20_000, capturedAt: daysAgo(14) })], NOW)).toHaveLength(1);
    // 19,999 kg → no
    expect(accumulationRule([bal({ balanceG: 19_999, capturedAt: daysAgo(30) })], NOW)).toHaveLength(0);
    // 13 días → no
    expect(accumulationRule([bal({ balanceG: 50_000, capturedAt: daysAgo(13) })], NOW)).toHaveLength(0);
  });

  it("suma por material y zona; no mezcla materiales ni zonas; la evidencia son los lotes con enlace", () => {
    const rows = [
      bal({ batchRef: "L-000001", balanceG: 12_000, capturedAt: daysAgo(20) }),
      bal({ batchRef: "L-000002", balanceG: 9_000, capturedAt: daysAgo(2) }),
      bal({ materialId: "m2", materialName: "PET", balanceG: 30_000, capturedAt: daysAgo(3) }),
      bal({ zoneId: "z2", zoneName: "Lab", balanceG: 15_000, capturedAt: daysAgo(40) }),
    ];
    const out = accumulationRule(rows, NOW);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "acumulacion", scope: "Cartón · Cowork", evidenceTotal: 2 });
    expect(out[0]!.finding).toBe("21,0 kg en inventario en 2 lotes; el más antiguo lleva 20 días.");
    expect(out[0]!.evidence[0]).toMatchObject({ label: "L-000001 · 12,0 kg · 20 días" });
    expect(out[0]!.evidence[0]!.href).toMatch(/^\/lotes\//);
  });

  it("los saldos en cero no cuentan", () => {
    expect(accumulationRule([bal({ balanceG: 0, capturedAt: daysAgo(90) }), bal({ balanceG: 19_000 })], NOW)).toHaveLength(0);
  });
});

const occ = (statuses: string[], code = "C-1"): ContainerOccurrences => ({
  containerId: code, code, zoneName: "Cowork", materialName: "Cartón",
  occurrences: statuses.map((s, i) => ({ day: `2026-11-${String(10 + i).padStart(2, "0")}`, status: s as never })),
});

describe("regla 2 · mediciones omitidas", () => {
  it("3 omitidas → caso, aunque la cobertura sea alta", () => {
    const out = missedMeasurementsRule([occ(["omitido", "omitido", "omitido", ...Array(12).fill("realizado")])]);
    expect(out).toHaveLength(1);
    expect(out[0]!.finding).toBe("3 de 15 mediciones esperadas quedaron omitidas (cobertura 80 %).");
    expect(out[0]!.evidence[0]!.label).toBe("Omitida el 12-11-2026");
  });

  it("cobertura < 80 % con ≥ 5 esperadas → caso; con 4 esperadas no", () => {
    expect(missedMeasurementsRule([occ(["omitido", "omitido", "realizado", "realizado", "realizado"])])).toHaveLength(1); // 60 %, 5 esperadas
    expect(missedMeasurementsRule([occ(["omitido", "omitido", "realizado", "realizado"])])).toHaveLength(0); // 50 % pero solo 4
    expect(missedMeasurementsRule([occ(["omitido", "realizado", "realizado", "realizado", "cero_confirmado"])])).toHaveLength(0); // 80 %
  });

  it("el «cero confirmado» cuenta como medición hecha y lo de hoy (pendiente) no cuenta", () => {
    // 1 omitida + 4 ceros = 80 % → sin caso; si esos ceros fueran omisiones, sí habría caso.
    expect(missedMeasurementsRule([occ(["omitido", "cero_confirmado", "cero_confirmado", "cero_confirmado", "cero_confirmado", "pendiente"])])).toHaveLength(0);
    expect(missedMeasurementsRule([occ(["omitido", "omitido", "omitido", "cero_confirmado", "cero_confirmado", "pendiente"])])).toHaveLength(1);
    expect(missedMeasurementsRule([occ(["pendiente"])])).toHaveLength(0);
  });
});

const w = (contaminated: boolean, zone = "z1", i = 0): ZoneWeighing => ({
  weighingId: crypto.randomUUID(), weighingRef: `P-${String(i).padStart(6, "0")}`, zoneId: zone, zoneName: zone === "z1" ? "Cowork" : "Lab",
  occurredAt: daysAgo(i % 20), contaminated,
});
const many = (n: number, bad: number, zone = "z1") => Array.from({ length: n }, (_, i) => w(i < bad, zone, i + 1));

describe("regla 3 · contaminación frecuente", () => {
  it("con menos de 10 pesajes no concluye nada (base insuficiente), aunque todos estén contaminados", () => {
    expect(contaminationRule(many(9, 9))).toHaveLength(0);
  });
  it("10 pesajes y 30 % → caso; 29 % → no", () => {
    const hit = contaminationRule(many(10, 3));
    expect(hit).toHaveLength(1);
    expect(hit[0]).toMatchObject({ scope: "Cowork", finding: "3 de 10 pesajes con contaminación observada (30 %).", evidenceTotal: 3 });
    expect(hit[0]!.evidence.every((e) => e.href?.startsWith("/pesajes/"))).toBe(true);
    expect(contaminationRule(many(100, 29))).toHaveLength(0);
  });
  it("evalúa cada zona por separado", () => {
    const out = contaminationRule([...many(10, 5, "z1"), ...many(10, 1, "z2")]);
    expect(out.map((o) => o.scope)).toEqual(["Cowork"]);
  });
  it("la evidencia se recorta a 10 registros, pero el total informa todos", () => {
    const out = contaminationRule(many(40, 20));
    expect(out[0]!.evidence).toHaveLength(10);
    expect(out[0]!.evidenceTotal).toBe(20);
  });
});

describe("textos de las reglas", () => {
  it("cada regla explica su umbral con los valores en vigor", () => {
    const byId = Object.fromEntries(RULES.map((r) => [r.id, r]));
    expect(byId.acumulacion!.threshold).toContain(`${THRESHOLDS.acumulacion.minG / 1000} kg`);
    expect(byId.omitidas!.threshold).toContain("80 %");
    expect(byId.contaminacion!.threshold).toContain("30 %");
    for (const r of RULES) expect(r.suggestion.length).toBeGreaterThan(10);
  });
});
