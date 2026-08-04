import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listarGastos, listarCategorias, obtenerSettings, obtenerMiCuenta, listarMiembros } from "@/lib/supabase/queries";
import { HistorialClient } from "@/components/historial/HistorialClient";

export default async function HistorialPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [cuentaRes, gastosRes, categoriasRes, settingsRes, miembrosRes] = await Promise.all([
    obtenerMiCuenta(supabase, user.id),
    listarGastos(supabase),
    listarCategorias(supabase),
    obtenerSettings(supabase),
    listarMiembros(supabase),
  ]);

  const cuentaId = cuentaRes.data;
  const lecturaFallida = Boolean(
    cuentaRes.error || !cuentaId || gastosRes.error || categoriasRes.error || settingsRes.error || miembrosRes.error
  );
  const esCompartida = (miembrosRes.data ?? []).length >= 2;

  return (
    <HistorialClient
      cuentaId={cuentaId ?? ""}
      gastosIniciales={lecturaFallida ? [] : gastosRes.data ?? []}
      categorias={lecturaFallida ? [] : categoriasRes.data ?? []}
      settingsIniciales={
        lecturaFallida || !settingsRes.data
          ? { cuenta_id: cuentaId ?? "", tope_ciclo: 4_000_000, tope_quincena: 2_000_000, dia_corte: 15, dia_pago: 30, updated_at: "" }
          : settingsRes.data
      }
      esCompartida={esCompartida}
      lecturaFallida={lecturaFallida}
    />
  );
}
