import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

/** Servidor GoTrue SIMULADO (no es Supabase real): solo implementa POST /auth/v1/token?grant_type=password y /auth/v1/logout. */
export interface FakeUser {
  id: string;
  password: string;
  confirmed: boolean;
}

export interface FakeGoTrue {
  url: string;
  publishableKey: string;
  users: Map<string, FakeUser>;
  /** "ok" responde normal; "down" responde 503; "malformed" responde 200 con cuerpo no JSON; "rate" responde 429. */
  mode: "ok" | "down" | "malformed" | "rate";
  requests: { path: string; apikey: string | undefined; authorization: string | undefined; body: Record<string, unknown> }[];
  logouts: number;
  add(email: string, password: string, confirmed?: boolean): FakeUser;
  close(): Promise<void>;
}

/**
 * Con `control: true` expone, SOLO para las pruebas E2E (proceso aparte), GET /__test/health,
 * POST /__test/users {email,password,confirmed?} y POST /__test/mode {mode}.
 */
export async function startFakeGoTrue(publishableKey = "sb_publishable_FAKE_KEY_FOR_TESTS", opts: { port?: number; control?: boolean } = {}): Promise<FakeGoTrue> {
  const state: FakeGoTrue = {
    url: "",
    publishableKey,
    users: new Map(),
    mode: "ok",
    requests: [],
    logouts: 0,
    add(email, password, confirmed = true) {
      const u = { id: randomUUID(), password, confirmed };
      state.users.set(email.toLowerCase(), u);
      return u;
    },
    close: () => new Promise((r) => server.close(() => r())),
  };
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      } catch {
        /* cuerpo vacío */
      }
      const path = (req.url ?? "").split("?")[0]!;
      state.requests.push({ path, apikey: req.headers.apikey as string | undefined, authorization: req.headers.authorization, body });
      const json = (code: number, o: unknown) => {
        res.writeHead(code, { "content-type": "application/json" });
        res.end(JSON.stringify(o));
      };
      if (opts.control && path === "/__test/health") return json(200, { ok: true });
      if (opts.control && path === "/__test/users") {
        state.add(String(body.email), String(body.password), body.confirmed !== false);
        return json(200, { ok: true });
      }
      if (opts.control && path === "/__test/mode") {
        state.mode = body.mode as FakeGoTrue["mode"];
        return json(200, { ok: true });
      }
      if (req.headers.apikey !== state.publishableKey) return json(401, { message: "Invalid API key" });
      if (path === "/auth/v1/logout") {
        state.logouts++;
        res.writeHead(204);
        return res.end();
      }
      if (path !== "/auth/v1/token") return json(404, {});
      if (state.mode === "down") return json(503, { message: "unavailable" });
      if (state.mode === "rate") return json(429, { message: "rate limit" });
      if (state.mode === "malformed") {
        res.writeHead(200, { "content-type": "text/html" });
        return res.end("<html>nope</html>");
      }
      const email = String(body.email ?? "").toLowerCase();
      const u = state.users.get(email);
      if (!u || u.password !== body.password) return json(400, { error: "invalid_grant", error_description: "Invalid login credentials" });
      if (!u.confirmed) return json(400, { error: "invalid_grant", error_description: "Email not confirmed" });
      return json(200, {
        access_token: `fake.access.${u.id}`,
        token_type: "bearer",
        user: { id: u.id, email, email_confirmed_at: "2026-01-01T00:00:00Z" },
      });
    });
  });
  await new Promise<void>((r) => server.listen(opts.port ?? 0, "127.0.0.1", () => r()));
  state.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return state;
}
