import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

/**
 * Cliente con la service role key — bypassa RLS por completo. Solo para
 * rutas de servidor que necesitan leer/escribir across cuentas (sync de
 * Gmail, cron). Nunca exponer al cliente ni usar en un Server Component
 * que renderiza datos específicos de un usuario sin filtrar manualmente.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
