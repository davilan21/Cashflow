import { desplazarMes, mesDe } from "@/lib/ciclo";
import type { PlanAjuste, PlanRubro, TipoRubro } from "@/lib/types";

export interface LineaPlan {
  rubroId: string;
  nombre: string;
  monto: number;
  montoDefault: number;
  ajustado: boolean;
}

/** Los meses 'YYYY-MM' desde `atras` antes del mes de `hoy` hasta `adelante` después, ordenados. */
export function rangoMeses(hoy: string, atras: number, adelante: number): string[] {
  const actual = mesDe(hoy);
  const salida: string[] = [];
  for (let d = -atras; d <= adelante; d++) salida.push(desplazarMes(actual, d));
  return salida;
}

/** Vigencia: desde <= mes <= hasta (hasta null = sin fin). Comparación de strings 'YYYY-MM'. */
export function rubroAplica(r: PlanRubro, mes: string): boolean {
  return r.desde <= mes && (r.hasta === null || mes <= r.hasta);
}

/** Las líneas de un tipo vigentes en un mes, con el ajuste del mes aplicado si existe. */
export function lineasDe(rubros: PlanRubro[], ajustes: PlanAjuste[], mes: string, tipo: TipoRubro): LineaPlan[] {
  return rubros
    .filter((r) => r.tipo === tipo && rubroAplica(r, mes))
    .sort((a, b) => a.orden - b.orden || a.created_at.localeCompare(b.created_at))
    .map((r) => {
      const aj = ajustes.find((a) => a.mes === mes && a.rubro_id === r.id);
      return {
        rubroId: r.id,
        nombre: r.nombre,
        monto: aj ? aj.monto : r.monto_default,
        montoDefault: r.monto_default,
        ajustado: Boolean(aj),
      };
    });
}
