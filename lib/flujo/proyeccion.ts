/**
 * El motor de proyección de flujo de caja.
 *
 * Función pura: sin Supabase, sin React, sin `Date` local — igual que
 * `lib/ciclo.ts`. Recibe el estado del mundo y devuelve la curva de saldo día
 * a día. La UI es decoración encima de esto.
 *
 * La idea que sostiene todo el módulo: **un gasto de tarjeta no es una salida
 * de caja el día que ocurre, sino el día que se paga el ciclo**. Por eso los N
 * gastos de un ciclo colapsan en un solo evento el día de pago, y por eso este
 * motor lee `expenses` (nunca lo escribe) para armarlo.
 */

import {
  cicloDe,
  cicloFin,
  cicloPago,
  desplazarMes,
  diasEnMes,
  diasEntre,
  mesDe,
  sumarDias,
} from "@/lib/ciclo";
import { tablaAmortizacion } from "./deuda";
import type {
  Deuda,
  EntradaProyeccion,
  EventoCaja,
  GastoTarjeta,
  Proyeccion,
  PuntoSaldo,
  Regla,
} from "./tipos";

const pad = (n: number) => String(n).padStart(2, "0");

/** El día `dia` del mes `ym`, recortado al último si el mes es más corto. */
function diaDelMes(ym: string, dia: number): string {
  return `${ym}-${pad(Math.min(dia, diasEnMes(ym)))}`;
}

/** Cada cuántos meses se repite una frecuencia. `unica` no se repite. */
function pasoEnMeses(frecuencia: Regla["frecuencia"]): number {
  if (frecuencia === "bimestral") return 2;
  if (frecuencia === "anual") return 12;
  return 1;
}

/**
 * Las fechas en que una regla cae dentro de [desde, hasta].
 *
 * El día se recorta al último del mes cuando no existe: un arriendo del 31 se
 * paga el 28 en febrero. Misma regla que `cicloPago()` usa para el día 30.
 */
export function ocurrenciasDeRegla(regla: Regla, desde: string, hasta: string): string[] {
  if (!regla.activa || desde > hasta) return [];

  const inicio = regla.desde > desde ? regla.desde : desde;
  const fin = regla.hasta && regla.hasta < hasta ? regla.hasta : hasta;
  if (inicio > fin) return [];

  if (regla.frecuencia === "unica") {
    const f = diaDelMes(mesDe(regla.desde), regla.dia_1);
    return f >= inicio && f <= fin ? [f] : [];
  }

  const paso = pasoEnMeses(regla.frecuencia);
  const dias = regla.frecuencia === "quincenal" && regla.dia_2 ? [regla.dia_1, regla.dia_2] : [regla.dia_1];
  const salida: string[] = [];

  // Se arranca un mes antes del inicio de la ventana para no perder una
  // ocurrencia que caiga en los primeros días, y se recorre hasta un mes
  // después del fin por la misma razón al otro lado.
  let ym = desplazarMes(mesDe(inicio), -1);
  const ymFin = desplazarMes(mesDe(fin), 1);

  while (ym <= ymFin) {
    // Una regla anual solo cae en su mes; una bimestral, cada dos meses
    // contados desde su mes de arranque.
    const mesOk =
      regla.frecuencia !== "anual"
        ? paso === 1 || mesesEntre(mesDe(regla.desde), ym) % paso === 0
        : Number(ym.slice(5, 7)) === regla.mes;

    if (mesOk) {
      for (const d of dias) {
        const f = diaDelMes(ym, d);
        if (f >= inicio && f <= fin) salida.push(f);
      }
    }
    ym = desplazarMes(ym, 1);
  }

  return salida.sort();
}

