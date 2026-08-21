/**
 * Consultas del módulo de flujo de caja.
 *
 * Todo pasa por `sinTipar()`: la inferencia de `@supabase/postgrest-js`
 * colapsa a `never` con un Database multi-tabla (ver el comentario en
 * `lib/supabase/queries.ts`), y además así las tablas `flujo_*` no tienen que
 * entrar al tipo `Database` del módulo de tarjeta — el aislamiento se mantiene
 * también en los tipos. Cada función declara su retorno explícitamente y
 * Postgres valida el resto en runtime (NOT NULL, checks, RLS).
 */

import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js";
import { sinTipar } from "@/lib/supabase/queries";
import type { Deuda, Movimiento, Regla } from "./tipos";

type Resultado<T> = { data: T | null; error: PostgrestError | null };
type SinError = { error: PostgrestError | null };

/** Un instrumento tal como lo devuelve la base (incluye lo que el motor no usa). */
export interface Instrumento {
  id: string;
  cuenta_id: string;
  nombre: string;
  banco: "bancolombia" | "davibank" | "otro";
  tipo: "ahorros" | "corriente" | "tc" | "efectivo";
  ultimos4: string | null;
  alias_pago: string[] | null;
  principal: boolean;
  titular: string | null;
  activo: boolean;
}

export type NuevoInstrumento = Omit<Instrumento, "id" | "cuenta_id">;
export type NuevaRegla = Omit<Regla, "id">;
export type NuevaDeuda = Omit<Deuda, "id">;

// Lectura: RLS ya limita todo a la cuenta del usuario, así que no se filtra
// por cuenta acá — pedir sin filtro devuelve exactamente las filas de la
// cuenta. Mismo criterio que `lib/supabase/queries.ts`.

export async function listarInstrumentos(supabase: SupabaseClient): Promise<Resultado<Instrumento[]>> {
  const { data, error } = await sinTipar(supabase)
    .from("flujo_instrumentos")
    .select("*")
    .order("nombre", { ascending: true });
  return { data: data as Instrumento[] | null, error };
}

export async function crearInstrumento(
  supabase: SupabaseClient,
  cuentaId: string,
  instrumento: NuevoInstrumento
): Promise<Resultado<Instrumento>> {
  const { data, error } = await sinTipar(supabase)
    .from("flujo_instrumentos")
    .insert({ ...instrumento, cuenta_id: cuentaId })
    .select()
    .single();
  return { data: data as Instrumento | null, error };
}

export async function actualizarInstrumento(
  supabase: SupabaseClient,
  id: string,
  cambios: Partial<NuevoInstrumento>
): Promise<SinError> {
  const { error } = await sinTipar(supabase).from("flujo_instrumentos").update(cambios).eq("id", id);
  return { error };
}

export async function eliminarInstrumento(supabase: SupabaseClient, id: string): Promise<SinError> {
  const { error } = await sinTipar(supabase).from("flujo_instrumentos").delete().eq("id", id);
  return { error };
}

/**
 * Deja un solo instrumento marcado como principal.
 *
 * Hay un índice único parcial que lo garantiza en la base, así que marcar uno
 * nuevo sin desmarcar el anterior falla. Se desmarca primero: si el update de
 * abajo falla, la cuenta queda sin principal (recuperable marcando otro) en
 * vez de con dos, que es lo que el índice prohíbe.
 */
export async function marcarPrincipal(supabase: SupabaseClient, id: string): Promise<SinError> {
  const { error: errorLimpiar } = await sinTipar(supabase)
    .from("flujo_instrumentos")
    .update({ principal: false })
    .eq("principal", true);
  if (errorLimpiar) return { error: errorLimpiar };
  return actualizarInstrumento(supabase, id, { principal: true });
}

export async function listarReglas(supabase: SupabaseClient): Promise<Resultado<Regla[]>> {
  const { data, error } = await sinTipar(supabase)
    .from("flujo_reglas")
    .select("*")
    .order("tipo", { ascending: true })
    .order("dia_1", { ascending: true });
  return { data: data as Regla[] | null, error };
}

export async function crearRegla(
  supabase: SupabaseClient,
  cuentaId: string,
  regla: NuevaRegla
): Promise<Resultado<Regla>> {
  const { data, error } = await sinTipar(supabase)
    .from("flujo_reglas")
    .insert({ ...regla, cuenta_id: cuentaId })
    .select()
    .single();
  return { data: data as Regla | null, error };
}

export async function actualizarRegla(
  supabase: SupabaseClient,
  id: string,
  cambios: Partial<NuevaRegla>
): Promise<SinError> {
  const { error } = await sinTipar(supabase).from("flujo_reglas").update(cambios).eq("id", id);
  return { error };
}

export async function eliminarRegla(supabase: SupabaseClient, id: string): Promise<SinError> {
  const { error } = await sinTipar(supabase).from("flujo_reglas").delete().eq("id", id);
  return { error };
}

export async function listarDeudas(supabase: SupabaseClient): Promise<Resultado<Deuda[]>> {
  const { data, error } = await sinTipar(supabase)
    .from("flujo_deudas")
    .select("*")
    .order("nombre", { ascending: true });
  return { data: data as Deuda[] | null, error };
}

export async function listarMovimientos(supabase: SupabaseClient): Promise<Resultado<Movimiento[]>> {
  const { data, error } = await sinTipar(supabase)
    .from("flujo_movimientos")
    .select("*")
    .order("fecha", { ascending: false });
  return { data: data as Movimiento[] | null, error };
}
