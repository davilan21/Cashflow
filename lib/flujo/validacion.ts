/**
 * Validación de los formularios del módulo de flujo.
 *
 * Espeja los CHECK de la migración `0005`, pero en español y antes de salir al
 * servidor: sin esto el usuario recibiría un error de Postgres crudo. La base
 * sigue siendo la garantía real — esto es cortesía, no sustituto.
 */

import type { NuevaDeuda, NuevaRegla, NuevoInstrumento } from "./queries";

export function validarRegla(r: NuevaRegla): string | null {
  if (!r.nombre.trim()) return "Ponle un nombre";
  if (!Number.isFinite(r.monto) || r.monto <= 0) return "El monto tiene que ser mayor que cero";
  if (!Number.isFinite(r.dia_1) || r.dia_1 < 1 || r.dia_1 > 31) return "El día tiene que estar entre 1 y 31";
  if (r.frecuencia === "quincenal") {
    if (!r.dia_2) return "Una regla quincenal necesita sus dos días";
    if (r.dia_2 < 1 || r.dia_2 > 31) return "El segundo día tiene que estar entre 1 y 31";
    if (r.dia_2 === r.dia_1) return "Los dos días tienen que ser distintos";
  }
  if (r.frecuencia === "anual" && !r.mes) return "Elige en qué mes cae";
  if (r.tipo === "gasto_fijo" && !r.medio_pago) return "Falta el medio de pago";
  if (r.hasta && r.hasta < r.desde) return "La fecha de fin no puede ser anterior a la de inicio";
  return null;
}

export function validarInstrumento(i: NuevoInstrumento): string | null {
  if (!i.nombre.trim()) return "Ponle un nombre";
  if (i.ultimos4 && !/^\d{4}$/.test(i.ultimos4)) return "Los últimos dígitos son exactamente cuatro números";
  return null;
}

export function validarDeuda(d: NuevaDeuda): string | null {
  if (!d.nombre.trim()) return "Ponle un nombre";
  if (!Number.isFinite(d.saldo_actual) || d.saldo_actual < 0) return "El saldo no puede ser negativo";
  if (!Number.isFinite(d.n_cuotas) || d.n_cuotas < 1) return "El crédito tiene que tener al menos una cuota";
  if (!Number.isFinite(d.cuotas_pagadas) || d.cuotas_pagadas < 0) return "Las cuotas pagadas no pueden ser negativas";
  if (d.cuotas_pagadas > d.n_cuotas) return "No puedes tener más cuotas pagadas que el total";
  if (!Number.isFinite(d.dia_pago) || d.dia_pago < 1 || d.dia_pago > 31) return "El día de pago tiene que estar entre 1 y 31";
  if (!Number.isFinite(d.tasa_mensual) || d.tasa_mensual < 0 || d.tasa_mensual >= 1)
    return "La tasa mensual tiene que estar entre 0% y 100%";
  if (d.cuota !== null && (!Number.isFinite(d.cuota) || d.cuota <= 0)) return "La cuota tiene que ser mayor que cero";
  // Una cuota que no cubre ni el interés haría crecer la deuda para siempre.
  // Es un dato mal capturado, y avisarlo acá es mejor que proyectar una tabla
  // que la amortización va a tener que cortar a la fuerza.
  if (d.cuota !== null && d.saldo_actual > 0 && d.cuota <= Math.round(d.saldo_actual * d.tasa_mensual))
    return "Esa cuota no alcanza a cubrir el interés del mes: revisa el monto o la tasa";
  return null;
}
