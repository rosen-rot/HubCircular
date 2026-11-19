import { AppShell } from "@/components/app-shell";
import { requireActor } from "@/modules/identity/guards";

// Grupo de rutas que SÍ admite sesiones con clave temporal (cambio de contraseña).
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor(undefined, { allowPasswordChange: true });
  return <AppShell actor={actor}>{children}</AppShell>;
}
