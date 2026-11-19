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
  /** Clave temporal: hasta cambiarla, la sesión no puede usar ninguna función de la aplicación. */
  mustChangePassword?: boolean;
}
