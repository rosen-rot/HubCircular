import { describe, expect, it } from "vitest";
import { isJsonContentType, isSameOrigin } from "../../src/lib/origin";

describe("isSameOrigin", () => {
  it("permite peticiones sin Origin (clientes no navegador)", () => expect(isSameOrigin(null, "localhost:3000")).toBe(true));
  it("permite el mismo host", () => expect(isSameOrigin("http://localhost:3000", "localhost:3000")).toBe(true));
  it("rechaza otro host o puerto", () => {
    expect(isSameOrigin("https://evil.example", "localhost:3000")).toBe(false);
    expect(isSameOrigin("http://localhost:3001", "localhost:3000")).toBe(false);
  });
  it("rechaza Origin malformado u «null»", () => {
    expect(isSameOrigin("null", "localhost:3000")).toBe(false);
    expect(isSameOrigin("http://localhost:3000", null)).toBe(false);
  });
});

describe("isJsonContentType", () => {
  it("acepta application/json con o sin charset", () => {
    expect(isJsonContentType("application/json")).toBe(true);
    expect(isJsonContentType("application/json; charset=utf-8")).toBe(true);
  });
  it("rechaza text/plain que solo menciona application/json", () => {
    expect(isJsonContentType("text/plain; x=application/json")).toBe(false);
    expect(isJsonContentType(null)).toBe(false);
  });
});
