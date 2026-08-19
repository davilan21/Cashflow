import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listarGastosPendientes, listarCategorias } from "@/lib/supabase/queries";
import { obtenerEstadoConexion } from "@/lib/gmail/status";
import { PendientesClient } from "@/components/pendientes/PendientesClient";

export default async function PendientesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [pendientesRes, categoriasRes, estadoConexion] = await Promise.all([
    listarGastosPendientes(supabase),
    listarCategorias(supabase),
    obtenerEstadoConexion(createAdminClient(), user.id),
  ]);

  const lecturaFallida = Boolean(pendientesRes.error || categoriasRes.error);

  return (
    <PendientesClient
      pendientesIniciales={lecturaFallida ? [] : pendientesRes.data ?? []}
      categorias={lecturaFallida ? [] : categoriasRes.data ?? []}
      estadoConexion={estadoConexion}
      lecturaFallida={lecturaFallida}
    />
  );
}
