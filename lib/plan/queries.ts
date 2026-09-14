import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database, NuevoRubro, PlanAjuste, PlanRubro } from "@/lib/types";
import { sinTipar } from "@/lib/supabase/queries";

type Cliente = SupabaseClient<Database>;
type Resultado<T> = { data: T | null; error: PostgrestError | null };

// Lectura: RLS ya limita a la cuenta del usuario; no se filtra por cuenta acá.
// El orden incluye created_at para que dos rubros con el mismo `orden` no
// bailen entre recargas.
export async function listarRubros(supabase: Cliente): Promise<Resultado<PlanRubro[]>> {
  const { data, error } = await supabase
    .from("plan_rubros")
    .select("*")
    .order("tipo", { ascending: true })
    .order("orden", { ascending: true })
    .order("created_at", { ascending: true });
  return { data: data as PlanRubro[] | null, error };
}

export async function crearRubro(supabase: Cliente, cuentaId: string, datos: NuevoRubro): Promise<Resultado<PlanRubro>> {
  const result = await sinTipar(supabase)
    .from("plan_rubros")
    .insert({ ...datos, cuenta_id: cuentaId })
    .select()
    .single();

  const finalData = Array.isArray(result.data) && result.data.length > 0
    ? result.data[0]
    : result.data;

  return { data: finalData as PlanRubro | null, error: result.error };
}

export async function actualizarRubro(
  supabase: Cliente,
  id: string,
  cambios: Partial<NuevoRubro>
): Promise<Resultado<PlanRubro>> {
  const result = await sinTipar(supabase).from("plan_rubros").update(cambios).eq("id", id).select().single();

  const finalData = Array.isArray(result.data) && result.data.length > 0
    ? result.data[0]
    : result.data;

  return { data: finalData as PlanRubro | null, error: result.error };
}

export async function eliminarRubro(supabase: Cliente, id: string): Promise<{ error: PostgrestError | null }> {
  const { error } = await sinTipar(supabase).from("plan_rubros").delete().eq("id", id);
  return { error };
}

export async function listarAjustes(supabase: Cliente): Promise<Resultado<PlanAjuste[]>> {
  const { data, error } = await supabase.from("plan_ajustes").select("*").order("mes", { ascending: true });
  return { data: data as PlanAjuste[] | null, error };
}

/** Upsert sobre la clave única (cuenta_id, mes, rubro_id). rubroId null = estimado de TC. */
export async function guardarAjuste(
  supabase: Cliente,
  cuentaId: string,
  mes: string,
  rubroId: string | null,
  monto: number
): Promise<Resultado<PlanAjuste>> {
  const result = await sinTipar(supabase)
    .from("plan_ajustes")
    .upsert({ cuenta_id: cuentaId, mes, rubro_id: rubroId, monto }, { onConflict: "cuenta_id,mes,rubro_id" })
    .select()
    .single();

  // `.single()` should unpack arrays, but with mocked fetch may need explicit handling
  const finalData = Array.isArray(result.data) && result.data.length > 0
    ? result.data[0]
    : result.data;

  return { data: finalData as PlanAjuste | null, error: result.error };
}

/** Quitar el ajuste = volver al default (rubro) o al ritmo/promedio (TC). */
export async function quitarAjuste(
  supabase: Cliente,
  cuentaId: string,
  mes: string,
  rubroId: string | null
): Promise<{ error: PostgrestError | null }> {
  let q = sinTipar(supabase).from("plan_ajustes").delete().eq("cuenta_id", cuentaId).eq("mes", mes);
  q = rubroId === null ? q.is("rubro_id", null) : q.eq("rubro_id", rubroId);
  const { error } = await q;
  return { error };
}
