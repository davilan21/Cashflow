import { cicloDe, mitadDe } from "./ciclo";
import type { Expense, Settings } from "./types";

export function armarJSON(gastos: Expense[], settings: Settings): string {
  return JSON.stringify(
    {
      tope: settings.tope_ciclo,
      topeQ: settings.tope_quincena,
      gastos: gastos.map((g) => ({
        id: g.id,
        monto: g.monto,
        categoria: g.categoria,
        nota: g.nota ?? "",
        fecha: g.fecha,
      })),
    },
    null,
    2
  );
}

export function armarCSV(gastos: Expense[], nombreCategoria: (id: string) => string): string {
  const filas = [...gastos]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((g) =>
      [
        g.fecha,
        cicloDe(g.fecha),
        mitadDe(g.fecha) === 1 ? "16-fin" : "1-15",
        nombreCategoria(g.categoria),
        `"${(g.nota ?? "").replace(/"/g, "'")}"`,
        g.monto,
      ].join(",")
    );
  return ["fecha,ciclo,quincena,categoria,nota,monto", ...filas].join("\n");
}
