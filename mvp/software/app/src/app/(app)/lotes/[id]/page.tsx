import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InfoTip, Term } from "@/components/help/info-tip";
import { MOVEMENT_TIP } from "@/lib/glossary";
import { Alert, Badge, Card, DemoBadge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatSantiago } from "@/lib/time";
import { requireActor } from "@/modules/identity/guards";
import { can } from "@/modules/identity/permissions";
import { getBatchDetail } from "@/modules/inventory/queries";
import { listBatchMovements, valorizationStatus, type MovementItem } from "@/modules/movements/queries";
import { DESTINATION_LABEL, EVIDENCE_LABEL, MOVEMENT_LABEL } from "@/modules/movements/schema";
import { formatBatchRef, formatMovementRef, formatWeighingRef } from "@/modules/weighing/refs";
import { formatGrams, formatKg } from "@/modules/weighing/units";
import { CorrectForm, EvidenceForm, VerifyForm } from "./movement-panels";

export const metadata: Metadata = { title: "Lote" };
export const dynamic = "force-dynamic";

const STATUS_LABEL = {
  pendiente_evidencia: { tone: "warn" as const, text: "Pendiente: sin evidencia" },
  pendiente_verificacion: { tone: "neutral" as const, text: "Pendiente de verificación" },
  confirmada: { tone: "ok" as const, text: "Valorización confirmada" },
  rechazada: { tone: "warn" as const, text: "Verificación rechazada" },
  corregido: { tone: "neutral" as const, text: "Corregido" },
};

function route(m: MovementItem): string {
  if (m.type === "traslado") return `${m.fromZone ?? "—"} → ${m.toZone ?? "—"}`;
  if (m.type === "ajuste" || m.type === "correccion") {
    if (m.fromZone && m.toZone) return `${m.fromZone} → ${m.toZone}`;
    return m.fromZone ? `Sale de ${m.fromZone}` : `Entra a ${m.toZone ?? "—"}`;
  }
  const dest = m.destinationName ? ` → ${m.destinationName}${m.destinationType ? ` (${DESTINATION_LABEL[m.destinationType]})` : ""}` : "";
  return `${m.fromZone ?? "—"}${dest}`;
}

