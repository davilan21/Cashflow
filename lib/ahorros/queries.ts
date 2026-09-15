import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { AhorroInstrumento, AhorroMovimiento, AhorroValoracion, Database, FuenteTrm, NuevoInstrumento, NuevoMovimiento, Trm } from "@/lib/types";
import { sinTipar } from "@/lib/supabase/queries";

type Cliente = SupabaseClient<Database>;
type Resultado<T> = { data: T | null; error: PostgrestError | null };

// PostgREST devuelve numeric como string. Se convierte acá, una vez, y el
// resto del módulo trabaja con number.
const num = (v: unknown): number => Number(v);
const numONull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

const normInstrumento = (r: Record<string, unknown>): AhorroInstrumento => ({ ...(r as unknown as AhorroInstrumento), tasa_ea: numONull(r.tasa_ea) });
const normMovimiento = (r: Record<string, unknown>): AhorroMovimiento => ({ ...(r as unknown as AhorroMovimiento), monto: num(r.monto) });
const normValoracion = (r: Record<string, unknown>): AhorroValoracion => ({ ...(r as unknown as AhorroValoracion), valor: num(r.valor) });
const normTrm = (r: Record<string, unknown>): Trm => ({ ...(r as unknown as Trm), valor: num(r.valor) });

const lista = <T>(data: unknown, f: (r: Record<string, unknown>) => T): T[] | null =>
  data ? (data as Record<string, unknown>[]).map(f) : null;
const una = <T>(data: unknown, f: (r: Record<string, unknown>) => T): T | null =>
  data ? f(data as Record<string, unknown>) : null;

// Instrumentos ---------------------------------------------------------------

export async function listarInstrumentos(supabase: Cliente): Promise<Resultado<AhorroInstrumento[]>> {
  const { data, error } = await supabase.from("ahorro_instrumentos").select("*").order("created_at", { ascending: true });
  return { data: lista(data, normInstrumento), error };
}

export async function crearInstrumento(supabase: Cliente, cuentaId: string, datos: NuevoInstrumento): Promise<Resultado<AhorroInstrumento>> {
  const { data, error } = await sinTipar(supabase).from("ahorro_instrumentos").insert({ ...datos, cuenta_id: cuentaId }).select().single();
  return { data: una(data, normInstrumento), error };
}

export async function actualizarInstrumento(supabase: Cliente, id: string, cambios: Partial<NuevoInstrumento>): Promise<Resultado<AhorroInstrumento>> {
  const { data, error } = await sinTipar(supabase).from("ahorro_instrumentos").update(cambios).eq("id", id).select().single();
  return { data: una(data, normInstrumento), error };
}

export async function eliminarInstrumento(supabase: Cliente, id: string): Promise<{ error: PostgrestError | null }> {
  const { error } = await sinTipar(supabase).from("ahorro_instrumentos").delete().eq("id", id);
  return { error };
}

// Movimientos ---------------------------------------------------------------

export async function listarMovimientos(supabase: Cliente): Promise<Resultado<AhorroMovimiento[]>> {
  const { data, error } = await supabase
    .from("ahorro_movimientos")
    .select("*")
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });
  return { data: lista(data, normMovimiento), error };
}

export async function crearMovimiento(supabase: Cliente, cuentaId: string, datos: NuevoMovimiento): Promise<Resultado<AhorroMovimiento>> {
  const { data, error } = await sinTipar(supabase).from("ahorro_movimientos").insert({ ...datos, cuenta_id: cuentaId }).select().single();
  return { data: una(data, normMovimiento), error };
}

export async function eliminarMovimiento(supabase: Cliente, id: string): Promise<{ error: PostgrestError | null }> {
  const { error } = await sinTipar(supabase).from("ahorro_movimientos").delete().eq("id", id);
  return { error };
}

// Valoraciones --------------------------------------------------------------

export async function listarValoraciones(supabase: Cliente): Promise<Resultado<AhorroValoracion[]>> {
  const { data, error } = await supabase.from("ahorro_valoraciones").select("*").order("fecha", { ascending: false });
  return { data: lista(data, normValoracion), error };
}

/** Una valoración por instrumento y día: repetir el día la corrige. */
export async function guardarValoracion(
  supabase: Cliente, cuentaId: string, instrumentoId: string, fecha: string, valor: number, nota: string | null
): Promise<Resultado<AhorroValoracion>> {
  const { data, error } = await sinTipar(supabase)
    .from("ahorro_valoraciones")
    .upsert({ cuenta_id: cuentaId, instrumento_id: instrumentoId, fecha, valor, nota }, { onConflict: "instrumento_id,fecha" })
    .select()
    .single();
  return { data: una(data, normValoracion), error };
}

export async function eliminarValoracion(supabase: Cliente, id: string): Promise<{ error: PostgrestError | null }> {
  const { error } = await sinTipar(supabase).from("ahorro_valoraciones").delete().eq("id", id);
  return { error };
}

// TRM ------------------------------------------------------------------------

export async function listarTrm(supabase: Cliente): Promise<Resultado<Trm[]>> {
  const { data, error } = await supabase.from("ahorro_trm").select("*").order("fecha", { ascending: false });
  return { data: lista(data, normTrm), error };
}

export async function obtenerTrmDeFecha(supabase: Cliente, fecha: string): Promise<Resultado<Trm>> {
  const { data, error } = await supabase.from("ahorro_trm").select("*").eq("fecha", fecha).maybeSingle();
  return { data: una(data, normTrm), error };
}

export async function guardarTrm(supabase: Cliente, cuentaId: string, fecha: string, valor: number, fuente: FuenteTrm): Promise<Resultado<Trm>> {
  const { data, error } = await sinTipar(supabase)
    .from("ahorro_trm")
    .upsert({ cuenta_id: cuentaId, fecha, valor, fuente }, { onConflict: "cuenta_id,fecha" })
    .select()
    .single();
  return { data: una(data, normTrm), error };
}
