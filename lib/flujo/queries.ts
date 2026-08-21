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
import type { Ancla, Deuda, Movimiento, Regla } from "./tipos";

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

export interface ConfigFlujo {
  cuenta_id: string;
  colchon: number;
  horizonte_dias: number;
  dias_recordatorio_saldo: number;
}

/** La configuración de la cuenta. No hay fila hasta que se guarda la primera vez. */
export async function obtenerConfig(supabase: SupabaseClient): Promise<Resultado<ConfigFlujo>> {
  const { data, error } = await sinTipar(supabase).from("flujo_config").select("*").maybeSingle();
  return { data: data as ConfigFlujo | null, error };
}

export async function guardarConfig(
  supabase: SupabaseClient,
  cuentaId: string,
  cambios: Partial<Omit<ConfigFlujo, "cuenta_id">>
): Promise<SinError> {
  const { error } = await sinTipar(supabase)
    .from("flujo_config")
    .upsert({ ...cambios, cuenta_id: cuentaId }, { onConflict: "cuenta_id" });
  return { error };
}

/**
 * El ancla más reciente: el saldo desde el que se reconstruye todo.
 * Solo el consolidado (instrumento_id nulo) — los saldos por instrumento
 * quedan para cuando haya vista por cuenta.
 *
 * El desempate no es cosmético. Re-anclar inserta otra fila con la misma
 * `fecha` (ver `crearSaldo`), así que empatar es el caso normal, no el borde;
 * y `flujo_saldos` no puede tener un único sobre (cuenta_id, fecha) sin
 * romper ese diseño. Ordenando solo por `fecha`, Postgres devuelve una fila
 * arbitraria —en la práctica la insertada primero, o sea la que el usuario
 * acaba de corregir— y la app ignora el re-anclaje en silencio, después de
 * haber dicho "Saldo actualizado".
 *
 * `created_at` es la intención (gana la última anclada). `id` va de último
 * recurso: es un uuid v4, no ordena cronológicamente, pero convierte un
 * empate indeterminado en uno estable entre recargas — `now()` es constante
 * dentro de una transacción, así que dos filas insertadas juntas empatarían.
 * Ninguna de las dos columnas necesita estar en el `select()`: el ORDER BY se
 * aplica sobre la tabla, no sobre la proyección.
 */
export async function ultimoSaldo(supabase: SupabaseClient): Promise<Resultado<Ancla>> {
  const { data, error } = await sinTipar(supabase)
    .from("flujo_saldos")
    .select("fecha, monto")
    .is("instrumento_id", null)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { data: data as Ancla | null, error };
}

/** Re-anclar es insertar, nunca editar: así queda el historial de la deriva. */
export async function crearSaldo(
  supabase: SupabaseClient,
  cuentaId: string,
  fecha: string,
  monto: number
): Promise<SinError> {
  const { error } = await sinTipar(supabase)
    .from("flujo_saldos")
    .insert({ cuenta_id: cuentaId, fecha, monto, origen: "manual" });
  return { error };
}

/**
 * Qué gasto de `expenses` corresponde a qué regla. Vive en una tabla lateral
 * porque `expenses` no se toca; el motor lo usa para no proyectar dos veces un
 * fijo que ya llegó, y para excluir los fijos del run-rate.
 */
export async function listarReglasExpenses(
  supabase: SupabaseClient
): Promise<Resultado<{ regla_id: string; expense_id: string }[]>> {
  const { data, error } = await sinTipar(supabase).from("flujo_reglas_expenses").select("regla_id, expense_id");
  return { data: data as { regla_id: string; expense_id: string }[] | null, error };
}

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

export async function crearDeuda(
  supabase: SupabaseClient,
  cuentaId: string,
  deuda: NuevaDeuda
): Promise<Resultado<Deuda>> {
  const { data, error } = await sinTipar(supabase)
    .from("flujo_deudas")
    .insert({ ...deuda, cuenta_id: cuentaId })
    .select()
    .single();
  return { data: data as Deuda | null, error };
}

export async function actualizarDeuda(
  supabase: SupabaseClient,
  id: string,
  cambios: Partial<NuevaDeuda>
): Promise<SinError> {
  const { error } = await sinTipar(supabase).from("flujo_deudas").update(cambios).eq("id", id);
  return { error };
}

export async function eliminarDeuda(supabase: SupabaseClient, id: string): Promise<SinError> {
  const { error } = await sinTipar(supabase).from("flujo_deudas").delete().eq("id", id);
  return { error };
}

/**
 * Registra el pago de una cuota. Va por RPC porque son dos escrituras que
 * tienen que ir juntas: el movimiento en el libro y el avance de la deuda.
 * Por separado, una podría fallar y dejar la cuota contada dos veces (o el
 * saldo descuadrado).
 */
export async function confirmarCuotaDeuda(
  supabase: SupabaseClient,
  deudaId: string,
  fecha: string,
  monto: number,
  saldoDespues: number
): Promise<Resultado<string>> {
  const { data, error } = await sinTipar(supabase).rpc("confirmar_cuota_deuda", {
    p_deuda_id: deudaId,
    p_fecha: fecha,
    p_monto: monto,
    p_saldo_despues: saldoDespues,
  });
  return { data: data as string | null, error };
}

export async function listarMovimientos(supabase: SupabaseClient): Promise<Resultado<Movimiento[]>> {
  const { data, error } = await sinTipar(supabase)
    .from("flujo_movimientos")
    .select("*")
    .order("fecha", { ascending: false });
  return { data: data as Movimiento[] | null, error };
}
