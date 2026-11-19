import { describe, expect, it } from "vitest";
import { addDays, daysBetween, isValidDateString, santiagoToday } from "@/lib/time";
import { parseIndicatorFilters, filtersToParams, includesToday } from "@/modules/indicators/filters";
import { summarizeCoverage, formatWeekdays, type Occurrence } from "@/modules/indicators/coverage";
import { csvCell, toCsv } from "@/modules/indicators/csv";
import { isPartialWeek, mondayOf, niceAxisMax, weekStartsBetween } from "@/modules/indicators/weeks";

const TODAY = "2026-11-19"; // jueves

describe("fechas de calendario", () => {
  it("valida y opera sin zona horaria", () => {
    expect(isValidDateString("2026-02-28")).toBe(true);
    expect(isValidDateString("2026-02-30")).toBe(false);
    expect(isValidDateString("2026-2-3")).toBe(false);
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-03-01", "2026-03-31")).toBe(30);
  });
  it("hoy en Santiago respeta el cambio de día local", () => {
    expect(santiagoToday(new Date("2026-03-16T02:30:00Z"))).toBe("2026-03-15"); // domingo 23:30 local
    expect(santiagoToday(new Date("2026-03-16T03:30:00Z"))).toBe("2026-03-16");
    expect(santiagoToday(new Date("2026-04-05T03:30:00Z"))).toBe("2026-04-04"); // tras el cambio de hora
  });
});

describe("filtros del tablero", () => {
  it("por defecto: últimos 30 días hasta hoy, origen real, sin zona ni material", () => {
    const { filters, notices } = parseIndicatorFilters({}, TODAY);
    expect(filters).toEqual({ from: "2026-10-21", to: TODAY, zoneId: null, materialId: null, origin: "real" });
    expect(notices).toEqual([]);
  });
  it("DEMO solo se activa de forma explícita; cualquier otro valor cae en real", () => {
    expect(parseIndicatorFilters({ origin: "demo" }, TODAY).filters.origin).toBe("demo");
    expect(parseIndicatorFilters({ origin: "DEMO" }, TODAY).filters.origin).toBe("real");
    expect(parseIndicatorFilters({ origin: "todos" }, TODAY).filters.origin).toBe("real");
  });
  it("fechas inválidas, invertidas, futuras o demasiado largas se corrigen y se avisa", () => {
    const bad = parseIndicatorFilters({ from: "2026-02-30", to: "x" }, TODAY);
    expect(bad.filters.to).toBe(TODAY);
    expect(bad.notices.length).toBe(2);
    const inv = parseIndicatorFilters({ from: "2026-11-10", to: "2026-11-01" }, TODAY);
    expect(inv.filters).toMatchObject({ from: "2026-10-03", to: "2026-11-01" });
    expect(inv.notices.length).toBe(1);
    const fut = parseIndicatorFilters({ from: "2026-11-01", to: "2027-01-01" }, TODAY);
    expect(fut.filters.to).toBe(TODAY);
    const long = parseIndicatorFilters({ from: "2020-01-01", to: TODAY }, TODAY);
    expect(daysBetween(long.filters.from, long.filters.to) + 1).toBe(366);
  });
  it("identificadores no UUID se ignoran (no llegan a la consulta)", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    const r = parseIndicatorFilters({ zone: "'; drop table x;--", material: id }, TODAY);
    expect(r.filters.zoneId).toBeNull();
    expect(r.filters.materialId).toBe(id);
    expect(r.notices.length).toBe(1);
  });
  it("arma parámetros de URL y detecta que el período incluye hoy", () => {
    const { filters } = parseIndicatorFilters({ from: "2026-11-01", to: "2026-11-10", origin: "demo" }, TODAY);
    expect(filtersToParams(filters, { kind: "kpis" }).toString()).toBe("from=2026-11-01&to=2026-11-10&origin=demo&kind=kpis");
    expect(includesToday(filters, TODAY)).toBe(false);
    expect(includesToday({ ...filters, to: TODAY }, TODAY)).toBe(true);
  });
});

describe("cobertura", () => {
  const occ = (status: Occurrence["status"], n = 1): Occurrence[] =>
    Array.from({ length: n }, (_, i) => ({ containerId: "c", scheduleId: "s", day: `2026-02-0${i + 1}`, status, weighings: 0, zeroNote: null }));
  it("(realizado + cero) / (realizado + cero + omitido); pendientes aparte", () => {
    const s = summarizeCoverage([...occ("realizado", 2), ...occ("cero_confirmado", 1), ...occ("omitido", 1), ...occ("pendiente", 3)]);
    expect(s).toEqual({ realized: 2, zeroConfirmed: 1, omitted: 1, pending: 3, evaluated: 4, percent: 75 });
  });
  it("sin mediciones evaluadas no hay porcentaje (no es 0 % ni 100 %)", () => {
    expect(summarizeCoverage([]).percent).toBeNull();
    expect(summarizeCoverage(occ("pendiente", 2)).percent).toBeNull();
  });
  it("redondea a un decimal y un omitido nunca cuenta como cero", () => {
    expect(summarizeCoverage([...occ("realizado", 1), ...occ("omitido", 2)]).percent).toBe(33.3);
    expect(summarizeCoverage(occ("omitido", 3)).percent).toBe(0);
  });
  it("formatea días de la semana ISO", () => {
    expect(formatWeekdays([5, 1, 3])).toBe("lun, mié, vie");
  });
});

describe("CSV", () => {
  it("escapa separador, comillas y saltos; usa BOM y CRLF", () => {
    const out = toCsv(["a", "b"], [["x;y", 'di "hola"'], ["l1\nl2", 5]]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toBe('﻿a;b\r\n"x;y";"di ""hola"""\r\nl1 l2;5\r\n');
  });
  it("neutraliza fórmulas en textos pero no altera números negativos", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell(-250)).toBe("-250");
    expect(csvCell(null)).toBe("");
    expect(csvCell(true)).toBe("sí");
  });
});

describe("semanas y eje", () => {
  it("el lunes ISO de cualquier día, incluido el domingo", () => {
    expect(mondayOf("2026-03-09")).toBe("2026-03-09");
    expect(mondayOf("2026-03-15")).toBe("2026-03-09"); // domingo
    expect(mondayOf("2026-03-16")).toBe("2026-03-16");
  });
  it("lista semanas sin huecos y marca las parciales", () => {
    expect(weekStartsBetween("2026-03-11", "2026-03-24")).toEqual(["2026-03-09", "2026-03-16", "2026-03-23"]);
    expect(isPartialWeek("2026-03-09", "2026-03-11", "2026-03-24")).toBe(true);
    expect(isPartialWeek("2026-03-16", "2026-03-11", "2026-03-24")).toBe(false);
    expect(isPartialWeek("2026-03-23", "2026-03-11", "2026-03-24")).toBe(true);
  });
  it("eje con máximos redondos que cubren el valor", () => {
    for (const v of [0.4, 1, 7, 13, 99, 1234]) {
      const { max, step } = niceAxisMax(v);
      expect(max).toBeGreaterThanOrEqual(v);
      expect(max % step).toBeCloseTo(0, 9);
    }
    expect(niceAxisMax(0)).toEqual({ max: 4, step: 1 });
  });
});
