import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { obtenerMiCuenta } from "@/lib/supabase/queries";
import { guardarTrm, obtenerTrmDeFecha } from "@/lib/ahorros/queries";
import { resolverTrmDeHoy } from "@/lib/ahorros/trm";
import { hoyISO } from "@/lib/ciclo";

export const dynamic = "force-dynamic";

/**
 * GET /api/trm — TRM de hoy para la cuenta del usuario. Si ya hay fila de hoy
 * (automática o manual) la devuelve; si no, consulta datos.gov.co, la guarda
 * con fuente 'datos.gov.co' y la devuelve. Corre con la sesión del usuario:
 * RLS normal, sin service role.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sin sesión" }, { status: 401 });

  const cuenta = await obtenerMiCuenta(supabase, user.id);
  if (cuenta.error || !cuenta.data) return NextResponse.json({ error: "no se pudo leer la cuenta" }, { status: 500 });

  const hoy = hoyISO();
  const filaHoy = await obtenerTrmDeFecha(supabase, hoy);
  if (filaHoy.error) return NextResponse.json({ error: `no se pudo leer la TRM guardada: ${filaHoy.error.message}` }, { status: 500 });

  const r = await resolverTrmDeHoy({ filaHoy: filaHoy.data, fetchFn: fetch });
  if (!r.data) return NextResponse.json({ error: r.error ?? "TRM no disponible" }, { status: 502 });

  if (r.llamoAfuera) {
    const guardada = await guardarTrm(supabase, cuenta.data, r.data.fecha, r.data.valor, "datos.gov.co");
    if (guardada.error) return NextResponse.json({ error: `TRM obtenida pero no se pudo guardar: ${guardada.error.message}` }, { status: 500 });
  }
  return NextResponse.json(r.data);
}
