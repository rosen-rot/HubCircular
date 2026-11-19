import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { getCurrentActor } from "@/modules/identity/service";
import { safeNextPath } from "@/modules/identity/permissions";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Ingresar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safe = safeNextPath(next, "/");
  if (await getCurrentActor()) redirect(safe);
  return (
    <main id="contenido" className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-4">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold text-brand-900">HubCircular</h1>
        <p className="mt-1 text-slate-700">Medir, gestionar y transformar residuos en decisiones.</p>
      </div>
      <Card>
        <h2 className="mb-4 text-xl font-semibold">Iniciar sesión</h2>
        <LoginForm next={safe} />
        <p className="mt-4 text-sm text-slate-600">
          El acceso es solo para personas autorizadas por el Hub. Si no tiene cuenta, solicítela a un administrador.
        </p>
      </Card>
    </main>
  );
}
