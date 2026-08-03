import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listarGastos, listarCategorias, obtenerSettings } from "@/lib/supabase/queries";
import { HistorialClient } from "@/components/historial/HistorialClient";

export default async function HistorialPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [gastosRes, categoriasRes, settingsRes] = await Promise.all([
    listarGastos(supabase, user.id),
    listarCategorias(supabase),
    obtenerSettings(supabase, user.id),
  ]);

  const lecturaFallida = Boolean(gastosRes.error || categoriasRes.error || settingsRes.error);

  return (
    <HistorialClient
      userId={user.id}
      gastosIniciales={lecturaFallida ? [] : gastosRes.data ?? []}
      categorias={lecturaFallida ? [] : categoriasRes.data ?? []}
      settingsIniciales={
        lecturaFallida || !settingsRes.data
          ? { user_id: user.id, tope_ciclo: 4_000_000, tope_quincena: 2_000_000, dia_corte: 15, dia_pago: 30, updated_at: "" }
          : settingsRes.data
      }
      lecturaFallida={lecturaFallida}
    />
  );
}
