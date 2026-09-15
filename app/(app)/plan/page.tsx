import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listarGastos, obtenerMiCuenta } from "@/lib/supabase/queries";
import { listarAjustes, listarRubros } from "@/lib/plan/queries";
import { PlanClient } from "@/components/plan/PlanClient";

export default async function PlanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [cuentaRes, rubrosRes, ajustesRes, gastosRes] = await Promise.all([
    obtenerMiCuenta(supabase, user.id),
    listarRubros(supabase),
    listarAjustes(supabase),
    listarGastos(supabase),
  ]);

  const cuentaId = cuentaRes.data;
  const lecturaFallida = Boolean(cuentaRes.error || !cuentaId || rubrosRes.error || ajustesRes.error || gastosRes.error);

  return (
    <PlanClient
      cuentaId={cuentaId ?? ""}
      rubrosIniciales={lecturaFallida ? [] : rubrosRes.data ?? []}
      ajustesIniciales={lecturaFallida ? [] : ajustesRes.data ?? []}
      gastos={lecturaFallida ? [] : gastosRes.data ?? []}
      lecturaFallida={lecturaFallida}
    />
  );
}
