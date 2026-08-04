import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listarMiembros, obtenerCuenta } from "@/lib/supabase/queries";
import { CuentaClient } from "@/components/cuenta/CuentaClient";

export default async function CuentaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [miembrosRes, cuentaRes] = await Promise.all([listarMiembros(supabase), obtenerCuenta(supabase)]);

  const lecturaFallida = Boolean(miembrosRes.error || cuentaRes.error);

  return (
    <CuentaClient
      userId={user.id}
      miembros={lecturaFallida ? [] : miembrosRes.data ?? []}
      cuenta={lecturaFallida ? null : cuentaRes.data}
      lecturaFallida={lecturaFallida}
    />
  );
}
