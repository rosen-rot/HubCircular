import { NextResponse, type NextRequest } from "next/server";
import { DomainError } from "@/lib/errors";
import { getCurrentActor } from "@/modules/identity/service";
import { assertCan } from "@/modules/identity/permissions";
import { listWeighings } from "@/modules/weighing/queries";
import { registerWeighing } from "@/modules/weighing/service";
import { z } from "zod";

// Contrato de docs/04: POST /api/weighings (pesaje confirmado → crea lote). Autenticación por cookie de sesión.
// El neto NO se acepta del cliente: siempre lo calcula el servidor. La Idempotency-Key es obligatoria.

const body = z
  .object({
    containerCode: z.string().trim().min(1).max(64),
    grossG: z.number().int().positive().max(1_000_000),
    tareG: z.number().int().nonnegative().max(1_000_000),
    occurredAt: z.string().datetime({ offset: true }).optional().nullable(),
    notes: z.string().max(500).optional().nullable(),
    contaminationObserved: z.boolean().optional(),
  })
  .strict();

const fail = (e: DomainError) =>
  NextResponse.json({ error: { code: e.code, message: e.userMessage } }, { status: e.status });

export async function POST(req: NextRequest) {
  try {
    const actor = await getCurrentActor();
    assertCan(actor, "weighing:create");

    if (!req.headers.get("content-type")?.includes("application/json")) {
      return NextResponse.json({ error: { code: "validation", message: "Content-Type debe ser application/json." } }, { status: 415 });
    }
    const raw = await req.text();
    if (raw.length > 8_192) return NextResponse.json({ error: { code: "validation", message: "Cuerpo demasiado grande." } }, { status: 413 });

    const key = req.headers.get("idempotency-key") ?? "";
    if (!z.string().uuid().safeParse(key).success) {
      return NextResponse.json({ error: { code: "idempotency_key_required", message: "Encabezado Idempotency-Key (UUID) obligatorio." } }, { status: 422 });
    }
    let json: unknown;
    try { json = JSON.parse(raw); } catch { return NextResponse.json({ error: { code: "validation", message: "JSON inválido." } }, { status: 400 }); }
    const parsed = body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: { code: "validation", message: "Datos inválidos.", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } }, { status: 422 });
    }
    const v = parsed.data;
    const result = await registerWeighing(actor, {
      containerCode: v.containerCode.toUpperCase(),
      grossG: v.grossG,
      tareG: v.tareG,
      occurredAt: v.occurredAt ? new Date(v.occurredAt) : null,
      notes: v.notes?.trim() || null,
      contaminationObserved: v.contaminationObserved ?? false,
      idempotencyKey: key,
    });
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (err) {
    if (err instanceof DomainError) return fail(err);
    console.error("[api/weighings] error inesperado", (err as Error).message);
    return fail(new DomainError("unexpected"));
  }
}

export async function GET(req: NextRequest) {
  try {
    const actor = await getCurrentActor();
    assertCan(actor, "weighing:read");
    const p = req.nextUrl.searchParams;
    const res = await listWeighings(actor, {
      from: p.get("from") ?? undefined,
      to: p.get("to") ?? undefined,
      materialId: p.get("materialId") ?? undefined,
      zoneId: p.get("zoneId") ?? undefined,
      userId: p.get("userId") ?? undefined,
      ref: p.get("ref") ?? undefined,
      page: Number(p.get("page")) || 1,
    });
    return NextResponse.json(res);
  } catch (err) {
    if (err instanceof DomainError) return fail(err);
    console.error("[api/weighings] error inesperado", (err as Error).message);
    return fail(new DomainError("unexpected"));
  }
}
