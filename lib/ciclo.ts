/**
 * El ciclo de la tarjeta va del 15 de un mes al 14 del siguiente y se paga
 * el día 2 del mes posterior al cierre. El ciclo se identifica por su mes de
 * cierre: '2026-08' significa 15 jul – 14 ago, se paga el 2 de septiembre.
 *
 * El banco corta el 15, pero las compras de ese día se facturan en el extracto
 * siguiente y las del 15 del mes anterior entran en este (verificado contra el
 * extracto de la VISA "15 sep - 15 oct 2026": sus 111 compras van del 15 de
 * septiembre al 14 de octubre y suman el "Compras del mes" al peso).
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

/** El mes calendario 'YYYY-MM' de una fecha (no confundir con el ciclo de facturación). */
export function mesDe(fecha: string): string {
  const { y, m } = partesFecha(fecha);
  return `${y}-${pad(m)}`;
}

/** Número de días del mes 'YYYY-MM'. */
export function diasEnMes(ym: string): number {
  const { y, m } = partesMes(ym);
  // día 0 del mes siguiente == último día de este mes (UTC evita saltos de zona horaria)
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** A qué ciclo pertenece una fecha. '2026-07-20' -> '2026-08'; '2026-08-03' -> '2026-08'; '2026-08-15' -> '2026-09'. */
export function cicloDe(fecha: string): string {
  const { y, m, d } = partesFecha(fecha);
  const ym = `${y}-${pad(m)}`;
  return d < 15 ? ym : desplazarMes(ym, 1);
}

/** Primer día del ciclo (el 15 del mes anterior al de cierre). */
export function cicloInicio(ciclo: string): string {
  return `${desplazarMes(ciclo, -1)}-15`;
}

/** Último día del ciclo (el 14 del mes de cierre). */
export function cicloFin(ciclo: string): string {
  return `${ciclo}-14`;
}

/** Fecha de pago: el 2 del mes siguiente al de cierre. */
export function cicloPago(ciclo: string): string {
  return `${desplazarMes(ciclo, 1)}-02`;
}

/** Mitad del ciclo a la que pertenece una fecha: 1 = 15 al fin de mes, 2 = 1 al 14. */
export function mitadDe(fecha: string): 1 | 2 {
  return partesFecha(fecha).d >= 15 ? 1 : 2;
}

/** Último día de la primera mitad del ciclo (15 al fin del mes anterior al de cierre). */
export function mitad1Fin(ciclo: string): string {
  const mesPrev = desplazarMes(ciclo, -1);
  return `${mesPrev}-${pad(diasEnMes(mesPrev))}`;
}

/** Primer día de la segunda mitad del ciclo (el 1 del mes de cierre). */
export function mitad2Inicio(ciclo: string): string {
  return `${ciclo}-01`;
}

/** Diferencia en días (isoB - isoA), positiva si isoB es posterior. */
export function diasEntre(isoA: string, isoB: string): number {
  const { y: ya, m: ma, d: da } = partesFecha(isoA);
  const { y: yb, m: mb, d: db } = partesFecha(isoB);
  const a = Date.UTC(ya, ma - 1, da);
  const b = Date.UTC(yb, mb - 1, db);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Días transcurridos dentro de [inicio, fin] evaluados en `hoy`, con tope en
 * el largo del rango: 0 si `hoy` es anterior al rango, el largo completo si
 * es posterior o igual al fin. Sirve para proyectar gasto de una quincena
 * específica igual que ya se hace para el ciclo completo.
 */
export function diasCorridosEnRango(inicio: string, fin: string, hoy: string): number {
  if (hoy < inicio) return 0;
  if (hoy >= fin) return diasEntre(inicio, fin) + 1;
  return diasEntre(inicio, hoy) + 1;
}

/** Suma (o resta, con n negativo) días a una fecha. */
export function sumarDias(iso: string, n: number): string {
  const { y, m, d } = partesFecha(iso);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Día de la semana: 0 = domingo … 6 = sábado. */
export function diaSemana(iso: string): number {
  const { y, m, d } = partesFecha(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Día del mes de una fecha 'YYYY-MM-DD'. */
export function diaDe(fecha: string): number {
  return partesFecha(fecha).d;
}

/** Mes (1-12) de un 'YYYY-MM' o 'YYYY-MM-DD'. */
export function mesNum(fechaOMes: string): number {
  return Number(fechaOMes.slice(5, 7));
}

/** Convierte 'YYYY-MM-DD' a un Date anclado en UTC (solo para lo que necesite un objeto Date, p.ej. getUTCDay). */
export function aDate(fecha: string): Date {
  const { y, m, d } = partesFecha(fecha);
  return new Date(Date.UTC(y, m - 1, d));
}
