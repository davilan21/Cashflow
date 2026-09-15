import type { FuenteTrm, Trm } from "@/lib/types";

export interface TrmObtenida {
  valor: number;
  fecha: string;
  fuente: "datos.gov.co";
}

/** Dataset abierto "TRM" del Banco de la República en datos.gov.co (Socrata, sin llave). */
export const URL_TRM = "https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=1";

const MIN = 1000;
const MAX = 20000;

/**
 * Trae la TRM más reciente. Devuelve { data, error }: nunca lanza, nunca
 * inventa un valor. Cada causa de fallo tiene su mensaje para que la UI lo diga.
 */
export async function obtenerTrmDatosGov(fetchFn: typeof fetch, timeoutMs = 5000): Promise<{ data: TrmObtenida | null; error: string | null }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchFn(URL_TRM, { signal: ctrl.signal, headers: { Accept: "application/json" } });
  } catch (e) {
    clearTimeout(timer);
    const esTimeout = e instanceof Error && e.name === "AbortError";
    return { data: null, error: esTimeout ? "datos.gov.co no respondió a tiempo" : `no se pudo conectar con datos.gov.co: ${e instanceof Error ? e.message : String(e)}` };
  }
  clearTimeout(timer);
  if (!res.ok) return { data: null, error: `datos.gov.co respondió ${res.status}` };

  let cuerpo: unknown;
  try {
    cuerpo = await res.json();
  } catch {
    return { data: null, error: "respuesta inválida de datos.gov.co (no es JSON)" };
  }
  if (!Array.isArray(cuerpo) || cuerpo.length === 0) return { data: null, error: "datos.gov.co devolvió sin datos" };

  const fila = cuerpo[0] as { valor?: unknown; vigenciadesde?: unknown };
  const valor = Number(fila.valor);
  if (!Number.isFinite(valor) || valor < MIN || valor > MAX) return { data: null, error: `TRM fuera de rango: ${String(fila.valor)}` };
  const fecha = typeof fila.vigenciadesde === "string" ? fila.vigenciadesde.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] : undefined;
  if (!fecha) return { data: null, error: "fecha de vigencia ilegible" };

  return { data: { valor, fecha, fuente: "datos.gov.co" }, error: null };
}

/** Si ya hay TRM de hoy en la base, esa manda (puede ser manual); si no, se consulta afuera. */
export async function resolverTrmDeHoy(opts: { filaHoy: Trm | null; fetchFn: typeof fetch }): Promise<{
  data: { valor: number; fecha: string; fuente: FuenteTrm } | null;
  error: string | null;
  llamoAfuera: boolean;
}> {
  if (opts.filaHoy) {
    const { valor, fecha, fuente } = opts.filaHoy;
    return { data: { valor, fecha, fuente }, error: null, llamoAfuera: false };
  }
  const r = await obtenerTrmDatosGov(opts.fetchFn);
  return { ...r, llamoAfuera: true };
}
