/**
 * Amortización de deudas.
 *
 * Las deudas se configuran y se confirman a mano — no se detectan por correo.
 * Lo que sí es automático es proyectar sus cuotas futuras, y de eso se encarga
 * este módulo: funciones puras, sin Supabase ni React, igual que `lib/ciclo.ts`.
 *
 * Todo el dinero son enteros de pesos. Los redondeos se acumulan en la última
 * cuota, que es lo que hace un banco: las N-1 primeras son iguales y la última
 * cuadra el saldo exacto.
 */

import { diasEnMes, desplazarMes, mesDe, diaDe } from "@/lib/ciclo";
import type { CuotaProyectada, Deuda } from "./tipos";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Cuota fija por el sistema francés: cuota = P·i / (1 − (1+i)^−n).
 * Con tasa 0 no hay intereses y la cuota es simplemente el saldo repartido.
 */
export function cuotaFrancesa(saldo: number, tasaMensual: number, n: number): number {
  if (n <= 0) return 0;
  if (tasaMensual === 0) return Math.round(saldo / n);
  const factor = Math.pow(1 + tasaMensual, -n);
  return Math.round((saldo * tasaMensual) / (1 - factor));
}

/**
 * La fecha de la cuota número `i` (1 = la primera pendiente), contando meses
 * desde el mes de `saldo_a_fecha`.
 *
 * El día se recorta al último del mes cuando no existe — un crédito que se
 * paga el 31 se cobra el 28 en febrero. Misma regla que usa `cicloPago()`
 * para el día 30.
 *
 * La primera cuota pendiente cae en el mes de `saldo_a_fecha` si su día de
 * pago todavía no ha pasado a esa fecha; si ya pasó, cae al mes siguiente.
 * Se asume que el saldo informado ya refleja la cuota de ese día.
 */
function fechaCuota(deuda: Deuda, i: number): string {
  const yaPasoEsteMes = diaDe(deuda.saldo_a_fecha) >= deuda.dia_pago;
  const ym = desplazarMes(mesDe(deuda.saldo_a_fecha), i - 1 + (yaPasoEsteMes ? 1 : 0));
  return `${ym}-${pad(Math.min(deuda.dia_pago, diasEnMes(ym)))}`;
}

/**
 * La tabla de amortización de lo que queda por pagar.
 *
 * Si la deuda trae `cuota`, se usa esa y se deriva el saldo mes a mes
 * (interés = saldo × i, abono = cuota − interés): hay créditos cuya cuota real
 * no calza con la fórmula francesa, y mandar la fórmula por encima del dato
 * real produciría una proyección que no coincide con el extracto.
 *
 * Devuelve `[]` para una deuda terminada o inactiva.
 */
export function tablaAmortizacion(deuda: Deuda): CuotaProyectada[] {
  const restantes = deuda.n_cuotas - deuda.cuotas_pagadas;
  if (!deuda.activa || restantes <= 0 || deuda.saldo_actual <= 0) return [];

  const cuotaBase = deuda.cuota ?? cuotaFrancesa(deuda.saldo_actual, deuda.tasa_mensual, restantes);
  const salida: CuotaProyectada[] = [];
  let saldo = deuda.saldo_actual;

  for (let i = 1; i <= restantes; i++) {
    const interes = Math.round(saldo * deuda.tasa_mensual);
    const esUltima = i === restantes;

    // La última cuota cancela el saldo exacto: absorbe todos los redondeos y
    // evita dejar $3 debiendo (o cobrar $3 de más) al final del crédito.
    let cuota = esUltima ? saldo + interes : cuotaBase;
    let abono = cuota - interes;

    // Una cuota que no alcanza a cubrir el interés haría crecer la deuda para
    // siempre. Es un dato mal capturado, no un escenario a proyectar: se
    // cancela el saldo en esta cuota y se corta, en vez de generar una tabla
    // infinita o con saldos que suben.
    if (abono <= 0 && !esUltima) {
      cuota = saldo + interes;
      abono = saldo;
      saldo = 0;
      salida.push({ numero: deuda.cuotas_pagadas + i, fecha: fechaCuota(deuda, i), cuota, interes, abono, saldoDespues: 0 });
      break;
    }

    // Si el abono se pasa del saldo (por redondeo o por una cuota más grande
    // que lo que falta), se cobra solo lo que queda.
    if (abono > saldo) {
      abono = saldo;
      cuota = abono + interes;
    }
    saldo -= abono;

    salida.push({
      numero: deuda.cuotas_pagadas + i,
      fecha: fechaCuota(deuda, i),
      cuota,
      interes,
      abono,
      saldoDespues: saldo,
    });

    if (saldo === 0) break;
  }

  return salida;
}
