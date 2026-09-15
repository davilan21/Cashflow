import { CORTOS } from "@/lib/labels";
import { diaDe, mesNum } from "@/lib/ciclo";
import type { Miembro, TipoInstrumento } from "@/lib/types";

export type OrigenValor = { tipo: "valoracion"; fecha: string } | { tipo: "aportado" };
export type EstadoCdt = "vigente" | "por_vencer" | "vencido";

const TIPOS: Record<TipoInstrumento, string> = {
  cdt: "CDT",
  acciones: "Acciones",
  fondo: "Fondo",
  cuenta: "Cuenta",
  otro: "Otro",
};

export function etiquetaTipo(tipo: TipoInstrumento): string {
  return TIPOS[tipo];
}

/** '2026-09-03' → '3 sep'. */
export function etiquetaFecha(iso: string): string {
  return `${diaDe(iso)} ${CORTOS[mesNum(iso) - 1]}`;
}

export function etiquetaVencimiento(estado: EstadoCdt, dias: number, vencimiento: string): string {
  if (estado === "vencido") return "vencido";
  if (estado === "por_vencer") return dias === 0 ? "vence hoy" : `vence en ${dias} días`;
  return `vence ${etiquetaFecha(vencimiento)}`;
}

export function etiquetaOrigenValor(origen: OrigenValor): string {
  return origen.tipo === "valoracion" ? `valorado ${etiquetaFecha(origen.fecha)}` : "= aportado (sin valorar)";
}

/** Apodo del miembro; "Miembro" si no tiene o no está; "Hogar" si el titular es null. */
export function nombreTitular(titular: string | null, miembros: Miembro[]): string {
  if (titular === null) return "Hogar";
  return miembros.find((m) => m.user_id === titular)?.apodo ?? "Miembro";
}
