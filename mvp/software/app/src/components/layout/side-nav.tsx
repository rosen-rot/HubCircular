"use client";

import { ArrowLeftRight, CalendarCheck, ChartColumn, CircleHelp, History, House, KeyRound, Layers, Menu, Radio, Recycle, Scale, Settings, Trash2, Truck, Users, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

const ICONS = {
  inicio: House,
  registro: Scale,
  movimientos: ArrowLeftRight,
  tablero: ChartColumn,
  historial: History,
  lotes: Layers,
  calendarios: CalendarCheck,
  contenedores: Trash2,
  sensores: Radio,
  destinos: Truck,
  usuarios: Users,
  ayuda: CircleHelp,
  clave: KeyRound,
  config: Settings,
} satisfies Record<string, LucideIcon>;

export type NavIcon = keyof typeof ICONS;
export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
}

/**
 * Menú lateral. En pantallas anchas está siempre visible; en teléfonos se despliega con un botón (aria-expanded).
 * Es un solo <nav aria-label="Principal"> para lectores de pantalla en ambos casos.
 */
export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  // El menú móvil se recuerda junto con la ruta en que se abrió: al navegar deja de coincidir y se cierra solo.
  const [openedAt, setOpenedAt] = useState<string | null>(null);

  const open = openedAt === pathname;

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-5 lg:py-5">
        <Link href="/inicio" className="flex items-center gap-3 rounded-lg focus-visible:outline-white">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-emerald-300" aria-hidden="true">
            <Recycle className="h-6 w-6" />
          </span>
          <span className="leading-tight">
            <span className="block text-lg font-bold">HubCircular</span>
            <span className="block text-xs text-emerald-100/80">Gestión de residuos</span>
          </span>
        </Link>
        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/30 hover:bg-white/10 focus-visible:outline-white lg:hidden"
          aria-expanded={open}
          aria-controls="menu-principal"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          onClick={() => setOpenedAt(open ? null : pathname)}
        >
          {open ? <X className="h-6 w-6" aria-hidden="true" /> : <Menu className="h-6 w-6" aria-hidden="true" />}
        </button>
      </div>
      <nav id="menu-principal" aria-label="Principal" className={cn("px-3 pb-4 lg:block lg:flex-1 lg:overflow-y-auto", open ? "block" : "hidden")}>
        <ul className="space-y-1">
          {items.map((it) => {
            const active = pathname === it.href || pathname.startsWith(`${it.href}/`);
            const Icon = ICONS[it.icon];
            return (
              <li key={it.href}>
                <Link
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-base font-semibold focus-visible:outline-white",
                    active ? "bg-sidebar-active text-white" : "text-emerald-50 hover:bg-sidebar-hover",
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  {it.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