/** Meses de diferencia entre dos 'YYYY-MM' (b − a). */
function mesesEntre(a: string, b: string): number {
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

/** La llave con la que un movimiento real "consume" una ocurrencia proyectada. */
function llaveOcurrencia(refId: string, refPeriodo: string): string {
  return `${refId}|${refPeriodo}`;
}

/**
 * Expande reglas a eventos de caja.
 *
 * Un `gasto_fijo` con `medio_pago = 'tc'` NO produce evento: alimenta el total
 * esperado del ciclo y toca caja el día que se paga la tarjeta. Contarlo en su
 * fecha sería exactamente el doble conteo que este módulo existe para evitar.
 */
export function expandirReglas(reglas: Regla[], desde: string, hasta: string, consumidas: Set<string>): EventoCaja[] {
  const eventos: EventoCaja[] = [];

  for (const regla of reglas) {
    if (regla.tipo === "gasto_fijo" && regla.medio_pago === "tc") continue;

    const entra = regla.tipo === "ingreso";
    const tipo = regla.tipo === "ingreso" ? "ingreso" : regla.tipo === "aporte_inversion" ? "aporte" : "gasto_fijo";

    for (const fecha of ocurrenciasDeRegla(regla, desde, hasta)) {
      if (consumidas.has(llaveOcurrencia(regla.id, fecha))) continue;
      eventos.push({
        fecha,
        monto: entra ? regla.monto : -regla.monto,
        tipo,
        etiqueta: regla.nombre,
        origen: regla.monto_tipo === "estimado" ? "estimado" : "proyectado",
        registrado: false,
        refId: regla.id,
        refPeriodo: fecha,
      });
    }
  }

  return eventos;
}

/** Expande las cuotas de las deudas activas que caen en la ventana. */
export function expandirDeudas(deudas: Deuda[], desde: string, hasta: string, consumidas: Set<string>): EventoCaja[] {
  const eventos: EventoCaja[] = [];

  for (const deuda of deudas) {
    for (const cuota of tablaAmortizacion(deuda)) {
      if (cuota.fecha < desde || cuota.fecha > hasta) continue;
      if (consumidas.has(llaveOcurrencia(deuda.id, cuota.fecha))) continue;
      eventos.push({
        fecha: cuota.fecha,
        monto: -cuota.cuota,
        tipo: "cuota_deuda",
        etiqueta: `${deuda.nombre} · cuota ${cuota.numero}`,
        origen: "proyectado",
        registrado: false,
        refId: deuda.id,
        refPeriodo: cuota.fecha,
      });
    }
  }

  return eventos;
}

/** El total ya gastado de un ciclo, según lo que hay en `expenses`. */
function totalCiclo(gastos: GastoTarjeta[], ciclo: string): number {
  return gastos.filter((g) => cicloDe(g.fecha) === ciclo).reduce((s, g) => s + g.monto, 0);
}

/**
 * El gasto discrecional diario del ciclo: lo que NO viene de una regla,
 * repartido entre los días ya corridos.
 *
 * Excluir los fijos es indispensable: si el run-rate los incluyera, los fijos
 * se contarían dos veces dentro del mismo ciclo — una por su expectativa y
 * otra por la extrapolación.
 */
function ritmoDiscrecional(gastos: GastoTarjeta[], ciclo: string, hoy: string): number {
  const inicio = `${desplazarMes(ciclo, -1)}-16`;
  const corridos = Math.max(1, diasEntre(inicio, hoy) + 1);
  const discrecional = gastos
    .filter((g) => cicloDe(g.fecha) === ciclo && g.regla_id === null)
    .reduce((s, g) => s + g.monto, 0);
  return discrecional / corridos;
}

/** Lo que falta por cobrar de los fijos que van a la tarjeta en un ciclo. */
function fijosTcPendientes(reglas: Regla[], gastos: GastoTarjeta[], ciclo: string): number {
  const inicio = `${desplazarMes(ciclo, -1)}-16`;
  const fin = cicloFin(ciclo);
  const yaCobradas = new Set(
    gastos.filter((g) => cicloDe(g.fecha) === ciclo && g.regla_id).map((g) => g.regla_id as string)
  );

  return reglas
    .filter((r) => r.activa && r.tipo === "gasto_fijo" && r.medio_pago === "tc" && !yaCobradas.has(r.id))
    .filter((r) => ocurrenciasDeRegla(r, inicio, fin).length > 0)
    .reduce((s, r) => s + r.monto, 0);
}

/**
 * Un evento de caja por cada ciclo de tarjeta cuyo pago cae en la ventana.
 *
 * - Ciclo cerrado y no pagado → el total real, en su fecha de pago. El monto
 *   es final (`origen: 'real'`) pero el pago NO está hecho: va con
 *   `registrado: false`. Confundir las dos cosas es el riesgo #1 del módulo.
 * - Ciclo en curso → lo real hasta hoy, más los fijos que faltan, más el
 *   ritmo discrecional por los días que quedan.
 * - Ciclos futuros → los fijos del ciclo más el promedio discrecional reciente.
 *
 * Un ciclo con pago ya registrado NO genera evento proyectado: el movimiento
 * real lo reemplaza, con su fecha real. El emparejamiento es por ciclo y nunca
 * por fecha — un pago hecho el 2 del mes siguiente quedaría, si no, como un
 * gasto nuevo *además* del proyectado del 30.
 */
export function eventosPagoTarjeta(
  gastos: GastoTarjeta[],
  reglas: Regla[],
  ciclosPagados: Set<string>,
  hoy: string,
  desde: string,
  hasta: string
): EventoCaja[] {
  const eventos: EventoCaja[] = [];
  const cicloHoy = cicloDe(hoy);
  const ritmo = ritmoDiscrecional(gastos, cicloHoy, hoy);

  // Promedio discrecional de los 3 ciclos anteriores, para estimar los que
  // todavía no empiezan. Sin historia, se cae al ritmo del ciclo en curso.
  const previos = [1, 2, 3].map((n) => desplazarMes(cicloHoy, -n));
  const conDatos = previos.filter((c) => gastos.some((g) => cicloDe(g.fecha) === c));
  const promedioFuturo = conDatos.length
    ? conDatos.reduce((s, c) => {
        const disc = gastos
          .filter((g) => cicloDe(g.fecha) === c && g.regla_id === null)
          .reduce((a, g) => a + g.monto, 0);
        return s + disc;
      }, 0) / conDatos.length
    : ritmo * 30;

  // Se arranca un ciclo antes de la ventana: un ciclo cerrado se paga el 30,
  // que puede caer dentro de la ventana aunque el ciclo empezara antes.
  let ciclo = desplazarMes(cicloDe(desde), -1);
  const cicloTope = desplazarMes(cicloDe(hasta), 1);

  while (ciclo <= cicloTope) {
    const pago = cicloPago(ciclo);
    if (pago < desde || pago > hasta || ciclosPagados.has(ciclo)) {
      ciclo = desplazarMes(ciclo, 1);
      continue;
    }

    const real = totalCiclo(gastos, ciclo);
    let monto: number;
    let origen: EventoCaja["origen"];

    if (cicloFin(ciclo) < hoy) {
      // Cerrado: el total ya no se mueve.
      monto = real;
      origen = "real";
    } else if (ciclo === cicloHoy) {
      const restantes = Math.max(0, diasEntre(hoy, cicloFin(ciclo)));
      monto = real + fijosTcPendientes(reglas, gastos, ciclo) + Math.round(ritmo * restantes);
      origen = "estimado";
    } else {
      monto = fijosTcPendientes(reglas, gastos, ciclo) + Math.round(promedioFuturo);
      origen = "estimado";
    }

    if (monto > 0) {
      eventos.push({
        fecha: pago,
        monto: -monto,
        tipo: "pago_tc",
        etiqueta: `Pago tarjeta · ciclo ${ciclo}`,
        origen,
        // Nunca registrado: la rama de arriba ya descartó los ciclos pagados,
        // así que todo lo que sale de acá es un pago que no está hecho —
        // incluido el del ciclo cerrado, cuyo monto sí es final.
        registrado: false,
        refId: ciclo,
        refPeriodo: ciclo,
      });
    }
    ciclo = desplazarMes(ciclo, 1);
  }

  return eventos;
}

/** Ciclos cerrados cuya fecha de pago ya pasó sin que se registre el pago. */
export function ciclosSinPagar(gastos: GastoTarjeta[], ciclosPagados: Set<string>, hoy: string): string[] {
  const ciclos = [...new Set(gastos.map((g) => cicloDe(g.fecha)))].sort();
  return ciclos.filter((c) => cicloPago(c) < hoy && !ciclosPagados.has(c) && totalCiclo(gastos, c) > 0);
}

/**
 * La proyección completa.
 *
 * El saldo de hoy se calcula **desde el ancla, no desde hoy**: al último
 * snapshot se le suman los movimientos reales posteriores Y las ocurrencias
 * proyectadas de reglas y deudas que quedaron entre el ancla y hoy sin
 * confirmar. Ese último término es lo que hace que el modelo funcione con
 * confirmación manual: el arriendo del 5 y la cuota del 10 casi seguro
 * salieron aunque nadie los haya marcado, e ignorarlos inflaría el saldo mes
 * a mes.
 */
export function proyectar(entrada: EntradaProyeccion): Proyeccion {
  const { hoy, horizonteDias, colchon, ancla, movimientos, reglas, deudas, gastosTarjeta } = entrada;
  const hasta = sumarDias(hoy, horizonteDias);

  // Ocurrencias ya confirmadas: no se vuelven a proyectar.
  const consumidas = new Set(
    movimientos
      .filter((m) => m.ref_id && m.ref_periodo)
      .map((m) => llaveOcurrencia(m.ref_id as string, m.ref_periodo as string))
  );
  const pagados = new Set(
    movimientos.filter((m) => m.tipo === "pago_tc" && m.ref_ciclo).map((m) => m.ref_ciclo as string)
  );

  // --- Saldo de hoy, reconstruido desde el ancla --------------------------
  const desdeAncla = ancla ? sumarDias(ancla.fecha, 1) : hoy;
  const ayer = sumarDias(hoy, -1);

  // Hasta HOY INCLUSIVE: un movimiento confirmado con fecha de hoy ya salió
  // del banco, así que pertenece al saldo de hoy y no a la curva de lo que
  // viene. Sin ternario a propósito: cuando no hay ancla, `desdeAncla` vale
  // `hoy` y el filtro recoge justo los movimientos de hoy, en vez de dejarlos
  // fuera de los dos lados del corte y perderlos.
  //
  // Cuando el ancla cierra HOY, `desdeAncla` es mañana y el rango queda vacío
  // por construcción: los movimientos de hoy ya están dentro del ancla y
  // volver a restarlos hundiría la curva entera.
  const realesPrevios = movimientos
    .filter((m) => m.fecha >= desdeAncla && m.fecha <= hoy)
    .reduce((s, m) => s + m.monto, 0);

  const asumidosPrevios =
    ancla && desdeAncla <= ayer
      ? [
          ...expandirReglas(reglas, desdeAncla, ayer, consumidas),
          ...expandirDeudas(deudas, desdeAncla, ayer, consumidas),
          ...eventosPagoTarjeta(gastosTarjeta, reglas, pagados, hoy, desdeAncla, ayer),
        ].reduce((s, e) => s + e.monto, 0)
      : 0;

  const saldoHoy = (ancla?.monto ?? 0) + realesPrevios + asumidosPrevios;

  // --- Eventos de la ventana hacia adelante -------------------------------
  const eventos = [
    ...movimientos
      // Estrictamente DESPUÉS de hoy: los de hoy ya los absorbió `saldoHoy`.
      // Contarlos también acá los sumaría dos veces al primer punto de la
      // serie, y el header contradiría a la curva por ese monto.
      .filter((m) => m.fecha > hoy && m.fecha <= hasta)
      .map<EventoCaja>((m) => ({
        fecha: m.fecha,
        monto: m.monto,
        tipo: m.tipo === "transferencia" || m.tipo === "otro" ? "otro" : m.tipo,
        etiqueta: m.etiqueta,
        origen: "real",
        registrado: true,
        refId: m.ref_id ?? undefined,
        refPeriodo: m.ref_periodo ?? undefined,
      })),
    ...expandirReglas(reglas, hoy, hasta, consumidas),
    ...expandirDeudas(deudas, hoy, hasta, consumidas),
    ...eventosPagoTarjeta(gastosTarjeta, reglas, pagados, hoy, hoy, hasta),
  ].sort((a, b) => (a.fecha === b.fecha ? a.monto - b.monto : a.fecha < b.fecha ? -1 : 1));

  // --- Serie diaria -------------------------------------------------------
  const porDia = new Map<string, number>();
  eventos.forEach((e) => porDia.set(e.fecha, (porDia.get(e.fecha) ?? 0) + e.monto));

  const serie: PuntoSaldo[] = [];
  let saldo = saldoHoy;
  // El mínimo se siembra con el primer punto que produce el bucle, nunca con
  // { hoy, saldoHoy }: ese par no pertenece a la serie cuando hoy trae
  // eventos proyectados, y el marcador del punto más apretado terminaba
  // dibujado fuera de la línea, sobre un saldo que la curva nunca toca.
  let minimo: PuntoSaldo | null = null;
  let bajoColchon: PuntoSaldo | null = null;

  for (let f = hoy; f <= hasta; f = sumarDias(f, 1)) {
    saldo += porDia.get(f) ?? 0;
    const punto = { fecha: f, saldo };
    serie.push(punto);
    if (minimo === null || saldo < minimo.saldo) minimo = punto;
    if (bajoColchon === null && saldo < colchon) bajoColchon = punto;
  }

  return {
    saldoHoy,
    eventos,
    serie,
    // El respaldo cae en `serie[0]`, no en `{ hoy, saldoHoy }`: ese par es
    // justo el que podía no pertenecer a la curva. Así el invariante "el
    // punto más apretado está sobre la línea" se cumple por construcción.
    minimo: minimo ?? serie[0],
    bajoColchon,
    ciclosSinPagar: ciclosSinPagar(gastosTarjeta, pagados, hoy),
  };
}
