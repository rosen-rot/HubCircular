"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="contenido" className="mx-auto max-w-lg p-8 text-center" role="alert">
      <h1 className="text-2xl font-bold text-red-900">Algo salió mal</h1>
      <p className="mt-2 text-slate-700">
        No pudimos completar la operación. Sus datos no se perdieron si ya vio una confirmación. Intente nuevamente.
      </p>
      <button onClick={reset} className="mt-4 min-h-11 rounded-lg bg-brand-600 px-4 font-semibold text-white">
        Reintentar
      </button>
    </main>
  );
}
