import { desplazarMes, diasEnMes, diasEntre, mesDe } from "@/lib/ciclo";
import { lineasDe } from "@/lib/plan/calculo";
import type { PlanAjuste, PlanPago, PlanRubro } from "@/lib/types";

export type EstadoPago = "pagado" | "vencido" | "vence_pronto" | "pendiente" | "sin_dia";

export interface ItemPago {
  rubroId: string;
  nombre: string;
  mes: string;
  /** 'YYYY-MM-DD', o null si el fijo no tiene día de pago (solo en el mes actual). */
  vence: string | null;
  /** El estimado del Plan para ese mes (ajuste o default). */
  montoSugerido: number;
  pago: { monto: number; pagadoEl: string } | null;
  estado: EstadoPago;
}

/** Cuántos días antes del vencimiento un fijo pasa a "vence pronto". */
export const DIAS_PRONTO = 3;

/** El día de pago en ese mes; si el mes no tiene ese día, el último día del mes. */
export function fechaVencimiento(mes: string, diaPago: number | null): string | null {
  if (diaPago === null) return null;
  return `${mes}-${String(Math.min(diaPago, diasEnMes(mes))).padStart(2, "0")}`;
}

export function estadoPago(vence: string | null, pagado: boolean, hoy: string): EstadoPago {
  if (pagado) return "pagado";
  if (vence === null) return "sin_dia";
  const faltan = diasEntre(hoy, vence);
  if (faltan < 0) return "vencido";
  if (faltan <= DIAS_PRONTO) return "vence_pronto";
  return "pendiente";
}

function itemsDelMes(rubros: PlanRubro[], ajustes: PlanAjuste[], pagos: PlanPago[], mes: string, hoy: string, mesCerrado: boolean): ItemPago[] {
  const diaDe = new Map(rubros.map((r) => [r.id, r.dia_pago]));
  return lineasDe(rubros, ajustes, mes, "fijo", pagos).map((l) => {
    // Un mes que ya terminó vence a más tardar su último día, tenga o no día de pago.
    const vence = fechaVencimiento(mes, diaDe.get(l.rubroId) ?? (mesCerrado ? 31 : null));
    return {
      rubroId: l.rubroId,
      nombre: l.nombre,
      mes,
      vence,
      montoSugerido: l.estimado,
      pago: l.pagado,
      estado: estadoPago(vence, l.pagado !== null, hoy),
    };
  });
}

/**
 * El mes actual completo más lo que quedó sin pagar del mes anterior. Nada más
 * atrás: si no, aparecerían vencidos todos los meses previos a que existiera el módulo.
 */
export function itemsPagos(rubros: PlanRubro[], ajustes: PlanAjuste[], pagos: PlanPago[], hoy: string): ItemPago[] {
  const mes = mesDe(hoy);
  const anteriores = itemsDelMes(rubros, ajustes, pagos, desplazarMes(mes, -1), hoy, true).filter((i) => i.estado !== "pagado");
  return [...anteriores, ...itemsDelMes(rubros, ajustes, pagos, mes, hoy, false)];
}

export interface GruposPagos {
  vencidos: ItemPago[];
  pronto: ItemPago[];
  pendientes: ItemPago[];
  sinDia: ItemPago[];
  pagados: ItemPago[];
}

const porVencimiento = (a: ItemPago, b: ItemPago) =>
  (a.vence ?? "9999").localeCompare(b.vence ?? "9999") || a.nombre.localeCompare(b.nombre);

export function agruparPagos(items: ItemPago[]): GruposPagos {
  const de = (e: ItemPago["estado"]) => items.filter((i) => i.estado === e).sort(porVencimiento);
  return { vencidos: de("vencido"), pronto: de("vence_pronto"), pendientes: de("pendiente"), sinDia: de("sin_dia"), pagados: de("pagado") };
}

/** Lo que necesita atención: vencidos (incluido el mes anterior) + los que vencen pronto. */
export function contadorPagos(items: ItemPago[]): number {
  return items.filter((i) => i.estado === "vencido" || i.estado === "vence_pronto").length;
}

/** Totales del mes `mes` (el actual): lo pagado real, el total con pagos reales y los que faltan. */
export function resumenPagos(items: ItemPago[], mes: string): { pagado: number; total: number; faltan: number } {
  const delMes = items.filter((i) => i.mes === mes);
  return {
    pagado: delMes.reduce((s, i) => s + (i.pago?.monto ?? 0), 0),
    total: delMes.reduce((s, i) => s + (i.pago?.monto ?? i.montoSugerido), 0),
    faltan: delMes.filter((i) => i.pago === null).length,
  };
}
