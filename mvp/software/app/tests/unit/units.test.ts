import { describe, expect, it } from "vitest";
import { formatGrams, formatKg, parseKgToGrams, previewNetGrams } from "@/modules/weighing/units";

describe("parseKgToGrams", () => {
  it.each([
    ["6,40", 6400],
    ["6.4", 6400],
    ["0,350", 350],
    ["0.001", 1],
    ["4,250", 4250],
    ["12", 12000],
    [" 3,9 ", 3900],
    ["0", 0],
    ["1000", 1_000_000],
  ])("convierte %s kg → %i g sin errores de coma flotante", (input, grams) => {
    expect(parseKgToGrams(input)).toEqual({ ok: true, grams });
  });

  it("evita el error clásico de coma flotante (0,1 + 0,2 → 300 g exactos; 4,35 → 4350 g)", () => {
    expect(parseKgToGrams("4,35")).toEqual({ ok: true, grams: 4350 });
    expect(parseKgToGrams("1,005")).toEqual({ ok: true, grams: 1005 });
  });

  it("rechaza más de 3 decimales en lugar de redondear en silencio", () => {
    expect(parseKgToGrams("1,0005")).toEqual({ ok: false, error: "decimals" });
  });

  it.each(["", "   "])("rechaza vacío (%j)", (v) => {
    expect(parseKgToGrams(v)).toEqual({ ok: false, error: "empty" });
  });

  it.each(["-1", "+1", "1e3", "abc", "1,2,3", "1.234,5", "1 2", "0x10", "١٢", ",5", "5,", "NaN", "Infinity", "12345"])(
    "rechaza formato inválido %j",
    (v) => {
      expect(parseKgToGrams(v)).toEqual({ ok: false, error: "format" });
    },
  );
});

describe("formato y vista previa", () => {
  it("formatea gramos y kilogramos en es-CL", () => {
    expect(formatKg(3900)).toBe("3,900 kg");
    expect(formatGrams(3900)).toBe("3.900 g");
    expect(formatGrams(12000)).toBe("12.000 g");
  });
  it("neto = bruto − tara solo si es positivo", () => {
    expect(previewNetGrams(4250, 350)).toBe(3900);
    expect(previewNetGrams(350, 350)).toBeNull();
    expect(previewNetGrams(300, 350)).toBeNull();
  });
});
