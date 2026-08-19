import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listarMiembros, obtenerCuenta } from "@/lib/supabase/queries";
import { obtenerEstadoConexion } from "@/lib/gmail/status";
import { CuentaClient } from "@/components/cuenta/CuentaClient";

export default async function CuentaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [miembrosRes, cuentaRes, estadoConexionGmail] = await Promise.all([
    listarMiembros(supabase),
    obtenerCuenta(supabase),
    obtenerEstadoConexion(createAdminClient(), user.id),
  ]);

  const lecturaFallida = Boolean(miembrosRes.error || cuentaRes.error);

  return (
    <CuentaClient
      userId={user.id}
      miembros={lecturaFallida ? [] : miembrosRes.data ?? []}
      cuenta={lecturaFallida ? null : cuentaRes.data}
      lecturaFallida={lecturaFallida}
      estadoConexionGmail={estadoConexionGmail}
    />
  );
}
