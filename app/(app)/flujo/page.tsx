import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listarCategorias, obtenerMiCuenta } from "@/lib/supabase/queries";
import { listarInstrumentos, listarReglas } from "@/lib/flujo/queries";
import { FlujoClient } from "@/components/flujo/FlujoClient";

export default async function FlujoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [reglasRes, instrumentosRes, categoriasRes, cuentaRes] = await Promise.all([
    listarReglas(supabase),
    listarInstrumentos(supabase),
    listarCategorias(supabase),
    obtenerMiCuenta(supabase, user.id),
  ]);

  // Si algo falló, no se pasan listas a medias: la pantalla entra en solo
  // lectura con un aviso, en vez de dejar creer que no hay nada configurado.
  const lecturaFallida = Boolean(reglasRes.error || instrumentosRes.error || cuentaRes.error);

  return (
    <FlujoClient
      cuentaId={lecturaFallida ? null : cuentaRes.data}
      reglasIniciales={lecturaFallida ? [] : reglasRes.data ?? []}
      instrumentosIniciales={lecturaFallida ? [] : instrumentosRes.data ?? []}
      categorias={categoriasRes.data ?? []}
      lecturaFallida={lecturaFallida}
    />
  );
}
