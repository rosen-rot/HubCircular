import { AppShell } from "@/components/app-shell";
import { requireActor } from "@/modules/identity/guards";

export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  return <AppShell actor={actor}>{children}</AppShell>;
}
