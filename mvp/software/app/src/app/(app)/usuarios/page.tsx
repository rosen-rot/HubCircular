import type { Metadata } from "next";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/forbidden";
import { Alert, Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { messageForCode } from "@/lib/errors";
import { formatSantiago } from "@/lib/time";
import { authProviderName } from "@/modules/identity/auth-provider";
import { requireActorWith } from "@/modules/identity/guards";
import { listActiveZones } from "@/modules/movements/queries";
import { ROLES } from "@/modules/users/schema";
import { listUsers } from "@/modules/users/queries";
import { addRoleAction, removeRoleAction, toggleActiveAction } from "./actions";
import { CreateUserForm, ResetPasswordForm } from "./user-forms";

export const metadata: Metadata = { title: "Usuarios" };
export const dynamic = "force-dynamic";

const ROLE_LABEL = { administrador: "Administrador", operador: "Operador", lector: "Lector" } as const;
const OK_MSG: Record<string, string> = {
  activado: "Usuario activado.",
  desactivado: "Usuario desactivado; sus sesiones se cerraron.",
  rol_agregado: "Rol agregado.",
  rol_quitado: "Rol quitado.",
};

export default async function UsuariosPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const sp = await searchParams;
  const { actor, allowed } = await requireActorWith("user:manage", "/usuarios");
  if (!allowed) return <Forbidden what="la administración de usuarios" />;
  const external = authProviderName() !== "local";
  const users = await listUsers(actor);
  const zones = await listActiveZones(actor);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader icon={Users} title={'Usuarios'} subtitle={<>{external
            ? "Alta, roles y zonas y activación. Las contraseñas se administran en Supabase Auth; cada cambio queda auditado."
            : "Alta, roles y zonas, activación y restablecimiento de contraseña. Las claves nunca se muestran después de entregarse; cada cambio queda auditado."}</>} />
      {external ? (
        <Alert tone="info" role="note" data-testid="modo-supabase">
          Modo Supabase Auth: las personas ingresan con su cuenta de Supabase y HubCircular decide sus permisos. Desactivar un perfil cierra sus
          sesiones y le impide volver a entrar aunque su cuenta de Supabase siga existiendo.
        </Alert>
      ) : null}
      {sp.error ? <Alert tone="error" role="alert">{messageForCode(sp.error)}</Alert> : null}
      {sp.ok && OK_MSG[sp.ok] ? <Alert tone="success" role="status">{OK_MSG[sp.ok]}</Alert> : null}

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Nuevo usuario</h2>
        <CreateUserForm zones={zones} />
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Usuarios registrados ({users.length})</h2>
        <ul className="space-y-4">
          {users.map((u) => {
            const self = u.userId === actor.userId;
            return (
              <li key={u.userId} className="rounded-lg border border-slate-200 p-3" data-testid="usuario">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{u.displayName}</span>
                  <span className="text-sm text-slate-700">{u.email}</span>
                  {self ? <Badge>Usted</Badge> : null}
                  {u.active ? <Badge tone="ok">Activo</Badge> : <Badge>Inactivo</Badge>}
                  {u.mustChangePassword ? <Badge tone="demo">Debe cambiar la clave</Badge> : null}
                  {u.lockedUntil ? <Badge tone="warn">Bloqueado hasta {formatSantiago(u.lockedUntil)}</Badge> : null}
                </div>
                <p className="text-sm text-slate-700">Último ingreso: {u.lastLoginAt ? formatSantiago(u.lastLoginAt) : "nunca"}</p>

                <ul className="mt-2 space-y-1 text-sm">
                  {u.roles.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2">
                      <span>{ROLE_LABEL[r.role]} — {r.zoneName ?? "todas las zonas"}</span>
                      <form action={removeRoleAction}>
                        <input type="hidden" name="roleId" value={r.id} />
                        <Button type="submit" variant="ghost" size="sm" aria-label={`Quitar rol ${ROLE_LABEL[r.role]} (${r.zoneName ?? "todas las zonas"}) a ${u.displayName}`}>
                          Quitar
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>

                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-semibold text-brand-700">Agregar rol…</summary>
                  <form action={addRoleAction} className="mt-2 grid gap-3 sm:grid-cols-3 sm:items-end">
                    <input type="hidden" name="userId" value={u.userId} />
                    <Field id={`ar-role-${u.userId}`} label="Rol">
                      <Select id={`ar-role-${u.userId}`} name="role" defaultValue="lector">
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field id={`ar-zone-${u.userId}`} label="Zona" help="ambito">
                      <Select id={`ar-zone-${u.userId}`} name="zoneId" defaultValue="">
                        <option value="">Todas las zonas</option>
                        {zones.map((z) => (
                          <option key={z.id} value={z.id}>{z.name}</option>
                        ))}
                      </Select>
                    </Field>
                    <Button type="submit" variant="outline" size="sm" aria-label={`Agregar rol a ${u.displayName}`}>Agregar</Button>
                  </form>
                </details>

                <div className="mt-2 flex flex-wrap items-start gap-3">
                  {!self ? (
                    <form action={toggleActiveAction}>
                      <input type="hidden" name="userId" value={u.userId} />
                      <input type="hidden" name="active" value={u.active ? "false" : "true"} />
                      <Button type="submit" variant="outline" size="sm" aria-label={`${u.active ? "Desactivar" : "Activar"} a ${u.displayName}`}>
                        {u.active ? "Desactivar" : "Activar"}
                      </Button>
                    </form>
                  ) : null}
                  {!self && !external ? <ResetPasswordForm userId={u.userId} email={u.email} name={u.displayName} /> : null}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
