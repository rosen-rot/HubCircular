import { redirect } from "next/navigation";
import { requireActor } from "@/modules/identity/guards";

/** Entrada de la aplicación: todos los roles aterrizan en el Inicio. */
export default async function Home() {
  await requireActor();
  redirect("/inicio");
}
