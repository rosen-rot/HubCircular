import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Carga mínima de .env.local / .env para scripts (Next ya lo hace para la aplicación). No sobrescribe variables existentes. */
export function loadEnv(): void {
  for (const f of [".env.local", ".env"]) {
    const p = path.join(process.cwd(), f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m || line.trim().startsWith("#")) continue;
      const key = m[1]!;
      const value = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}
