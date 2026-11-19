export type AppRole = "administrador" | "operador" | "lector";

export interface RoleGrant {
  role: AppRole;
  /** null = todas las zonas */
  zoneId: string | null;
}

export interface Actor {
  userId: string;
  email: string;
  displayName: string;
  roles: RoleGrant[];
}
