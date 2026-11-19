import { startFakeGoTrue } from "../helpers/fake-gotrue";

/** Proceso aparte para las pruebas E2E del modo Supabase Auth (servidor SIMULADO, no Supabase real). */
const PORT = 54399;
(async () => {
  const g = await startFakeGoTrue("sb_publishable_FAKE_KEY_FOR_TESTS", { port: PORT, control: true });
  g.add("admin@demo.hubcircular.test", "Admin-supabase-Passw0rd!");
  g.add("operador@demo.hubcircular.test", "Operador-supabase-Passw0rd!");
  g.add("lector@demo.hubcircular.test", "Lector-supabase-Passw0rd!", false); // correo sin confirmar
  console.log(`GoTrue simulado en ${g.url}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
