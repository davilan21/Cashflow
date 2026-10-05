import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listarGastos, obtenerMiCuenta } from "@/lib/supabase/queries";
import { listarAjustes, listarRubros } from "@/lib/plan/queries";
import { listarPagos } from "@/lib/pagos/queries";
import { PlanClient } from "@/components/plan/PlanClient";

export default async function PlanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [cuentaRes, rubrosRes, ajustesRes, gastosRes, pagosRes] = await Promise.all([
    obtenerMiCuenta(supabase, user.id),
    listarRubros(supabase),
    listarAjustes(supabase),
    listarGastos(supabase),
    listarPagos(supabase),
  ]);

  const cuentaId = cuentaRes.data;
  const lecturaFallida = Boolean(cuentaRes.error || !cuentaId || rubrosRes.error || ajustesRes.error || gastosRes.error || pagosRes.error);

  return (
    <div className="max-w-xl mx-auto">
      <PlanClient
        cuentaId={cuentaId ?? ""}
        rubrosIniciales={lecturaFallida ? [] : rubrosRes.data ?? []}
        ajustesIniciales={lecturaFallida ? [] : ajustesRes.data ?? []}
        gastos={lecturaFallida ? [] : gastosRes.data ?? []}
        pagos={lecturaFallida ? [] : pagosRes.data ?? []}
        lecturaFallida={lecturaFallida}
      />
    </div>
  );
}
