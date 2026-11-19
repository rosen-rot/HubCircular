"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authenticate, startSession } from "@/modules/identity/service";
import { safeNextPath } from "@/modules/identity/permissions";

export interface LoginState {
  error?: string;
}

const schema = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(256),
});

const GENERIC = "No fue posible iniciar sesión. Verifique su correo y contraseña, o intente más tarde.";

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "Ingrese su correo y contraseña." };

  const result = await authenticate(parsed.data.email, parsed.data.password);
  if (!result.ok) return { error: GENERIC };

  await startSession(result.token, result.expires);
  redirect(safeNextPath(String(formData.get("next") ?? ""), "/"));
}
