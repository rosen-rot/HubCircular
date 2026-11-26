"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Vuelve a pedir la página al servidor cada `seconds` mientras la pestaña está visible (panel en vivo). */
export function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  const [on, setOn] = useState(true);

  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => window.clearInterval(id);
  }, [on, seconds, router]);

  return (
    <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-800">
      <input type="checkbox" className="h-5 w-5" checked={on} onChange={(e) => setOn(e.target.checked)} />
      Actualizar automáticamente cada {seconds} s
    </label>
  );
}
