import Link from "next/link";

export default function NotFound() {
  return (
    <main id="contenido" className="mx-auto max-w-lg p-8 text-center">
      <h1 className="text-2xl font-bold text-brand-900">No encontrado</h1>
      <p className="mt-2 text-slate-700">El recurso no existe o no tiene permiso para verlo.</p>
      <Link href="/" className="mt-4 inline-block font-semibold text-brand-700 underline">
        Volver al inicio
      </Link>
    </main>
  );
}
