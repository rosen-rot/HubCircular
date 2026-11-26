import { NextResponse, type NextRequest } from "next/server";
import { DomainError } from "@/lib/errors";
import { getCurrentActor } from "@/modules/identity/service";
import { listDeviceStatus } from "@/modules/iot/queries";

// Última lectura de los dispositivos de un contenedor, para el botón «Leer balanza» del formulario de pesaje.
// Requiere sesión (cookie); la RLS limita al ámbito del usuario.

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  try {
    const actor = await getCurrentActor();
    const { code } = await ctx.params;
    const devices = await listDeviceStatus(actor, { containerCode: decodeURIComponent(code).trim().toUpperCase().slice(0, 64) });
    return NextResponse.json(
      {
        devices: devices.map((d) => ({
          code: d.code,
          kind: d.kind,
          active: d.active,
          lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
          latest: d.latest
            ? {
                ...d.latest,
                receivedAt: d.latest.receivedAt.toISOString(),
                measuredAt: d.latest.measuredAt?.toISOString() ?? null,
              }
            : null,
        })),
        serverTime: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const de = e instanceof DomainError ? e : new DomainError("unexpected");
    if (de.code === "unexpected") console.error("[api/iot/latest] error inesperado", (e as Error).message);
    return NextResponse.json({ error: { code: de.code, message: de.userMessage } }, { status: de.status });
  }
}
