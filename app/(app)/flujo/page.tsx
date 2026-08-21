import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listarCategorias, listarGastos, obtenerMiCuenta } from "@/lib/supabase/queries";
import {
  listarDeudas,
  listarInstrumentos,
  listarMovimientos,
  listarReglas,
  listarReglasExpenses,
  obtenerConfig,
  ultimoSaldo,
} from "@/lib/flujo/queries";
import { proyectar } from "@/lib/flujo/proyeccion";
import { hoyISO } from "@/lib/ciclo";
import { FlujoClient } from "@/components/flujo/FlujoClient";
import type { GastoTarjeta } from "@/lib/flujo/tipos";

export default async function FlujoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [reglasRes, deudasRes, instrumentosRes, movimientosRes, gastosRes, emparejadosRes, configRes, anclaRes, categoriasRes, cuentaRes] =
    await Promise.all([
      listarReglas(supabase),
      listarDeudas(supabase),
      listarInstrumentos(supabase),
      listarMovimientos(supabase),
      listarGastos(supabase),
      listarReglasExpenses(supabase),
      obtenerConfig(supabase),
      ultimoSaldo(supabase),
      listarCategorias(supabase),
      obtenerMiCuenta(supabase, user.id),
    ]);

  // Si algo falló, no se pasan listas a medias: la pantalla entra en solo
  // lectura con un aviso, en vez de dejar creer que no hay nada configurado —
  // y sobre todo, en vez de dibujar una curva construida sobre datos
  // incompletos, que es peor que no dibujar ninguna.
  const lecturaFallida = Boolean(
    reglasRes.error ||
      deudasRes.error ||
      instrumentosRes.error ||
      movimientosRes.error ||
      gastosRes.error ||
      emparejadosRes.error ||
      configRes.error ||
      anclaRes.error ||
      cuentaRes.error
  );

  const reglas = lecturaFallida ? [] : reglasRes.data ?? [];
  const deudas = lecturaFallida ? [] : deudasRes.data ?? [];
  const movimientos = lecturaFallida ? [] : movimientosRes.data ?? [];
  const ancla = lecturaFallida ? null : anclaRes.data;
  const config = lecturaFallida ? null : configRes.data;

  // `expenses` solo se lee: es el único punto de contacto con el módulo de
  // tarjeta. La regla que cobró cada gasto sale de la tabla lateral.
  const porExpense = new Map((emparejadosRes.data ?? []).map((e) => [e.expense_id, e.regla_id]));
  const gastosTarjeta: GastoTarjeta[] = (lecturaFallida ? [] : gastosRes.data ?? []).map((g) => ({
    id: g.id,
    fecha: g.fecha,
    monto: g.monto,
    regla_id: porExpense.get(g.id) ?? null,
  }));

  const hoy = hoyISO();
  const colchon = config?.colchon ?? 0;
  const proyeccion = proyectar({
    hoy,
    horizonteDias: config?.horizonte_dias ?? 90,
    colchon,
    ancla,
    movimientos,
    reglas,
    deudas,
    gastosTarjeta,
  });

  return (
    <FlujoClient
      cuentaId={lecturaFallida ? null : cuentaRes.data}
      proyeccion={proyeccion}
      hoy={hoy}
      ancla={ancla}
      colchon={colchon}
      diasRecordatorio={config?.dias_recordatorio_saldo ?? 15}
      reglasIniciales={reglas}
      deudasIniciales={deudas}
      instrumentosIniciales={lecturaFallida ? [] : instrumentosRes.data ?? []}
      categorias={categoriasRes.data ?? []}
      lecturaFallida={lecturaFallida}
    />
  );
}
