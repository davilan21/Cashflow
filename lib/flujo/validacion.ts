/**
 * Validación de los formularios del módulo de flujo.
 *
 * Espeja los CHECK de la migración `0005`, pero en español y antes de salir al
 * servidor: sin esto el usuario recibiría un error de Postgres crudo. La base
 * sigue siendo la garantía real — esto es cortesía, no sustituto.
 */

import type { NuevaRegla, NuevoInstrumento } from "./queries";

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
