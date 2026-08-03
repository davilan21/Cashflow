import { cicloDe, mitadDe, desplazarMes } from "./ciclo";
import type { Expense } from "./types";

export interface ResumenCiclo {
  ciclo: string;
  total: number;
  m1: number;
  m2: number;
  porCategoria: Record<string, number>;
  topCategoria: string | null;
  enCurso: boolean;
}

/** Un resumen por ciclo desde el primer gasto hasta el ciclo actual, incluyendo ciclos sin movimientos. */
export function calcularResumenCiclos(gastos: Expense[], cicloHoy: string): ResumenCiclo[] {
  if (gastos.length === 0) return [];
  const ciclos = gastos.map((g) => cicloDe(g.fecha)).sort();
  let c = ciclos[0];
  const salida: ResumenCiclo[] = [];

  while (c <= cicloHoy) {
    const items = gastos.filter((g) => cicloDe(g.fecha) === c);
    const porCategoria: Record<string, number> = {};
    items.forEach((g) => {
      porCategoria[g.categoria] = (porCategoria[g.categoria] ?? 0) + g.monto;
    });
    const top = Object.entries(porCategoria).sort((a, b) => b[1] - a[1])[0];

    salida.push({
      ciclo: c,
      total: items.reduce((s, g) => s + g.monto, 0),
      m1: items.filter((g) => mitadDe(g.fecha) === 1).reduce((s, g) => s + g.monto, 0),
      m2: items.filter((g) => mitadDe(g.fecha) === 2).reduce((s, g) => s + g.monto, 0),
      porCategoria,
      topCategoria: top ? top[0] : null,
      enCurso: c === cicloHoy,
    });
    c = desplazarMes(c, 1);
  }
  return salida;
}

export interface Rubro {
  id: string;
  monto: number;
  share: number;
  serie: number[];
  delta: number | null;
}

/** Acumulado por categoría en la ventana visible, con variación contra la ventana anterior equivalente. */
export function calcularRubros(ventana: ResumenCiclo[], ventanaPrevia: ResumenCiclo[]): Rubro[] {
  const acumulado: Record<string, number> = {};
  const previo: Record<string, number> = {};
  ventana.forEach((r) =>
    Object.entries(r.porCategoria).forEach(([k, v]) => {
      acumulado[k] = (acumulado[k] ?? 0) + v;
    })
  );
  ventanaPrevia.forEach((r) =>
    Object.entries(r.porCategoria).forEach(([k, v]) => {
      previo[k] = (previo[k] ?? 0) + v;
    })
  );
  const totalAcumulado = Object.values(acumulado).reduce((s, v) => s + v, 0) || 1;

  return Object.entries(acumulado)
    .sort((a, b) => b[1] - a[1])
    .map(([id, monto]) => ({
      id,
      monto,
      share: (monto / totalAcumulado) * 100,
      serie: ventana.map((r) => r.porCategoria[id] ?? 0),
      delta: previo[id] ? ((monto - previo[id]) / previo[id]) * 100 : null,
    }));
}
