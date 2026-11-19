import { redirect } from "next/navigation";
import { SearchBox } from "@/components/layout/search-box";
import { SideNav, type NavItem } from "@/components/layout/side-nav";
import { authProviderName } from "@/modules/identity/auth-provider";
import { endSession } from "@/modules/identity/service";
import { can, roleLabel } from "@/modules/identity/permissions";
import type { Actor } from "@/modules/identity/types";

async function logout() {
  "use server";
  await endSession();
  redirect("/login");
}

export function AppShell({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  const items: NavItem[] = [{ href: "/inicio", label: "Inicio", icon: "inicio" }];
  if (can(actor, "weighing:create")) items.push({ href: "/registro", label: "Registro", icon: "registro" });
  if (can(actor, "batch:read")) items.push({ href: "/lotes", label: "Lotes", icon: "lotes" });
  if (can(actor, "movement:read")) items.push({ href: "/movimientos", label: "Movimientos", icon: "movimientos" });
  if (can(actor, "indicators:read")) items.push({ href: "/dashboard", label: "Tablero", icon: "tablero" });
  if (can(actor, "weighing:read")) items.push({ href: "/historial", label: "Historial", icon: "historial" });
  if (can(actor, "measurement:zero")) items.push({ href: "/calendarios", label: "Calendarios", icon: "calendarios" });
  if (can(actor, "catalog:read")) items.push({ href: "/contenedores", label: "Contenedores", icon: "contenedores" });
  if (can(actor, "destination:manage")) items.push({ href: "/destinos", label: "Destinos", icon: "destinos" });
  if (can(actor, "user:manage")) items.push({ href: "/usuarios", label: "Usuarios", icon: "usuarios" });
  items.push({ href: "/ayuda", label: "Ayuda", icon: "ayuda" });
  if (can(actor, "account:password") && authProviderName() === "local") items.push({ href: "/cuenta/clave", label: "Mi contraseña", icon: "clave" });
  const roles = [...new Set(actor.roles.map((r) => roleLabel(r.role)))].join(", ");
  const initials = actor.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  return (
    <div className="lg:grid lg:min-h-screen lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="bg-sidebar text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <SideNav items={items} />
        <p className="mt-auto hidden px-5 pb-5 text-xs text-emerald-100/80 lg:block">Medir, gestionar y transformar residuos en decisiones.</p>
      </aside>
      <div className="min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:px-8">
          {can(actor, "weighing:read") ? <SearchBox /> : <span />}
          <div className="flex items-center gap-3 text-sm">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-900" aria-hidden="true">
              {initials || "?"}
            </span>
            <span className="leading-tight">
              <span className="block font-semibold text-slate-900">{actor.displayName}</span>
              <span className="block text-slate-600">{roles}</span>
            </span>
            <form action={logout}>
              <button className="min-h-10 rounded-lg border border-slate-300 px-3 font-semibold text-slate-800 hover:bg-slate-50">Salir</button>
            </form>
          </div>
        </header>
        <main id="contenido" className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
