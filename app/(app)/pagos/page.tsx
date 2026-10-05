import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { obtenerMiCuenta } from "@/lib/supabase/queries";
import { listarAjustes, listarRubros } from "@/lib/plan/queries";
import { listarPagos } from "@/lib/pagos/queries";
import { PagosClient } from "@/components/pagos/PagosClient";

export default async function PagosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [cuentaRes, rubrosRes, ajustesRes, pagosRes] = await Promise.all([
    obtenerMiCuenta(supabase, user.id),
    listarRubros(supabase),
    listarAjustes(supabase),
    listarPagos(supabase),
  ]);

  const cuentaId = cuentaRes.data;
  const lecturaFallida = Boolean(cuentaRes.error || !cuentaId || rubrosRes.error || ajustesRes.error || pagosRes.error);

  return (
    <div className="max-w-xl mx-auto">
      <PagosClient
        cuentaId={cuentaId ?? ""}
        rubros={lecturaFallida ? [] : rubrosRes.data ?? []}
        ajustes={lecturaFallida ? [] : ajustesRes.data ?? []}
        pagosIniciales={lecturaFallida ? [] : pagosRes.data ?? []}
        lecturaFallida={lecturaFallida}
      />
    </div>
  );
}
