import "server-only";
import { redirect } from "next/navigation";
import { getCurrentActor } from "./service";
import { can, type Permission } from "./permissions";
import type { Actor } from "./types";

/** Para páginas del servidor: exige sesión; redirige a /login conservando el destino. */
export async function requireActor(nextPath?: string): Promise<Actor> {
  const actor = await getCurrentActor();
  if (!actor) redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  return actor;
}

/** Devuelve el actor y si tiene el permiso (la página decide cómo mostrar el 403). */
export async function requireActorWith(permission: Permission, nextPath?: string): Promise<{ actor: Actor; allowed: boolean }> {
  const actor = await requireActor(nextPath);
  return { actor, allowed: can(actor, permission) };
}
