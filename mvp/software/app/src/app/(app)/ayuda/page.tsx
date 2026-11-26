import type { Metadata } from "next";
import Link from "next/link";
import { CircleHelp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { GLOSSARY, GLOSSARY_GROUPS, type GlossaryKey } from "@/lib/glossary";
import { requireActor } from "@/modules/identity/guards";

export const metadata: Metadata = { title: "Ayuda y glosario" };
export const dynamic = "force-dynamic";

/** Pasos del día para el operador (Iteración 5: instrucciones de operador). Texto simple, sin términos técnicos. */
const GUIDE: { title: string; text: string; href?: string; link?: string }[] = [
  { title: "Revise qué toca hoy", text: "En Inicio, la tarjeta «Medición de hoy» dice cuántos contenedores hay que medir y cuántos faltan.", href: "/inicio", link: "Ir a Inicio" },
  {
    title: "Pese cada contenedor",
    text: "Escanee el código QR del contenedor o abra Registro y elíjalo. Anote el peso bruto (todo junto) y la tara (el recipiente vacío): el sistema calcula el neto. Si ve material sucio o mezclado, marque «Contaminación visible en el material». Al confirmar, anote la referencia P-… que aparece.",
    href: "/registro",
    link: "Ir a Registro",
  },
  {
    title: "Si un contenedor está vacío el día que toca medir",
    text: "No invente un pesaje: en Calendarios use «Confirmar cero» para ese contenedor. Así queda claro que se revisó y no había nada.",
    href: "/calendarios",
    link: "Ir a Calendarios",
  },
  {
    title: "Cuando se retira material",
    text: "Registre el movimiento (despacho, reutilización, rechazo o traslado) indicando el lote y la cantidad. Si hay comprobante (guía de despacho, foto, correo), agréguelo después con «Agregar evidencia» en el detalle del lote.",
    href: "/retiros",
    link: "Registrar movimiento",
  },
  {
    title: "Si se equivocó",
    text: "Los registros no se borran ni se editan, para que todo sea trazable. Avise a un administrador con la referencia (P-…, L-… o M-…): él registra la corrección.",
  },
  {
    title: "Datos del sensor",
    text: "El peso o el llenado que muestran los sensores son solo informativos: no reemplazan su pesaje ni suman a lo captado.",
  },
];

export default async function AyudaPage() {
  await requireActor("/ayuda");
  const keys = Object.keys(GLOSSARY) as GlossaryKey[];
  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white" aria-hidden="true">
            <CircleHelp className="h-6 w-6" />
          </span>
          <h1 className="text-2xl font-bold text-brand-900">Ayuda y glosario</h1>
        </div>
        <p className="mt-1 max-w-3xl text-slate-700">
          Qué significa cada palabra de HubCircular, con ejemplos. En cada pantalla, el icono{" "}
          <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-brand-600 text-xs font-bold text-brand-700">
            i
          </span>{" "}
          <span className="sr-only">(información)</span>
          abre una explicación corta del término que tiene al lado.
        </p>
      </header>

      <section id="guia" aria-labelledby="h-guia" className="scroll-mt-4" data-testid="guia-operador">
        <h2 id="h-guia" className="text-xl font-bold text-brand-900">Guía rápida del operador</h2>
        <p className="mb-3 text-sm text-slate-700">Lo que se hace en un día normal, en orden. Cada paso lleva a la pantalla correspondiente.</p>
        <Card>
          <ol className="list-decimal space-y-3 pl-5 text-slate-800">
            {GUIDE.map((s) => (
              <li key={s.title}>
                <span className="font-semibold">{s.title}.</span> {s.text}{" "}
                {s.href ? <Link href={s.href} className="font-semibold text-brand-700 underline">{s.link}</Link> : null}
              </li>
            ))}
          </ol>
        </Card>
      </section>

      <nav aria-label="Secciones del glosario">
        <ul className="flex flex-wrap gap-2">
          <li>
            <a href="#guia" className="inline-block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-brand-800 hover:bg-brand-50">
              Guía rápida
            </a>
          </li>
          {GLOSSARY_GROUPS.map((g) => (
            <li key={g.id}>
              <a href={`#grupo-${g.id}`} className="inline-block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-brand-800 hover:bg-brand-50">
                {g.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {GLOSSARY_GROUPS.map((g) => (
        <section key={g.id} id={`grupo-${g.id}`} aria-labelledby={`h-${g.id}`} className="scroll-mt-4">
          <h2 id={`h-${g.id}`} className="text-xl font-bold text-brand-900">
            {g.title}
          </h2>
          <p className="mb-3 text-sm text-slate-700">{g.intro}</p>
          <div className="grid gap-3 md:grid-cols-2">
            {keys
              .filter((k) => GLOSSARY[k].group === g.id)
              .map((k) => (
                <Card key={k} id={k} className="scroll-mt-4 target:ring-2 target:ring-brand-600">
                  <h3 className="text-base font-bold text-slate-900">{GLOSSARY[k].name}</h3>
                  <p className="mt-1 text-slate-800">{GLOSSARY[k].short}</p>
                  <p className="mt-2 text-sm text-slate-700">{GLOSSARY[k].detail}</p>
                </Card>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
