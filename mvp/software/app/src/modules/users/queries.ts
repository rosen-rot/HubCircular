import "server-only";
import { withActor } from "@/lib/db";
import type { Actor, AppRole } from "@/modules/identity/types";

export interface UserItem {
  userId: string;
  email: string;
  displayName: string;
  active: boolean;
  mustChangePassword: boolean;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  roles: { id: string; role: AppRole; zoneId: string | null; zoneName: string | null }[];
}

export async function listUsers(actor: Actor): Promise<UserItem[]> {
  return withActor(
    actor.userId,
    async (db) => {
      const { rows } = await db.query<{
        user_id: string;
        email: string;
        display_name: string;
        active: boolean;
        must_change_password: boolean;
        locked_until: Date | null;
        last_login_at: Date | null;
        roles: UserItem["roles"];
      }>("select * from hc.admin_list_users($1)", [actor.userId]);
      return rows.map((r) => ({
        userId: r.user_id,
        email: r.email,
        displayName: r.display_name,
        active: r.active,
        mustChangePassword: r.must_change_password,
        lockedUntil: r.locked_until,
        lastLoginAt: r.last_login_at,
        roles: r.roles,
      }));
    },
    { readOnly: true },
  );
}
