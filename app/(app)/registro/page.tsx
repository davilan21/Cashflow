import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listarGastos, listarCategorias, obtenerSettings } from "@/lib/supabase/queries";
import { RegistroClient } from "@/components/registro/RegistroClient";

export default async function RegistroPage() {
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

  // Nunca asumir "base vacía" ante un error de lectura: si algo falló,
  // la pantalla entra en modo de solo lectura y ofrece reintentar.
  const lecturaFallida = Boolean(gastosRes.error || categoriasRes.error || settingsRes.error);

  return (
    <Suspense>
      <RegistroClient
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
    </Suspense>
  );
}
