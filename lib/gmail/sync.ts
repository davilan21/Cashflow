import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, GmailConexion, Miembro } from "@/lib/types";
import { sinTipar } from "@/lib/supabase/queries";
import { refrescarToken } from "./oauth";
import { listarIdsMensajes, obtenerMensaje } from "./gmailApi";
import { extraerTextoPlano, parsearNotificacionConClaude, parsearNotificacionLocal } from "./parse";

const REMITENTE_BANCOLOMBIA = "alertasynotificaciones@bancolombia.com.co";
const DIAS_BACKFILL = 30;

/** Punto de corte para buscar correos: la última sync, o N días atrás si nunca ha sincronizado. */
export function calcularDesde(ultimoSyncAt: string | null, diasBackfill: number, ahora: Date = new Date()): Date {
  if (!ultimoSyncAt) return new Date(ahora.getTime() - diasBackfill * 24 * 60 * 60 * 1000);
  return new Date(ultimoSyncAt);
}

async function parsearNotificacion(texto: string) {
  return (await parsearNotificacionConClaude(texto)) ?? parsearNotificacionLocal(texto);
}

export async function sincronizarGmail(
  admin: SupabaseClient<Database>,
  userId: string
): Promise<{ nuevos: number } | { error: string }> {
  // sinTipar: la inferencia genérica de .select() colapsa a `never` con este
  // Database multi-tabla (mismo problema documentado en lib/supabase/queries.ts
  // para .insert()/.update()); se castea la fila al tipo conocido en su lugar.
  const { data: conexionData } = await sinTipar(admin).from("gmail_conexiones").select("*").eq("user_id", userId).maybeSingle();
  const conexion = conexionData as GmailConexion | null;
  if (!conexion) return { error: "sin_conexion" };

  let accessToken: string;
  try {
    accessToken = (await refrescarToken(conexion.refresh_token)).access_token;
  } catch {
    await sinTipar(admin)
      .from("gmail_conexiones")
      .update({ estado: "expirado", ultimo_error: "Token expirado, reconecta Gmail" })
      .eq("user_id", userId);
    return { error: "expirado" };
  }

  const { data: miembroData } = await sinTipar(admin).from("cuenta_miembros").select("cuenta_id").eq("user_id", userId).maybeSingle();
  const miembro = miembroData as Pick<Miembro, "cuenta_id"> | null;
  if (!miembro) return { error: "sin_cuenta" };

  const desde = calcularDesde(conexion.ultimo_sync_at, DIAS_BACKFILL);
  const query = `from:${REMITENTE_BANCOLOMBIA} after:${Math.floor(desde.getTime() / 1000)}`;

  try {
    const ids = await listarIdsMensajes(accessToken, query);
    let nuevos = 0;
    let fallidos = 0;

    for (const id of ids) {
      const mensaje = await obtenerMensaje(accessToken, id);
      const texto = extraerTextoPlano(mensaje.payload);
      const detectado = await parsearNotificacion(texto);
      if (!detectado) continue;

      const { error } = await sinTipar(admin).from("gastos_pendientes").insert({
        cuenta_id: miembro.cuenta_id,
        creado_por: userId,
        gmail_message_id: id,
        fecha: detectado.fecha,
        monto: detectado.monto,
        categoria: detectado.categoria,
        nota: detectado.nota,
      });
      if (!error) {
        nuevos++;
        continue;
      }
      // 23505 = unique(creado_por, gmail_message_id): ya se había procesado este
      // correo, es el dedupe esperado. Cualquier otro error se cuenta para
      // avisar en ultimo_error, en vez de perderse en silencio.
      if (error.code !== "23505") fallidos++;
    }

    await sinTipar(admin)
      .from("gmail_conexiones")
      .update({
        estado: fallidos > 0 ? "error" : "activo",
        ultimo_sync_at: new Date().toISOString(),
        ultimo_error: fallidos > 0 ? `${fallidos} correo(s) no se pudieron guardar` : null,
      })
      .eq("user_id", userId);

    return { nuevos };
  } catch (e) {
    await sinTipar(admin)
      .from("gmail_conexiones")
      .update({ estado: "error", ultimo_error: e instanceof Error ? e.message : "Error desconocido" })
      .eq("user_id", userId);
    return { error: "sync_fallo" };
  }
}
