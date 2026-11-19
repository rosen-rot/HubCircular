import { redirect } from "next/navigation";
import { requireActor } from "@/modules/identity/guards";
import { can } from "@/modules/identity/permissions";

export default async function Home() {
  const actor = await requireActor();
  redirect(can(actor, "weighing:create") ? "/registro" : "/historial");
}
