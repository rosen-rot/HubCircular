import { describe, expect, it } from "vitest";
import { formatBatchRef, formatWeighingRef, parseRefQuery } from "@/modules/weighing/refs";

describe("referencias legibles", () => {
  it("formatea P-000123 y L-000007", () => {
    expect(formatWeighingRef(123)).toBe("P-000123");
    expect(formatBatchRef(7)).toBe("L-000007");
  });
  it("interpreta filtros", () => {
    expect(parseRefQuery("P-000012")).toEqual({ kind: "weighing", n: 12 });
    expect(parseRefQuery("12")).toEqual({ kind: "weighing", n: 12 });
    expect(parseRefQuery("l-7")).toEqual({ kind: "batch", n: 7 });
    expect(parseRefQuery("demo-z01")).toEqual({ kind: "container", text: "demo-z01" });
    expect(parseRefQuery("   ")).toBeNull();
  });
});
