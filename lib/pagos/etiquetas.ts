import { diaDe, diasEntre, mesNum } from "@/lib/ciclo";
import { CORTOS } from "@/lib/labels";
import type { ItemPago } from "./estado";

/** '2026-10-08' → '8 oct'. */
export function etiquetaFechaCorta(fecha: string): string {
  return `${diaDe(fecha)} ${CORTOS[mesNum(fecha) - 1]}`;
}

export function textoEstadoPago(item: ItemPago, hoy: string): string {
  switch (item.estado) {
    case "pagado":
      return `pagado el ${etiquetaFechaCorta(item.pago!.pagadoEl)}`;
    case "vencido": {
      const n = diasEntre(item.vence!, hoy);
      return n === 1 ? "venció ayer" : `venció hace ${n} días`;
    }
    case "vence_pronto": {
      const n = diasEntre(hoy, item.vence!);
      return n === 0 ? "vence hoy" : n === 1 ? "vence mañana" : `vence en ${n} días`;
    }
    case "pendiente":
      return `vence el ${etiquetaFechaCorta(item.vence!)}`;
    case "sin_dia":
      return "sin día de pago";
  }
}
