import { NavTabs } from "@/components/NavTabs";
import { createClient } from "@/lib/supabase/server";
import { listarGastosPendientes } from "@/lib/supabase/queries";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pendientesCount = user ? (await listarGastosPendientes(supabase)).data?.length ?? 0 : 0;

  return (
    <main className="min-h-screen">
      <div className="max-w-xl mx-auto px-4 pt-4 pb-24">
        <NavTabs pendientesCount={pendientesCount} />
        {children}
      </div>
    </main>
  );
}
