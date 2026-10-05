import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database, PlanPago } from "@/lib/types";
import { sinTipar } from "@/lib/supabase/queries";

type Cliente = SupabaseClient<Database>;
type Resultado<T> = { data: T | null; error: PostgrestError | null };

// RLS ya limita a la cuenta. (mes, rubro_id) es único dentro de una cuenta: el orden no baila.
export async function listarPagos(supabase: Cliente): Promise<Resultado<PlanPago[]>> {
  const { data, error } = await supabase
    .from("plan_pagos")
    .select("*")
    .order("mes", { ascending: true })
    .order("rubro_id", { ascending: true });
  return { data: data as PlanPago[] | null, error };
}

/** Marca (o corrige) el pago de un fijo en un mes. `pagadoEl` siempre explícito: el default de la base es UTC. */
export async function marcarPago(
  supabase: Cliente,
  cuentaId: string,
  rubroId: string,
  mes: string,
  monto: number,
  pagadoEl: string
): Promise<Resultado<PlanPago>> {
  const { data, error } = await sinTipar(supabase)
    .from("plan_pagos")
    .upsert({ cuenta_id: cuentaId, rubro_id: rubroId, mes, monto, pagado_el: pagadoEl }, { onConflict: "cuenta_id,rubro_id,mes" })
    .select()
    .single();
  return { data: data as PlanPago | null, error };
}

/** Desmarcar = borrar el pago; el Plan vuelve solo al estimado. */
export async function desmarcarPago(
  supabase: Cliente,
  cuentaId: string,
  rubroId: string,
  mes: string
): Promise<{ error: PostgrestError | null }> {
  const { error } = await sinTipar(supabase)
    .from("plan_pagos")
    .delete()
    .eq("cuenta_id", cuentaId)
    .eq("rubro_id", rubroId)
    .eq("mes", mes);
  return { error };
}
