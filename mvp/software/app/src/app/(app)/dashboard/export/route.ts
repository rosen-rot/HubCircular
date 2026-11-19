import { NextResponse, type NextRequest } from "next/server";
import { DomainError } from "@/lib/errors";
import { santiagoToday } from "@/lib/time";
import { assertCan } from "@/modules/identity/permissions";
import { getCurrentActor } from "@/modules/identity/service";
import { CSV_KINDS, type CsvKind } from "@/modules/indicators/csv";
import { coverageCsv, detailCsv, kpiCsv, MOVEMENT_HEADERS, WEIGHING_HEADERS } from "@/modules/indicators/exports";
import { parseIndicatorFilters } from "@/modules/indicators/filters";
import { EXPORT_ROW_LIMIT, exportCoverage, exportMovements, exportWeighings, getIndicators, loadIndicatorOptions } from "@/modules/indicators/queries";

export const dynamic = "force-dynamic";

const fail = (e: DomainError) => NextResponse.json({ error: { code: e.code, message: e.userMessage } }, { status: e.status });

/**
 * Exportación CSV de indicadores. Solo lectura (GET), con sesión y permiso `indicators:read`; el ámbito del actor,
 * el origen real/DEMO y los filtros se aplican en el servidor con la misma lógica del tablero.
 */
export async function GET(req: NextRequest) {
  try {
    const actor = await getCurrentActor();
    assertCan(actor, "indicators:read");

    const kind = req.nextUrl.searchParams.get("kind") ?? "";
    if (!(CSV_KINDS as readonly string[]).includes(kind)) {
      return NextResponse.json({ error: { code: "validation", message: "Tipo de exportación no válido." } }, { status: 422 });
    }
    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
    const { filters } = parseIndicatorFilters(raw, santiagoToday());

    let csv: string;
    switch (kind as CsvKind) {
      case "kpis": {
        const [data, options] = await Promise.all([getIndicators(actor, filters), loadIndicatorOptions(actor, filters.origin)]);
        csv = kpiCsv({
          kpis: data.kpis,
          occurrences: data.occurrences,
          filters,
          zoneName: options.zones.find((z) => z.id === filters.zoneId)?.name ?? null,
          materialName: options.materials.find((m) => m.id === filters.materialId)?.name ?? null,
        });
        break;
      }
      case "pesajes": {
        const r = await exportWeighings(actor, filters);
        csv = detailCsv(WEIGHING_HEADERS, r.rows, r.truncated ? EXPORT_ROW_LIMIT : undefined);
        break;
      }
      case "movimientos": {
        const r = await exportMovements(actor, filters);
        csv = detailCsv(MOVEMENT_HEADERS, r.rows, r.truncated ? EXPORT_ROW_LIMIT : undefined);
        break;
      }
      default: {
        const r = await exportCoverage(actor, filters);
        csv = coverageCsv(r.occurrences, r.containers);
      }
    }

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="hubcircular-${kind}-${filters.origin}-${filters.from}_${filters.to}.csv"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof DomainError) return fail(err);
    console.error("[dashboard/export] error inesperado", (err as Error).message);
    return fail(new DomainError("unexpected"));
  }
}
