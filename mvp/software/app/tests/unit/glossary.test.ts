import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GLOSSARY, GLOSSARY_GROUPS, MOVEMENT_TIP } from "../../src/lib/glossary";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sources(p) : /\.(tsx?|jsx?)$/.test(n) ? [p] : [];
  });
}

describe("glosario", () => {
  const keys = Object.keys(GLOSSARY);

  it("cada entrada tiene nombre, explicación corta y detalle, y pertenece a un grupo existente", () => {
    const groups = new Set(GLOSSARY_GROUPS.map((g) => g.id));
    for (const k of keys) {
      const e = GLOSSARY[k as keyof typeof GLOSSARY];
      expect(e.name.trim().length, k).toBeGreaterThan(2);
      expect(e.short.trim().length, k).toBeGreaterThan(20);
      expect(e.short.length, `${k}: la explicación corta debe caber en el globo`).toBeLessThanOrEqual(260);
      expect(e.detail.trim().length, k).toBeGreaterThan(20);
      expect(groups.has(e.group), k).toBe(true);
    }
  });

  it("las claves son identificadores seguros (se usan como ancla #clave en /ayuda)", () => {
    for (const k of keys) expect(k).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it("todo término usado en la aplicación (k=, help=) existe en el glosario", () => {
    const used = new Set<string>();
    for (const f of sources(join(__dirname, "../../src"))) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/\b(?:k|help)="([a-z0-9_]+)"/g)) used.add(m[1]!);
    }
    expect(used.size).toBeGreaterThan(20);
    for (const k of used) expect(keys, `término desconocido: ${k}`).toContain(k);
  });

  it("los tipos de movimiento apuntan a entradas existentes", () => {
    for (const v of Object.values(MOVEMENT_TIP)) expect(keys).toContain(v);
  });

  it("las palabras que confundían se explican: tara, cero, neto, bruto, saldo, valorización", () => {
    for (const k of ["tara", "cero", "neto", "bruto", "saldo", "valorizacion", "cobertura", "omitida"]) expect(keys).toContain(k);
    expect(GLOSSARY.tara.short.toLowerCase()).toContain("recipiente");
    expect(GLOSSARY.cero.short.toLowerCase()).toContain("vacío");
  });
});
