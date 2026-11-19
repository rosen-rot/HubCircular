import type { Metadata } from "next";
import { Alert, Card } from "@/components/ui/card";
import { authProviderName } from "@/modules/identity/auth-provider";
import { requireActor } from "@/modules/identity/guards";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Cambiar contraseña" };
export const dynamic = "force-dynamic";

export default async function CambiarClavePage() {
  const actor = await requireActor("/cuenta/clave", { allowPasswordChange: true });
  if (authProviderName() !== "local") {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <h1 className="text-2xl font-bold text-brand-900">Contraseña</h1>
        <Alert tone="info" role="note" data-testid="clave-externa">
          Su contraseña se administra en Supabase Auth, no en HubCircular. Para cambiarla use el flujo de recuperación de contraseña de Supabase
          o pida a un administrador que le envíe una invitación nueva.
        </Alert>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-bold text-brand-900">Cambiar contraseña</h1>
      {actor.mustChangePassword ? (
        <Alert tone="warning" role="status">
          Está usando una clave temporal. Defina una contraseña propia para continuar; hasta entonces no puede usar el resto de la aplicación.
        </Alert>
      ) : null}
      <Card>
        <PasswordForm />
      </Card>
      <p className="text-sm text-slate-700">Al cambiarla se cierran sus otras sesiones abiertas.</p>
    </div>
  );
}
