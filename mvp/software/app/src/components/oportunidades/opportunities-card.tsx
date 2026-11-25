import Link from "next/link";
import { Lightbulb } from "lucide-react";
import { InfoTip } from "@/components/help/info-tip";
import { Card, DemoBadge } from "@/components/ui/card";
import type { OpportunitiesReport } from "@/modules/opportunities/queries";

/** Resumen en Inicio de las oportunidades de mejora del origen elegido (real o DEMO, nunca juntos). */
export function OpportunitiesCard({ report, demo }: { report: OpportunitiesReport; demo: boolean }) {
  const href = demo ? "/oportunidades?origin=demo" : "/oportunidades";
  const top = report.results.flatMap((r) => r.cases.slice(0, 1).map((c) => ({ rule: r.rule.name, scope: c.scope, finding: c.finding, key: c.key })));
  return (
    <Card className="min-w-0" data-testid="tarjeta-oportunidades">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-brand-900">
          <Lightbulb className="h-5 w-5" aria-hidden="true" />
          Oportunidades de mejora {demo ? <DemoBadge /> : null}
          <InfoTip k="oportunidad" />
        </h2>
        <Link href={href} className="text-sm font-semibold text-brand-700 underline">Ver detalle y evidencia</Link>
      </div>
      {report.total === 0 ? (
        <div className="mt-2 text-sm text-slate-700" data-testid="oportunidades-vacio">
          Sin casos con los datos actuales. Las reglas revisan acumulación, mediciones omitidas y contaminación.
        </div>
      ) : (
        <>
          <div className="mt-2 text-sm" data-testid="oportunidades-total">
            <strong>{report.total}</strong> caso{report.total === 1 ? "" : "s"} para revisar
            {" · "}
            {report.results.map((r) => `${r.rule.name}: ${r.cases.length}`).join(" · ")}
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {top.map((t) => (
              <li key={t.key} className="rounded-lg border border-amber-300 bg-amber-50/60 px-3 py-2">
                <span className="font-semibold">{t.rule}</span> — {t.scope}
                <span className="block text-slate-700">{t.finding}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
