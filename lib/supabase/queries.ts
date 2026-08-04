import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js";
import type { Database, Category, Cuenta, Expense, Miembro, NuevoGasto, Settings } from "@/lib/types";

type Cliente = SupabaseClient<Database>;
type Resultado<T> = { data: T | null; error: PostgrestError | null };

/**
 * @supabase/postgrest-js's generic inference for `.insert()`/`.update()` collapses
 * to `never` once a Database has more than one table (confirmed against a local
 * Postgres instance — looks like a limitation of its multi-table conditional-type
 * resolution, not something fixable from the caller's type declarations). Every
 * function here declares its own return type explicitly instead of relying on
 * inference, and mutations go through this untyped escape hatch; the shape is
 * validated at the boundary by NuevoGasto/Partial<NuevoGasto> instead, with
 * Postgres (NOT NULL, checks, RLS) enforcing the rest at runtime.
 */
function sinTipar(supabase: Cliente): SupabaseClient {
  return supabase as unknown as SupabaseClient;
}

// Lectura: RLS ya limita todo a la cuenta del usuario, así que no filtramos
// por cuenta acá — pedir sin filtro devuelve exactamente las filas de la cuenta.

export async function listarGastos(supabase: Cliente): Promise<Resultado<Expense[]>> {
  const { data, error } = await supabase.from("expenses").select("*").order("fecha", { ascending: false });
  return { data: data as Expense[] | null, error };
}

export async function listarCategorias(supabase: Cliente): Promise<Resultado<Category[]>> {
  const { data, error } = await supabase.from("categories").select("*").order("orden", { ascending: true });
  return { data: data as Category[] | null, error };
}

export async function obtenerSettings(supabase: Cliente): Promise<Resultado<Settings>> {
  const { data, error } = await supabase.from("settings").select("*").maybeSingle();
  return { data: data as Settings | null, error };
}

/** La cuenta a la que pertenece el usuario (para escribir con el cuenta_id correcto). */
export async function obtenerMiCuenta(supabase: Cliente, userId: string): Promise<Resultado<string>> {
  const { data, error } = await supabase
    .from("cuenta_miembros")
    .select("cuenta_id")
    .eq("user_id", userId)
    .maybeSingle();
  return { data: (data as { cuenta_id: string } | null)?.cuenta_id ?? null, error };
}

export async function listarMiembros(supabase: Cliente): Promise<Resultado<Miembro[]>> {
  const { data, error } = await supabase.from("cuenta_miembros").select("*").order("joined_at", { ascending: true });
  return { data: data as Miembro[] | null, error };
}

export async function obtenerCuenta(supabase: Cliente): Promise<Resultado<Cuenta>> {
  const { data, error } = await supabase.from("cuentas").select("*").maybeSingle();
  return { data: data as Cuenta | null, error };
}

export async function crearGasto(supabase: Cliente, cuentaId: string, gasto: NuevoGasto): Promise<Resultado<Expense>> {
  const { data, error } = await sinTipar(supabase)
    .from("expenses")
    .insert({ ...gasto, cuenta_id: cuentaId })
    .select()
    .single();
  return { data: data as Expense | null, error };
}

export async function actualizarGasto(
  supabase: Cliente,
  id: string,
  cambios: Partial<NuevoGasto>
): Promise<Resultado<Expense>> {
  const { data, error } = await sinTipar(supabase).from("expenses").update(cambios).eq("id", id).select().single();
  return { data: data as Expense | null, error };
}

export async function eliminarGasto(supabase: Cliente, id: string): Promise<{ error: PostgrestError | null }> {
  const { error } = await sinTipar(supabase).from("expenses").delete().eq("id", id);
  return { error };
}

export async function crearGastosMasivo(
  supabase: Cliente,
  cuentaId: string,
  gastos: NuevoGasto[]
): Promise<Resultado<Expense[]>> {
  const { data, error } = await sinTipar(supabase)
    .from("expenses")
    .insert(gastos.map((g) => ({ ...g, cuenta_id: cuentaId })))
    .select();
  return { data: data as Expense[] | null, error };
}

export async function eliminarTodosLosGastos(
  supabase: Cliente,
  cuentaId: string
): Promise<{ error: PostgrestError | null }> {
  const { error } = await sinTipar(supabase).from("expenses").delete().eq("cuenta_id", cuentaId);
  return { error };
}

export async function actualizarTopes(
  supabase: Cliente,
  cuentaId: string,
  cambios: Partial<Pick<Settings, "tope_ciclo" | "tope_quincena">>
): Promise<Resultado<Settings>> {
  const { data, error } = await sinTipar(supabase)
    .from("settings")
    .update(cambios)
    .eq("cuenta_id", cuentaId)
    .select()
    .single();
  return { data: data as Settings | null, error };
}

// Membresía — todo vía funciones controladas (SECURITY DEFINER) en la base.

// Las RPC van por el escape sin tipar (mismo motivo que insert/update): la
// inferencia de `.rpc()` con args nombrados choca con este cliente multi-tabla.
// La forma de args/retorno se valida en runtime por las funciones de Postgres.
export async function generarCodigo(supabase: Cliente): Promise<Resultado<string>> {
  const { data, error } = await sinTipar(supabase).rpc("generar_codigo");
  return { data: (data as string | null) ?? null, error };
}

export async function unirseACuenta(supabase: Cliente, codigo: string): Promise<Resultado<string>> {
  const { data, error } = await sinTipar(supabase).rpc("unirse_a_cuenta", { codigo });
  return { data: (data as string | null) ?? null, error };
}

export async function setApodo(supabase: Cliente, nombre: string): Promise<{ error: PostgrestError | null }> {
  const { error } = await sinTipar(supabase).rpc("set_apodo", { nombre });
  return { error };
}