export default async function LotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ movimiento?: string; duplicado?: string; correccion?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const actor = await requireActor(`/lotes/${id}`);
  const b = can(actor, "batch:read") ? await getBatchDetail(actor, id) : null;
  if (!b) notFound();
  const movements = can(actor, "movement:read") ? await listBatchMovements(actor, id) : [];
  const canMove = can(actor, "movement:create") && b.totalBalanceG > 0;
  const canEvidence = can(actor, "evidence:add");
  const canVerify = can(actor, "verification:decide");
  const canCorrect = can(actor, "movement:correct");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-brand-900">Lote {formatBatchRef(b.refNo)}</h1>
        {b.dataOrigin === "demo" ? <DemoBadge /> : null}
      </div>
      {sp.movimiento ? <Alert tone="success" role="status">Movimiento registrado. El saldo del lote ya está actualizado.</Alert> : null}
      {sp.correccion ? <Alert tone="success" role="status">Corrección registrada: el saldo se restituyó con un movimiento nuevo; el original se conserva.</Alert> : null}
      {sp.duplicado ? <Alert tone="info" role="status">Este envío ya estaba registrado; se muestra el movimiento original (no se duplicó).</Alert> : null}

      <Card>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div><dt className="text-sm font-semibold text-slate-700">Material<InfoTip k="material" /></dt><dd>{b.materialName}</dd></div>
          <div><dt className="text-sm font-semibold text-slate-700">Zona de origen<InfoTip k="zona" /></dt><dd>{b.originZoneName ?? "—"}</dd></div>
          <div><dt className="text-sm font-semibold text-slate-700">Captación inicial (no cambia)<InfoTip k="captacion" /></dt><dd className="font-semibold">{formatKg(b.initialG)} ({formatGrams(b.initialG)})</dd></div>
          <div><dt className="text-sm font-semibold text-slate-700">Saldo disponible<InfoTip k="saldo" /></dt><dd className="font-semibold" data-testid="saldo-total">{formatKg(b.totalBalanceG)} ({formatGrams(b.totalBalanceG)})</dd></div>
          <div><dt className="text-sm font-semibold text-slate-700">Creado</dt><dd>{formatSantiago(b.createdAt)}</dd></div>
          <div><dt className="text-sm font-semibold text-slate-700">Pesaje de origen<InfoTip k="pesaje" /></dt><dd><Link className="font-mono text-brand-700 underline" href={`/pesajes/${b.weighingId}`}>{formatWeighingRef(b.weighingRef)}</Link></dd></div>
        </dl>
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-semibold">
          <Term k="saldo">Saldo por ubicación</Term>
        </h2>
        <table className="w-full text-left text-sm">
          <thead className="text-slate-700"><tr><th scope="col" className="py-1">Ubicación (zona)</th><th scope="col" className="py-1 text-right">Saldo</th></tr></thead>
          <tbody className="divide-y divide-slate-200">
            {b.balances.map((x) => (
              <tr key={x.zoneId}><td className="py-2">{x.zoneName ?? "—"}</td><td className="py-2 text-right tabular-nums">{formatKg(x.balanceG)}</td></tr>
            ))}
          </tbody>
        </table>
        {canMove ? (
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link href={`/retiros?lote=${b.id}`}>Registrar movimiento</Link>
          </Button>
        ) : null}
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-semibold">
          <Term k="movimiento">Trazabilidad: movimientos</Term>
        </h2>
        {movements.length === 0 ? (
          <p className="text-slate-700">Este lote aún no tiene movimientos; todo su saldo sigue donde se captó.</p>
        ) : (
          <ol className="space-y-3">
            {movements.map((m) => {
              const st = valorizationStatus(m);
              const label = formatMovementRef(m.refNo);
              const corrected = m.correctedByRef !== null;
              return (
                <li key={m.id} className="rounded-lg border border-slate-200 p-3" data-testid="movimiento">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-semibold">{label}</span>
                    <Badge>{MOVEMENT_LABEL[m.type]}</Badge>
                    <InfoTip k={MOVEMENT_TIP[m.type]} className="-ml-1" />
                    <span className="font-semibold tabular-nums">{formatKg(m.quantityG)}</span>
                    {st ? (
                      <>
                        <Badge tone={STATUS_LABEL[st].tone}>{STATUS_LABEL[st].text}</Badge>
                        <InfoTip k={st === "confirmada" ? "valorizacion" : st === "corregido" ? "correccion" : "sin_decision"} className="-ml-1" />
                      </>
                    ) : null}
                    {corrected ? <Badge>Corregido por {formatMovementRef(m.correctedByRef!)}</Badge> : null}
                    {m.correctsRef !== null ? <Badge>Corrige {formatMovementRef(m.correctsRef)}</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm">{route(m)}</p>
                  <p className="text-sm text-slate-700">
                    {formatSantiago(m.occurredAt)} · {m.createdByName}
                  </p>
                  {m.reason ? <p className="mt-1 text-sm"><span className="font-semibold">Motivo/observación:</span> {m.reason}</p> : null}

                  {m.type === "despacho" ? (
                    <div className="mt-2 text-sm">
                      <div className="font-semibold">
                        Evidencia ({m.evidence.length})<InfoTip k="evidencia" />
                      </div>
                      {m.evidence.length === 0 ? (
                        <p className="text-slate-700">Sin evidencia registrada. Un despacho sin evidencia no se declara valorizado.</p>
                      ) : (
                        <ul className="list-disc pl-5">
                          {m.evidence.map((e) => (
                            <li key={e.id}>
                              {EVIDENCE_LABEL[e.kind]}: <span className="font-mono">{e.reference}</span>
                              {e.note ? ` — ${e.note}` : ""} <span className="text-slate-600">({e.createdByName}, {formatSantiago(e.createdAt)})</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {m.verifications.length > 0 ? (
                        <>
                          <div className="mt-2 font-semibold">
                            Historial de verificación<InfoTip k="valorizacion" />
                          </div>
                          <ul className="list-disc pl-5">
                            {m.verifications.map((v) => (
                              <li key={v.id}>
                                {v.status === "confirmada" ? "Confirmada" : "Rechazada"} por {v.decidedByName} el {formatSantiago(v.decidedAt)}
                                {v.notes ? ` — ${v.notes}` : ""}
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                      {!corrected && canEvidence ? <EvidenceForm batchId={b.id} movementId={m.id} refLabel={label} /> : null}
                      {!corrected && canVerify ? <VerifyForm batchId={b.id} movementId={m.id} refLabel={label} hasEvidence={m.evidence.length > 0} /> : null}
                    </div>
                  ) : null}

                  {canCorrect && m.type !== "correccion" && !corrected ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm font-semibold text-brand-700">Corregir (deshacer este movimiento)…</summary>
                      <CorrectForm batchId={b.id} movementId={m.id} refLabel={label} idempotencyKey={randomUUID()} />
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      <Link href="/historial" className="inline-block font-semibold text-brand-700 underline">← Volver al historial</Link>
    </div>
  );
}
