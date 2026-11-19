import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { GLOSSARY, GLOSSARY_GROUPS, type GlossaryKey } from "@/lib/glossary";
import { requireActor } from "@/modules/identity/guards";

export const metadata: Metadata = { title: "Ayuda y glosario" };
export const dynamic = "force-dynamic";

export default async function AyudaPage() {
  await requireActor("/ayuda");
  const keys = Object.keys(GLOSSARY) as GlossaryKey[];
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-brand-900">Ayuda y glosario</h1>
        <p className="mt-1 max-w-3xl text-slate-700">
          Qué significa cada palabra de HubCircular, con ejemplos. En cada pantalla, el icono{" "}
          <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-brand-600 text-xs font-bold text-brand-700">
            i
          </span>{" "}
          <span className="sr-only">(información)</span>
          abre una explicación corta del término que tiene al lado.
        </p>
      </header>

      <nav aria-label="Secciones del glosario">
        <ul className="flex flex-wrap gap-2">
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
