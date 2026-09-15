import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listarGastos, listarMiembros, obtenerMiCuenta } from "@/lib/supabase/queries";
import { listarAjustes, listarRubros } from "@/lib/plan/queries";
import { calcularPlan } from "@/lib/plan/calculo";
import { listarInstrumentos, listarMovimientos, listarTrm, listarValoraciones } from "@/lib/ahorros/queries";
import { hoyISO } from "@/lib/ciclo";
import { AhorrosClient } from "@/components/ahorros/AhorrosClient";

export default async function AhorrosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [cuentaRes, instRes, movRes, valRes, trmRes, miembrosRes, rubrosRes, ajustesRes, gastosRes] = await Promise.all([
    obtenerMiCuenta(supabase, user.id),
    listarInstrumentos(supabase),
    listarMovimientos(supabase),
    listarValoraciones(supabase),
    listarTrm(supabase),
    listarMiembros(supabase),
    listarRubros(supabase),
    listarAjustes(supabase),
    listarGastos(supabase),
  ]);

  const cuentaId = cuentaRes.data;
  const lecturaFallida = Boolean(
    cuentaRes.error || !cuentaId || instRes.error || movRes.error || valRes.error || trmRes.error ||
      miembrosRes.error || rubrosRes.error || ajustesRes.error || gastosRes.error
  );

  const plan = lecturaFallida
    ? []
    : calcularPlan({ rubros: rubrosRes.data ?? [], ajustes: ajustesRes.data ?? [], gastos: gastosRes.data ?? [], hoy: hoyISO() });

  return (
    <AhorrosClient
      cuentaId={cuentaId ?? ""}
      userId={user.id}
      instrumentosIniciales={lecturaFallida ? [] : instRes.data ?? []}
      movimientosIniciales={lecturaFallida ? [] : movRes.data ?? []}
      valoracionesIniciales={lecturaFallida ? [] : valRes.data ?? []}
      trmIniciales={lecturaFallida ? [] : trmRes.data ?? []}
      miembros={lecturaFallida ? [] : miembrosRes.data ?? []}
      plan={plan}
      lecturaFallida={lecturaFallida}
    />
  );
}
