import { cicloDe, cicloFin, cicloInicio, desplazarMes, diasCorridosEnRango, diasEntre, mesDe } from "@/lib/ciclo";
import type { Expense, PlanAjuste, PlanRubro, TipoRubro } from "@/lib/types";
import type { OrigenTC } from "./etiquetas";

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

export type EstadoCiclo = "cerrado" | "en_curso" | "no_iniciado";

export interface TCPlan {
  monto: number;
  origen: OrigenTC;
  editable: boolean;
  ciclo: string;
  /** El valor sin ajuste manual (factura, ritmo o promedio). */
  referencia: number;
  /** Cuál de los tres es la referencia. Igual a `origen` salvo cuando hay ajuste manual. */
  origenReferencia: Exclude<OrigenTC, "manual">;
}

export function estadoCiclo(ciclo: string, hoy: string): EstadoCiclo {
  if (hoy > cicloFin(ciclo)) return "cerrado";
  if (hoy < cicloInicio(ciclo)) return "no_iniciado";
  return "en_curso";
}

export function totalCiclo(gastos: Expense[], ciclo: string): number {
  return gastos.filter((g) => cicloDe(g.fecha) === ciclo).reduce((s, g) => s + g.monto, 0);
}

/**
 * Promedio de los últimos `n` ciclos cerrados con gasto > 0. Un ciclo cerrado
 * en cero no cuenta (no arrastra el promedio hacia abajo). null si no hay
 * ninguno con datos.
 */
export function promedioCiclosCerrados(gastos: Expense[], hoy: string, n = 3): number | null {
  if (gastos.length === 0) return null;
  const cicloMin = gastos.map((g) => cicloDe(g.fecha)).sort()[0];
  const totales: number[] = [];
  let c = desplazarMes(cicloDe(hoy), -1); // el anterior al que contiene hoy: el primero cerrado
  while (c >= cicloMin && totales.length < n) {
    const t = totalCiclo(gastos, c);
    if (t > 0) totales.push(t);
    c = desplazarMes(c, -1);
  }
  if (totales.length === 0) return null;
  return Math.round(totales.reduce((s, t) => s + t, 0) / totales.length);
}

/**
 * La factura que sale de la caja en el mes M es la del ciclo M−1: cierra el 15
 * de M−1 y se paga a comienzos de M (p. ej. el ciclo 16-ago..15-sep se paga el
 * 2-oct). Los ajustes manuales de TC se guardan por mes de pago, no por ciclo.
 */
export function cicloQuePagaEn(mes: string): string {
  return desplazarMes(mes, -1);
}

export function calcularTC(gastos: Expense[], ajustes: PlanAjuste[], mes: string, hoy: string): TCPlan {
  const ciclo = cicloQuePagaEn(mes);
  const estado = estadoCiclo(ciclo, hoy);
  const real = totalCiclo(gastos, ciclo);

  if (estado === "cerrado") {
    // La factura ya está. Un ajuste guardado antes del cierre se ignora.
    return { monto: real, origen: "real", editable: false, ciclo, referencia: real, origenReferencia: "real" };
  }

  const manual = ajustes.find((a) => a.mes === mes && a.rubro_id === null);

  if (estado === "en_curso") {
    const inicio = cicloInicio(ciclo);
    const fin = cicloFin(ciclo);
    const largo = diasEntre(inicio, fin) + 1;
    const corridos = diasCorridosEnRango(inicio, fin, hoy);
    const ritmo = corridos > 0 ? Math.round((real / corridos) * largo) : 0;
    return manual
      ? { monto: manual.monto, origen: "manual", editable: true, ciclo, referencia: ritmo, origenReferencia: "ritmo" }
      : { monto: ritmo, origen: "ritmo", editable: true, ciclo, referencia: ritmo, origenReferencia: "ritmo" };
  }

  const promedio = promedioCiclosCerrados(gastos, hoy);
  const referencia = promedio ?? 0;
  const origenReferencia = promedio === null ? "sin_datos" : "promedio";
  if (manual) return { monto: manual.monto, origen: "manual", editable: true, ciclo, referencia, origenReferencia };
  if (promedio === null) return { monto: 0, origen: "sin_datos", editable: true, ciclo, referencia: 0, origenReferencia };
  return { monto: promedio, origen: "promedio", editable: true, ciclo, referencia, origenReferencia };
}

export interface MesPlan {
  mes: string;
  esActual: boolean;
  ingresos: LineaPlan[];
  fijos: LineaPlan[];
  totalIngresos: number;
  totalFijos: number;
  tc: TCPlan;
  /** null si no hay ningún rubro de ingreso vigente: la UI muestra "—". */
  ahorro: number | null;
  /** Suma de ahorros desde el mes actual (incluido). null en meses pasados. */
  acumulado: number | null;
}

const suma = (lineas: LineaPlan[]) => lineas.reduce((s, l) => s + l.monto, 0);

export function calcularPlan(opts: {
  rubros: PlanRubro[];
  ajustes: PlanAjuste[];
  gastos: Expense[];
  hoy: string;
  mesesAtras?: number;
  mesesAdelante?: number;
}): MesPlan[] {
  const { rubros, ajustes, gastos, hoy, mesesAtras = 3, mesesAdelante = 6 } = opts;
  const mesActual = mesDe(hoy);
  let acumulado: number | null = null;

  return rangoMeses(hoy, mesesAtras, mesesAdelante).map((mes) => {
    const ingresos = lineasDe(rubros, ajustes, mes, "ingreso");
    const fijos = lineasDe(rubros, ajustes, mes, "fijo");
    const totalIngresos = suma(ingresos);
    const totalFijos = suma(fijos);
    const tc = calcularTC(gastos, ajustes, mes, hoy);
    const ahorro = ingresos.length === 0 ? null : totalIngresos - totalFijos - tc.monto;

    const esActual = mes === mesActual;
    if (mes >= mesActual && ahorro !== null) acumulado = (acumulado ?? 0) + ahorro;

    return {
      mes,
      esActual,
      ingresos,
      fijos,
      totalIngresos,
      totalFijos,
      tc,
      ahorro,
      acumulado: mes < mesActual ? null : acumulado,
    };
  });
}
