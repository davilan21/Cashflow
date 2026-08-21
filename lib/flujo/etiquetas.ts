/** Textos legibles para el módulo de flujo. */

import { MESES } from "@/lib/labels";
import type { EventoCaja, Frecuencia, Regla, TipoRegla } from "./tipos";

export const TIPOS_REGLA: { id: TipoRegla; etiqueta: string }[] = [
  { id: "ingreso", etiqueta: "Ingreso" },
  { id: "gasto_fijo", etiqueta: "Gasto fijo" },
  { id: "aporte_inversion", etiqueta: "Aporte a inversión" },
];

export const FRECUENCIAS: { id: Frecuencia; etiqueta: string }[] = [
  { id: "quincenal", etiqueta: "Quincenal" },
  { id: "mensual", etiqueta: "Mensual" },
  { id: "bimestral", etiqueta: "Bimestral" },
  { id: "anual", etiqueta: "Anual" },
  { id: "unica", etiqueta: "Una sola vez" },
];

export const BANCOS = [
  { id: "bancolombia", etiqueta: "Bancolombia" },
  { id: "davibank", etiqueta: "Davibank" },
  { id: "otro", etiqueta: "Otro" },
] as const;

export const TIPOS_INSTRUMENTO = [
  { id: "ahorros", etiqueta: "Ahorros" },
  { id: "corriente", etiqueta: "Corriente" },
  { id: "tc", etiqueta: "Tarjeta de crédito" },
  { id: "efectivo", etiqueta: "Efectivo" },
] as const;

export const TIPOS_DEUDA = [
  { id: "credito", etiqueta: "Crédito de consumo" },
  { id: "libranza", etiqueta: "Libranza" },
  { id: "hipoteca", etiqueta: "Hipoteca" },
  { id: "vehiculo", etiqueta: "Vehículo" },
  { id: "otro", etiqueta: "Otro" },
] as const;

export const MEDIOS_PAGO = [
  { id: "debito", etiqueta: "Débito" },
  { id: "tc", etiqueta: "Tarjeta de crédito" },
  { id: "efectivo", etiqueta: "Efectivo" },
] as const;

export function etiquetaTipoRegla(tipo: TipoRegla): string {
  return TIPOS_REGLA.find((t) => t.id === tipo)?.etiqueta ?? tipo;
}

/** Cuándo cae una regla, en una línea: "Cada mes el 5", "El 15 y el 30". */
export function resumenRegla(regla: Regla): string {
  const { frecuencia, dia_1, dia_2, mes } = regla;
  if (frecuencia === "quincenal") return `El ${dia_1} y el ${dia_2} de cada mes`;
  if (frecuencia === "mensual") return `Cada mes el ${dia_1}`;
  if (frecuencia === "bimestral") return `Cada dos meses, el ${dia_1}`;
  if (frecuencia === "anual") return `Cada ${mes ? MESES[mes - 1] : "año"} el ${dia_1}`;
  return `Una sola vez, el ${dia_1}`;
}

/**
 * Por qué una regla no toca la caja en su fecha.
 *
 * Un gasto fijo cargado a la tarjeta no sale del banco el día del cobro: sale
 * el día que se paga el ciclo. Vale la pena decírselo al usuario en la lista,
 * porque si no parece que la app se está olvidando de ese gasto.
 */
export function notaMedioPago(regla: Regla): string | null {
  if (regla.tipo !== "gasto_fijo" || regla.medio_pago !== "tc") return null;
  return "Va a la tarjeta: sale de la caja el día que pagas el ciclo";
}

/**
 * La nota corta que acompaña a un evento en la lista y en el tooltip.
 *
 * El HECHO manda sobre la certeza del monto. Un pago de tarjeta de un ciclo
 * cerrado tiene el total exacto y aun así nadie lo ha pagado: rotularlo
 * "confirmado" es lo que hace que alguien no pague la tarjeta, y es el error
 * más caro del módulo.
 *
 * Dice "registrado", no "confirmado", por dos razones: `registrado` incluye
 * movimientos con fecha futura (anotar hoy un pago programado para el 30),
 * así que afirmar que ya ocurrió sería el mismo error al revés; y
 * "confirmado" ya es el estado de la bandeja de pendientes.
 */
export function notaEvento(evento: EventoCaja): string | null {
  if (evento.registrado) return "registrado";
  if (evento.origen === "estimado") return "estimado";
  // Solo el pago de tarjeta se anuncia sin registrar: es el único que exige
  // que el usuario haga algo. Un arriendo proyectado no necesita aviso.
  if (evento.tipo === "pago_tc") return "monto final, sin registrar";
  return null;
}
