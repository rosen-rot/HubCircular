import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadMigrations } from "../../src/lib/migrator";

describe("loadMigrations", () => {
  it("el checksum no cambia si Git convierte LF en CRLF (Windows)", () => {
    const lf = mkdtempSync(path.join(tmpdir(), "mig-lf-"));
    const crlf = mkdtempSync(path.join(tmpdir(), "mig-crlf-"));
    writeFileSync(path.join(lf, "0001_x.sql"), "select 1;\nselect 2;\n");
    writeFileSync(path.join(crlf, "0001_x.sql"), "select 1;\r\nselect 2;\r\n");
    expect(loadMigrations(crlf)[0]!.checksum).toBe(loadMigrations(lf)[0]!.checksum);
  });

  it("ordena por nombre e ignora archivos que no siguen el patrón NNNN_nombre.sql", () => {
    const d = mkdtempSync(path.join(tmpdir(), "mig-ord-"));
    for (const f of ["0002_b.sql", "0001_a.sql", "notas.md", "x_1.sql"]) writeFileSync(path.join(d, f), "select 1;");
    expect(loadMigrations(d).map((m) => m.name)).toEqual(["0001_a.sql", "0002_b.sql"]);
  });

  it("las migraciones del repositorio tienen numeración consecutiva sin huecos", () => {
    const names = loadMigrations().map((m) => m.name);
    names.forEach((n, i) => expect(n.startsWith(String(i + 1).padStart(4, "0"))).toBe(true));
  });
});
