import { NextResponse, type NextRequest } from "next/server";
import { DomainError } from "@/lib/errors";
import { santiagoToday } from "@/lib/time";
import { assertCan } from "@/modules/identity/permissions";
import { getCurrentActor } from "@/modules/identity/service";
import { CSV_KINDS, type CsvKind } from "@/modules/indicators/csv";
import { toCsv } from "@/modules/indicators/csv";
import { coverageTable, detailTable, kpiTable, MOVEMENT_HEADERS, WEIGHING_HEADERS, type Table } from "@/modules/indicators/exports";
import { buildWorkbook, XLSX_MIME } from "@/modules/indicators/workbook";
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
    if (kind !== "todo" && !(CSV_KINDS as readonly string[]).includes(kind)) {
      return NextResponse.json({ error: { code: "validation", message: "Tipo de exportación no válido." } }, { status: 422 });
    }
    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
    const { filters } = parseIndicatorFilters(raw, santiagoToday());
    const name = `hubcircular-${kind}-${filters.origin}-${filters.from}_${filters.to}`;

    const kpis = async (): Promise<Table> => {
      const [data, options] = await Promise.all([getIndicators(actor, filters), loadIndicatorOptions(actor, filters.origin)]);
      return kpiTable({
        kpis: data.kpis,
        occurrences: data.occurrences,
        filters,
        zoneName: options.zones.find((z) => z.id === filters.zoneId)?.name ?? null,
        materialName: options.materials.find((m) => m.id === filters.materialId)?.name ?? null,
      });
    };
    const pesajes = async (): Promise<Table> => {
      const r = await exportWeighings(actor, filters);
      return detailTable(WEIGHING_HEADERS, r.rows, r.truncated ? EXPORT_ROW_LIMIT : undefined);
    };
    const movimientos = async (): Promise<Table> => {
      const r = await exportMovements(actor, filters);
      return detailTable(MOVEMENT_HEADERS, r.rows, r.truncated ? EXPORT_ROW_LIMIT : undefined);
    };
    const cobertura = async (): Promise<Table> => {
      const r = await exportCoverage(actor, filters);
      return coverageTable(r.occurrences, r.containers);
    };

    const noCache = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

    if (kind === "todo") {
      // Las cuatro consultas se hacen una a una: cada una abre su propia transacción con el actor.
      const tables = { Indicadores: await kpis(), Pesajes: await pesajes(), Movimientos: await movimientos(), Cobertura: await cobertura() };
      const book = await buildWorkbook(tables);
      return new NextResponse(new Uint8Array(book), {
        status: 200,
        headers: { "Content-Type": XLSX_MIME, "Content-Disposition": `attachment; filename="${name}.xlsx"`, ...noCache },
      });
    }

    const table = await { kpis, pesajes, movimientos, cobertura }[kind as CsvKind]();
    return new NextResponse(toCsv(table.headers, table.rows), {
      status: 200,
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"`, ...noCache },
    });
  } catch (err) {
    if (err instanceof DomainError) return fail(err);
    console.error("[dashboard/export] error inesperado", (err as Error).message);
    return fail(new DomainError("unexpected"));
  }
}
