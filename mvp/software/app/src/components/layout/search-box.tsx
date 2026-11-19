"use client";

import { Search } from "lucide-react";
import { useEffect, useRef } from "react";

/** Buscador de la barra superior: lleva al historial filtrado por referencia o contenedor (P-12, L-7, DEMO-Z01…). Ctrl/Cmd + K lo enfoca. */
export function SearchBox() {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form action="/historial" method="get" role="search" className="relative w-full max-w-xl">
      <label htmlFor="busqueda-global" className="sr-only">
        Buscar pesajes, lotes o contenedores
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" aria-hidden="true" />
      <input
        ref={input}
        id="busqueda-global"
        name="ref"
        type="search"
        maxLength={64}
        autoComplete="off"
        placeholder="Buscar pesajes, lotes, contenedores…"
        className="block min-h-11 w-full rounded-xl border border-slate-300 bg-white py-2 pl-10 pr-16 text-base text-slate-900 placeholder:text-slate-500"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-600 sm:block" aria-hidden="true">
        Ctrl K
      </kbd>
    </form>
  );
}
