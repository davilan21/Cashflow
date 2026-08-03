import type { Expense } from "./types";

export interface GastoImportado {
  monto: number;
  categoria: string;
  nota: string;
  fecha: string;
}

export interface ImportacionParseada {
  gastos: GastoImportado[];
  tope: number | null;
  topeQ: number | null;
}

/**
 * Acepta el formato exportado por este mismo sistema y por el prototipo
 * original: `{ tope, topeQ, gastos: [{ monto, categoria, nota, fecha }] }`
 * (o un array de gastos suelto). Es el camino de migración desde el
 * prototipo, así que se queda con lo que pueda entender en vez de
 * rechazar todo el archivo por una fila mala.
 */
export function parsearImportacion(texto: string, categoriasValidas: Set<string>): ImportacionParseada | null {
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    return null;
  }

  const lista = Array.isArray(datos)
    ? datos
    : datos && typeof datos === "object" && Array.isArray((datos as Record<string, unknown>).gastos)
      ? (datos as Record<string, unknown>).gastos
      : null;
  if (!Array.isArray(lista)) return null;

  const limpios: GastoImportado[] = lista
    .filter(
      (g): g is Record<string, unknown> =>
        !!g && typeof g === "object" && Number((g as Record<string, unknown>).monto) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(String((g as Record<string, unknown>).fecha))
    )
    .map((g) => ({
      monto: Number(g.monto),
      categoria: categoriasValidas.has(String(g.categoria)) ? String(g.categoria) : "otros",
      nota: String(g.nota ?? ""),
      fecha: String(g.fecha),
    }));
  if (limpios.length === 0) return null;

  const raiz = Array.isArray(datos) ? {} : (datos as Record<string, unknown>);
  const tope = Number(raiz.tope);
  const topeQ = Number(raiz.topeQ);

  return {
    gastos: limpios,
    tope: tope > 0 ? tope : null,
    topeQ: topeQ > 0 ? topeQ : null,
  };
}

const claveGasto = (g: { fecha: string; monto: number; categoria: string; nota: string }) =>
  `${g.fecha}|${g.monto}|${g.categoria}|${g.nota}`;

/** Filtra del import los gastos que ya existen (mismo fecha+monto+categoria+nota), para poder reintentar un mismo backup sin duplicar. */
export function filtrarNuevos(existentes: Expense[], candidatos: GastoImportado[]): GastoImportado[] {
  const vistos = new Set(existentes.map((g) => claveGasto({ fecha: g.fecha, monto: g.monto, categoria: g.categoria, nota: g.nota ?? "" })));
  return candidatos.filter((g) => !vistos.has(claveGasto(g)));
}
