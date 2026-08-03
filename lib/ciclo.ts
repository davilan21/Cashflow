/**
 * El ciclo de la tarjeta va del 16 de un mes al 15 del siguiente y se paga
 * el día 30 del mes en que cierra (o el último día del mes si tiene menos
 * de 30). El ciclo se identifica por ese mes de cierre/pago: '2026-08'
 * significa 16 jul – 15 ago, se paga el 30 de agosto.
 *
 * Todas las fechas son strings 'YYYY-MM-DD' y toda la aritmética de mes
 * usa enteros (año*12 + mes) en vez de Date, para no depender de la zona
 * horaria del proceso que ejecuta el código.
 */

const pad = (n: number) => String(n).padStart(2, "0");

function partesFecha(fecha: string): { y: number; m: number; d: number } {
  const [y, m, d] = fecha.split("-").map(Number);
  return { y, m, d };
}

function partesMes(ym: string): { y: number; m: number } {
  const [y, m] = ym.split("-").map(Number);
  return { y, m };
}

/** Today's date in America/Bogota, como 'YYYY-MM-DD', sin importar la zona del servidor. */
export function hoyISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Desplaza un mes 'YYYY-MM' por `delta` meses (puede ser negativo). */
export function desplazarMes(ym: string, delta: number): string {
  const { y, m } = partesMes(ym);
  const total = y * 12 + (m - 1) + delta;
  const nuevoY = Math.floor(total / 12);
  const nuevoM = (total % 12) + 1;
  return `${nuevoY}-${pad(nuevoM)}`;
}

/** Número de días del mes 'YYYY-MM'. */
export function diasEnMes(ym: string): number {
  const { y, m } = partesMes(ym);
  // día 0 del mes siguiente == último día de este mes (UTC evita saltos de zona horaria)
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** A qué ciclo pertenece una fecha. '2026-07-20' -> '2026-08'; '2026-08-03' -> '2026-08'. */
export function cicloDe(fecha: string): string {
  const { y, m, d } = partesFecha(fecha);
  const ym = `${y}-${pad(m)}`;
  return d <= 15 ? ym : desplazarMes(ym, 1);
}

/** Primer día del ciclo (el 16 del mes anterior al de cierre). */
export function cicloInicio(ciclo: string): string {
  return `${desplazarMes(ciclo, -1)}-16`;
}

/** Último día del ciclo (el 15 del mes de cierre). */
export function cicloFin(ciclo: string): string {
  return `${ciclo}-15`;
}

/** Fecha de pago: el 30 del mes de cierre, o el último día si el mes tiene menos de 30. */
export function cicloPago(ciclo: string): string {
  return `${ciclo}-${pad(Math.min(30, diasEnMes(ciclo)))}`;
}

/** Mitad del ciclo a la que pertenece una fecha: 1 = 16 al fin de mes, 2 = 1 al 15. */
export function mitadDe(fecha: string): 1 | 2 {
  return partesFecha(fecha).d >= 16 ? 1 : 2;
}

/** Diferencia en días (isoB - isoA), positiva si isoB es posterior. */
export function diasEntre(isoA: string, isoB: string): number {
  const { y: ya, m: ma, d: da } = partesFecha(isoA);
  const { y: yb, m: mb, d: db } = partesFecha(isoB);
  const a = Date.UTC(ya, ma - 1, da);
  const b = Date.UTC(yb, mb - 1, db);
  return Math.round((b - a) / 86_400_000);
}
