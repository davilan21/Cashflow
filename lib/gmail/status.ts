import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, GmailConexion } from "@/lib/types";
import { sinTipar } from "@/lib/supabase/queries";

export interface EstadoConexionGmail {
  conectado: boolean;
  emailConectado: string | null;
  estado: "activo" | "expirado" | "error" | null;
  ultimoSyncAt: string | null;
  ultimoError: string | null;
}

export async function obtenerEstadoConexion(
  admin: SupabaseClient<Database>,
  userId: string
): Promise<EstadoConexionGmail> {
  // sinTipar: la inferencia genérica de .select() colapsa a `never` con este
  // Database multi-tabla (mismo problema documentado en lib/supabase/queries.ts
  // para .insert()/.update()); se castea la fila al tipo conocido en su lugar.
  const { data } = await sinTipar(admin)
    .from("gmail_conexiones")
    .select("email_conectado, estado, ultimo_sync_at, ultimo_error")
    .eq("user_id", userId)
    .maybeSingle();
  const fila = data as Pick<GmailConexion, "email_conectado" | "estado" | "ultimo_sync_at" | "ultimo_error"> | null;

  if (!fila) return { conectado: false, emailConectado: null, estado: null, ultimoSyncAt: null, ultimoError: null };

  return {
    conectado: true,
    emailConectado: fila.email_conectado,
    estado: fila.estado as EstadoConexionGmail["estado"],
    ultimoSyncAt: fila.ultimo_sync_at,
    ultimoError: fila.ultimo_error,
  };
}
