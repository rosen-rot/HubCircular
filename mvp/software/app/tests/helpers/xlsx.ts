import { strFromU8, unzipSync } from "fflate";

export type XlsxValue = string | number | null;
export interface ParsedWorkbook {
  sheets: Record<string, XlsxValue[][]>;
  /** Hojas que contienen alguna celda de fórmula (<f>): debe ser siempre vacío. */
  withFormulas: string[];
}

const unescapeXml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const colIndex = (ref: string) => [...ref.replace(/\d+/g, "")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** Lector mínimo de .xlsx para pruebas (hojas, texto compartido, números); no es parte de la aplicación. */
export function readWorkbook(data: Uint8Array | Buffer): ParsedWorkbook {
  const files = unzipSync(new Uint8Array(data));
  const text = (p: string) => strFromU8(files[p] ?? new Uint8Array());
  const shared = [...text("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => unescapeXml([...m[1]!.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  const names = [...text("xl/workbook.xml").matchAll(/<sheet [^>]*name="([^"]*)"/g)].map((m) => unescapeXml(m[1]!));
  const sheets: Record<string, XlsxValue[][]> = {};
  const withFormulas: string[] = [];
  names.forEach((name, i) => {
    const xml = text(`xl/worksheets/sheet${i + 1}.xml`);
    if (/<f[ >]/.test(xml)) withFormulas.push(name);
    const rows: XlsxValue[][] = [];
    for (const r of xml.matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)) {
      const row: XlsxValue[] = [];
      for (const c of r[1]!.matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const v = /<v>([\s\S]*?)<\/v>/.exec(c[3] ?? "")?.[1];
        const isString = /t="s"/.test(c[2]!);
        row[colIndex(c[1]!)] = v === undefined ? null : isString ? shared[Number(v)]! : Number(v);
      }
      rows.push(Array.from(row, (x) => x ?? null));
    }
    sheets[name] = rows;
  });
  return { sheets, withFormulas };
}
