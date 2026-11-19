import { redirect } from "next/navigation";
import { endSession } from "@/modules/identity/service";
import { can, roleLabel } from "@/modules/identity/permissions";
import type { Actor } from "@/modules/identity/types";
import { NavLinks, type NavItem } from "./nav-links";

async function logout() {
  "use server";
  await endSession();
  redirect("/login");
}

export function AppShell({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  const items: NavItem[] = [];
  if (can(actor, "weighing:create")) items.push({ href: "/registro", label: "Registro" });
  if (can(actor, "movement:create")) items.push({ href: "/retiros", label: "Movimientos" });
  if (can(actor, "weighing:read")) items.push({ href: "/historial", label: "Historial" });
  if (can(actor, "catalog:read")) items.push({ href: "/contenedores", label: "Contenedores" });
  if (can(actor, "destination:manage")) items.push({ href: "/destinos", label: "Destinos" });
  const roles = [...new Set(actor.roles.map((r) => roleLabel(r.role)))].join(", ");

  return (
    <>
      <header className="bg-brand-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center justify-between gap-4 md:justify-start">
            <span className="text-lg font-bold">HubCircular</span>
            <form action={logout} className="md:hidden">
              <button className="min-h-9 rounded-lg px-3 text-sm font-semibold text-brand-100 underline">Salir</button>
            </form>
          </div>
          <NavLinks items={items} />
          <div className="hidden items-center gap-3 text-sm md:flex">
            <span>
              {actor.displayName} · <span className="text-brand-200">{roles}</span>
            </span>
            <form action={logout}>
              <button className="min-h-9 rounded-lg border border-brand-200 px-3 font-semibold hover:bg-brand-700">Salir</button>
            </form>
          </div>
        </div>
        <p className="mx-auto max-w-6xl px-4 pb-2 text-xs text-brand-200 md:hidden">
          {actor.displayName} · {roles}
        </p>
      </header>
      <main id="contenido" className="mx-auto max-w-6xl px-4 py-6">
        {children}
      </main>
    </>
  );
}
