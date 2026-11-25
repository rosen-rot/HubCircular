import type { Metadata } from "next";
import Link from "next/link";
import { Lightbulb } from "lucide-react";
import { Forbidden } from "@/components/forbidden";
import { InfoTip } from "@/components/help/info-tip";
import { Alert, Badge, Card, DemoBadge } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import { formatSantiago } from "@/lib/time";
import { requireActorWith } from "@/modules/identity/guards";
import { getOpportunities } from "@/modules/opportunities/queries";

export const metadata: Metadata = { title: "Oportunidades" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

export default async function OportunidadesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { actor, allowed } = await requireActorWith("indicators:read", "/oportunidades");
  if (!allowed) return <Forbidden what="las oportunidades de mejora" />;
  const raw = Array.isArray(sp.origin) ? sp.origin[0] : sp.origin;
  const origin = raw === "demo" ? "demo" : "real";
  const demo = origin === "demo";
  const report = await getOpportunities(actor, origin);

  const pill = (active: boolean) =>
    cn(
      "inline-flex min-h-9 items-center rounded-full px-3 text-sm font-semibold",
      active ? "bg-brand-600 text-white" : "bg-white text-brand-900 ring-1 ring-slate-300 hover:bg-brand-50",
    );

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        icon={Lightbulb}
        title={<>Oportunidades de mejora {demo ? <DemoBadge /> : null}</>}
        subtitle="Reglas simples que revisan los datos registrados y sugieren dónde mirar. Cada caso muestra el umbral, lo observado y los registros que lo respaldan."
      />
      {demo ? (
        <Alert tone="warning" role="status">
          <strong>Datos de demostración.</strong> Estos casos no son reales: no los use para informar resultados del piloto.
        </Alert>
      ) : null}
      <Alert tone="info" role="note" data-testid="aviso-oportunidades">
        Son <strong>sugerencias para revisar</strong> (<InfoTip k="oportunidad" />), no conclusiones: un caso indica dónde mirar, no la causa. Los umbrales son
        <strong> provisionales</strong> hasta que el Hub los acuerde. Solo se consideran los datos que su rol y zona permiten ver.
      </Alert>

      <nav aria-label="Origen de los datos" className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-700">Datos:</span>
        <Link href="/oportunidades" className={pill(!demo)} aria-current={!demo ? "true" : undefined}>Reales</Link>
        <Link href="/oportunidades?origin=demo" className={pill(demo)} aria-current={demo ? "true" : undefined}>DEMO</Link>
        <span className="ml-auto text-sm text-slate-700">Revisado el {formatSantiago(report.evaluatedAt)}</span>
      </nav>

      <p className="text-base font-semibold text-brand-900" role="status" data-testid="total-oportunidades">
        {report.total === 0
          ? "Sin casos con los datos actuales."
          : `${report.total} caso${report.total === 1 ? "" : "s"} para revisar.`}
      </p>

      {report.results.map(({ rule, evaluated, cases }) => (
        <section key={rule.id} aria-labelledby={`regla-${rule.id}`} data-testid="regla" data-rule={rule.id}>
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 id={`regla-${rule.id}`} className="text-lg font-bold text-brand-900">{rule.name}</h2>
              <div className="text-sm text-slate-700">{rule.question}</div>
            </div>
            <Badge tone={cases.length > 0 ? "demo" : "ok"} data-testid="conteo-regla">
              {cases.length === 0 ? "Sin casos" : `${cases.length} caso${cases.length === 1 ? "" : "s"}`}
            </Badge>
          </div>
          <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
            <dt className="font-semibold text-slate-800">Umbral provisional</dt>
            <dd data-testid="umbral">{rule.threshold}</dd>
            <dt className="font-semibold text-slate-800">Se revisó</dt>
            <dd>{evaluated}</dd>
          </dl>
          {cases.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {cases.map((c) => (
                <li key={c.key} className="rounded-lg border border-amber-300 bg-amber-50/60 p-3" data-testid="caso">
                  <h3 className="font-semibold text-slate-900">{c.scope}</h3>
                  <div className="mt-1 text-sm"><span className="font-semibold">Observado:</span> {c.finding}</div>
                  <div className="mt-1 text-sm"><span className="font-semibold">Sugerencia:</span> {rule.suggestion}</div>
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer font-semibold text-brand-700">
                      Ver evidencia ({c.evidenceTotal} registro{c.evidenceTotal === 1 ? "" : "s"})
                    </summary>
                    <ul className="mt-2 flex flex-wrap gap-2" data-testid="evidencia">
                      {c.evidence.map((e) => (
                        <li key={e.label}>
                          {e.href ? (
                            <Link href={e.href} className="inline-flex min-h-9 items-center rounded-md bg-white px-2 font-mono text-xs underline ring-1 ring-slate-300">
                              {e.label}
                            </Link>
                          ) : (
                            <span className="inline-flex min-h-9 items-center rounded-md bg-white px-2 text-xs ring-1 ring-slate-300">{e.label}</span>
                          )}
                        </li>
                      ))}
                      {c.evidenceTotal > c.evidence.length ? (
                        <li className="self-center text-xs text-slate-700">y {c.evidenceTotal - c.evidence.length} más</li>
                      ) : null}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3 text-sm text-slate-700" data-testid="sin-casos">Sin casos con los datos actuales.</div>
          )}
        </Card>
        </section>
      ))}

      {!demo && report.total === 0 ? (
        <div className="text-sm text-slate-700">
          ¿Quiere ver cómo se ven los casos? <Link className="font-semibold underline" href="/oportunidades?origin=demo">Revise los datos de demostración</Link> (nunca se mezclan con los reales).
        </div>
      ) : null}
    </div>
  );
}
