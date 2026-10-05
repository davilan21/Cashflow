import { NavTabs } from "@/components/NavTabs";
import { createClient } from "@/lib/supabase/server";
import { listarGastosPendientes } from "@/lib/supabase/queries";
import { listarAjustes, listarRubros } from "@/lib/plan/queries";
import { listarPagos } from "@/lib/pagos/queries";
import { contadorPagos, itemsPagos } from "@/lib/pagos/estado";
import { hoyISO } from "@/lib/ciclo";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let pendientesCount = 0;
  let pagosCount = 0;
  if (user) {
    const [pend, rubros, ajustes, pagos] = await Promise.all([
      listarGastosPendientes(supabase),
      listarRubros(supabase),
      listarAjustes(supabase),
      listarPagos(supabase),
    ]);
    pendientesCount = pend.data?.length ?? 0;
    if (rubros.error || ajustes.error || pagos.error) {
      // Sin contador antes que uno falso; /pagos muestra el error con Banner.
      console.error("layout: no se pudo calcular el contador de pagos", rubros.error ?? ajustes.error ?? pagos.error);
    } else {
      pagosCount = contadorPagos(itemsPagos(rubros.data ?? [], ajustes.data ?? [], pagos.data ?? [], hoyISO()));
    }
  }

  return (
    <main className="min-h-screen">
      <div className="max-w-xl lg:max-w-4xl mx-auto px-4 pt-4 pb-24">
        <NavTabs pendientesCount={pendientesCount} pagosCount={pagosCount} />
        {children}
      </div>
    </main>
  );
}
