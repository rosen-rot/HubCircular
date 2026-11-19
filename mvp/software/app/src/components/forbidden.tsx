import Link from "next/link";
import { Alert } from "@/components/ui/card";

export function Forbidden({ what = "esta sección" }: { what?: string }) {
  return (
    <div className="space-y-3" role="alert">
      <h1 className="text-2xl font-bold text-brand-900">Acceso denegado</h1>
      <Alert tone="warning">Su rol no permite acceder a {what}. Si cree que es un error, solicite el permiso a un administrador.</Alert>
      <Link href="/" className="font-semibold text-brand-700 underline">
        Volver al inicio
      </Link>
    </div>
  );
}
