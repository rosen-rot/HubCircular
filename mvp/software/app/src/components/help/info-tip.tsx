"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";
import { cn } from "@/lib/utils";

const PANEL_W = 288; // 18rem
const MARGIN = 8;

/**
 * Icono (i) con la explicación corta de un término. Usa <details>/<summary> (teclado y lector de pantalla de serie).
 * El panel se posiciona con coordenadas de ventana ("fixed") para que no lo recorten las tablas con desplazamiento ni
 * se salga de la pantalla; se cierra con Escape, al pulsar fuera o al pulsar de nuevo el icono.
 */
export function InfoTip({ k, className }: { k: GlossaryKey; className?: string }) {
  const e = GLOSSARY[k];
  const details = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; width: number }>({ left: MARGIN, top: 0, width: PANEL_W });

  const place = useCallback(() => {
    const s = summary.current;
    if (!s) return;
    const r = s.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(PANEL_W, vw - 2 * MARGIN);
    const left = Math.max(MARGIN, Math.min(r.left, vw - width - MARGIN));
    const h = panel.current?.offsetHeight ?? 140;
    const below = r.bottom + 4;
    const top = below + h > vh - MARGIN && r.top - 4 - h > MARGIN ? r.top - 4 - h : below;
    setPos({ left, top, width });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const close = (ev: Event) => {
      if (ev.target instanceof Node && details.current?.contains(ev.target)) return;
      if (details.current) details.current.open = false;
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape" || !details.current) return;
      details.current.open = false;
      summary.current?.focus();
    };
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, place]);

  return (
    <details ref={details} onToggle={(ev) => setOpen(ev.currentTarget.open)} className={cn("group ml-1 inline-block align-middle", className)}>
      <summary
        ref={summary}
        aria-label={`Qué significa: ${e.name}`}
        className="inline-flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded-full border border-brand-600 bg-white text-xs font-bold leading-none text-brand-700 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 [&::-webkit-details-marker]:hidden"
      >
        <span aria-hidden="true">i</span>
      </summary>
      <div
        ref={panel}
        role="note"
        style={{ left: pos.left, top: pos.top, width: pos.width }}
        className="fixed z-30 hidden group-open:block rounded-lg border border-slate-300 bg-white p-3 text-left text-sm font-normal normal-case text-slate-800 shadow-lg"
      >
        <p className="font-semibold text-brand-900">{e.name}</p>
        <p className="mt-1">{e.short}</p>
        <p className="mt-2">
          <Link href={`/ayuda#${k}`} className="font-semibold text-brand-700 underline">
            Más detalle en Ayuda
          </Link>
        </p>
      </div>
    </details>
  );
}

/** Texto + icono (i): para títulos, encabezados de tabla y etiquetas. */
export function Term({ k, children }: { k: GlossaryKey; children?: React.ReactNode }) {
  return (
    <span className="inline-flex flex-wrap items-center">
      <span>{children ?? GLOSSARY[k].name}</span>
      <InfoTip k={k} />
    </span>
  );
}
