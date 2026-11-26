"use client";

import { Radio } from "lucide-react";
import { useState } from "react";
import { formatKg } from "@/modules/weighing/units";

interface ApiDevice {
  code: string;
  kind: "sensor" | "simulator";
  active: boolean;
  latest: { weightG: number | null; quality: string; receivedAt: string; simulated: boolean } | null;
}

/** Lecturas más antiguas que esto no se ofrecen para precargar el formulario. */
const MAX_AGE_S = 120;

/**
 * Trae la última lectura ESTABLE de la balanza del contenedor y la entrega al formulario como peso bruto.
 * No registra nada: la persona revisa el valor y confirma el pesaje (la telemetría nunca crea captaciones).
 */
export function SensorWeightButton({ containerCode, onWeight }: { containerCode: string; onWeight: (grams: number, note: string) => void }) {
  const [msg, setMsg] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function read() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/iot/v1/containers/${encodeURIComponent(containerCode)}/latest`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { devices: ApiDevice[]; serverTime: string };
      const now = new Date(data.serverTime).getTime();
      const candidates = data.devices
        .filter((d) => d.active && d.latest?.weightG != null)
        .map((d) => ({ d, r: d.latest!, age: (now - new Date(d.latest!.receivedAt).getTime()) / 1000 }))
        .sort((a, b) => a.age - b.age);
      if (data.devices.length === 0) {
        setMsg({ tone: "warn", text: "Este contenedor no tiene una balanza conectada. Ingrese el peso a mano." });
        return;
      }
      const best = candidates[0];
      if (!best || best.age > MAX_AGE_S) {
        setMsg({ tone: "warn", text: "La balanza no ha enviado lecturas recientes (más de 2 min). Revise que el ESP32 esté encendido y con Wi-Fi." });
        return;
      }
      if (best.r.quality !== "stable") {
        setMsg({ tone: "warn", text: `La última lectura no es estable (${best.r.quality === "uncalibrated" ? "balanza sin calibrar" : "el peso se está moviendo"}). Espere unos segundos y vuelva a intentar.` });
        return;
      }
      const sim = best.r.simulated || best.d.kind === "simulator";
      onWeight(best.r.weightG!, `${best.d.code}${sim ? " (SIMULADOR)" : ""}`);
      setMsg({ tone: "ok", text: `Peso bruto cargado desde ${best.d.code}${sim ? " — SIMULADOR, no es una medición real" : ""}: ${formatKg(best.r.weightG!)} (hace ${Math.round(best.age)} s). Revíselo antes de confirmar.` });
    } catch {
      setMsg({ tone: "warn", text: "No se pudo consultar la balanza. Ingrese el peso a mano." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={read}
        disabled={busy || !containerCode}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-brand-600 px-4 font-semibold text-brand-800 hover:bg-brand-50 disabled:opacity-60"
      >
        <Radio className="h-5 w-5" aria-hidden="true" />
        {busy ? "Leyendo balanza…" : "Leer peso de la balanza"}
      </button>
      <p aria-live="polite" className={msg?.tone === "warn" ? "text-sm text-amber-900" : "text-sm text-brand-900"}>
        {msg?.text ?? ""}
      </p>
    </div>
  );
}
