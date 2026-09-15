import { MESES, CORTOS } from "@/lib/labels";
import { mesNum } from "@/lib/ciclo";

export type OrigenTC = "real" | "ritmo" | "promedio" | "manual" | "sin_datos";

/** '2026-09' → 'Septiembre 2026'. */
export function etiquetaMes(ym: string): string {
  const nombre = MESES[mesNum(ym) - 1];
  return `${nombre[0].toUpperCase()}${nombre.slice(1)} ${ym.slice(0, 4)}`;
}

/** '2026-09' → 'sep 26'. */
export function etiquetaMesCorta(ym: string): string {
  return `${CORTOS[mesNum(ym) - 1]} ${ym.slice(2, 4)}`;
}

/** Cómo se lee la vigencia de un rubro en la lista. */
export function etiquetaVigencia(desde: string, hasta: string | null): string {
  if (hasta === null) return `desde ${etiquetaMesCorta(desde)}`;
  if (hasta === desde) return `solo ${etiquetaMesCorta(desde)}`;
  return `${etiquetaMesCorta(desde)} – ${etiquetaMesCorta(hasta)}`;
}

const ORIGEN: Record<OrigenTC, string> = {
  real: "factura",
  ritmo: "a este ritmo",
  promedio: "promedio 3 ciclos",
  manual: "ajustado",
  sin_datos: "sin historial",
};

export function etiquetaOrigenTC(origen: OrigenTC): string {
  return ORIGEN[origen];
}
