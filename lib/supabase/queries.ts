import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js";
import type { Database, Category, Expense, NuevoGasto, Settings } from "@/lib/types";

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

export async function listarGastos(supabase: Cliente, userId: string): Promise<Resultado<Expense[]>> {
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .eq("user_id", userId)
    .order("fecha", { ascending: false });
  return { data: data as Expense[] | null, error };
}

export async function listarCategorias(supabase: Cliente): Promise<Resultado<Category[]>> {
  const { data, error } = await supabase.from("categories").select("*").order("orden", { ascending: true });
  return { data: data as Category[] | null, error };
}

export async function obtenerSettings(supabase: Cliente, userId: string): Promise<Resultado<Settings>> {
  const { data, error } = await supabase.from("settings").select("*").eq("user_id", userId).single();
  return { data: data as Settings | null, error };
}

export async function crearGasto(supabase: Cliente, userId: string, gasto: NuevoGasto): Promise<Resultado<Expense>> {
  const { data, error } = await sinTipar(supabase)
    .from("expenses")
    .insert({ ...gasto, user_id: userId })
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
  userId: string,
  gastos: NuevoGasto[]
): Promise<Resultado<Expense[]>> {
  const { data, error } = await sinTipar(supabase)
    .from("expenses")
    .insert(gastos.map((g) => ({ ...g, user_id: userId })))
    .select();
  return { data: data as Expense[] | null, error };
}

export async function eliminarTodosLosGastos(supabase: Cliente, userId: string): Promise<{ error: PostgrestError | null }> {
  const { error } = await sinTipar(supabase).from("expenses").delete().eq("user_id", userId);
  return { error };
}

export async function actualizarTopes(
  supabase: Cliente,
  userId: string,
  cambios: Partial<Pick<Settings, "tope_ciclo" | "tope_quincena">>
): Promise<Resultado<Settings>> {
  const { data, error } = await sinTipar(supabase)
    .from("settings")
    .update(cambios)
    .eq("user_id", userId)
    .select()
    .single();
  return { data: data as Settings | null, error };
}
