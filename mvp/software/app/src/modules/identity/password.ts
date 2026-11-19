import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

// Parámetros por defecto: alternativa OWASP para scrypt (N=2^15, r=8, p=3). Se codifican en el hash,
// de modo que pueden endurecerse sin invalidar claves existentes.
const DEFAULTS = { N: 2 ** 15, r: 8, p: 3 } as const;
const KEYLEN = 32;

function scrypt(password: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password.normalize("NFKC"), salt, KEYLEN, { ...opts, maxmem: 256 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string, params: { N?: number; r?: number; p?: number } = {}): Promise<string> {
  const { N, r, p } = { ...DEFAULTS, ...params };
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [N, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  if (![N, r, p].every((n) => Number.isInteger(n) && n > 0)) return false;
  const salt = Buffer.from(parts[4]!, "base64");
  const expected = Buffer.from(parts[5]!, "base64");
  if (expected.length !== KEYLEN) return false;
  const actual = await scrypt(password, salt, { N, r, p });
  return timingSafeEqual(actual, expected);
}

/** Hash ficticio para igualar el tiempo de respuesta cuando el correo no existe (evita enumerar usuarios). */
let dummy: Promise<string> | undefined;
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword("hubcircular-dummy-password");
  return dummy;
}

