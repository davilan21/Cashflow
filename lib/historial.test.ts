import { describe, it, expect } from "vitest";
import { calcularResumenCiclos, calcularRubros } from "./historial";
import type { Expense } from "./types";

const g = (over: Partial<Expense>): Expense => ({
  id: over.id ?? Math.random().toString(36),
  user_id: "u1",
  fecha: "2026-08-01",
  monto: 1000,
  categoria: "otros",
  nota: null,
  created_at: "",
  updated_at: "",
  ...over,
});

describe("calcularResumenCiclos", () => {
  it("vacío si no hay gastos", () => {
    expect(calcularResumenCiclos([], "2026-08")).toEqual([]);
  });

  it("agrupa un solo gasto en su ciclo", () => {
    const r = calcularResumenCiclos([g({ fecha: "2026-08-01", monto: 5000 })], "2026-08");
    expect(r).toHaveLength(1);
    expect(r[0].ciclo).toBe("2026-08");
    expect(r[0].total).toBe(5000);
    expect(r[0].enCurso).toBe(true);
  });

  it("incluye ciclos intermedios sin movimientos, en cero", () => {
    const r = calcularResumenCiclos(
      [g({ fecha: "2026-06-01", monto: 1000 }), g({ fecha: "2026-08-01", monto: 2000 })],
      "2026-08"
    );
    expect(r.map((x) => x.ciclo)).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(r[1].total).toBe(0);
    expect(r[1].enCurso).toBe(false);
  });

  it("separa m1 (16 al fin) y m2 (1 al 15) y calcula la categoría con más gasto", () => {
    const gastos = [
      g({ fecha: "2026-07-20", monto: 100000, categoria: "mercado" }), // m1 del ciclo 2026-08
      g({ fecha: "2026-08-05", monto: 30000, categoria: "transporte" }), // m2
      g({ fecha: "2026-08-10", monto: 20000, categoria: "transporte" }),
    ];
    const [r] = calcularResumenCiclos(gastos, "2026-08");
    expect(r.m1).toBe(100000);
    expect(r.m2).toBe(50000);
    expect(r.total).toBe(150000);
    expect(r.topCategoria).toBe("mercado");
  });

  it("un gasto del 16 y otro del 14 del mes siguiente caen en el mismo resumen de ciclo", () => {
    const gastos = [g({ fecha: "2026-07-16", monto: 1000 }), g({ fecha: "2026-08-14", monto: 2000 })];
    const r = calcularResumenCiclos(gastos, "2026-08");
    expect(r).toHaveLength(1);
    expect(r[0].total).toBe(3000);
  });
});

describe("calcularRubros", () => {
  it("acumula por categoría y calcula el share sobre el total de la ventana", () => {
    const ventana = calcularResumenCiclos(
      [g({ fecha: "2026-08-01", monto: 3000, categoria: "mercado" }), g({ fecha: "2026-08-02", monto: 1000, categoria: "ocio" })],
      "2026-08"
    );
    const rubros = calcularRubros(ventana, []);
    expect(rubros[0]).toMatchObject({ id: "mercado", monto: 3000, share: 75 });
    expect(rubros[1]).toMatchObject({ id: "ocio", monto: 1000, share: 25 });
    expect(rubros[0].delta).toBeNull();
  });

  it("calcula la variación porcentual contra la ventana anterior", () => {
    const previa = calcularResumenCiclos([g({ fecha: "2026-07-01", monto: 1000, categoria: "mercado" })], "2026-07");
    const actual = calcularResumenCiclos([g({ fecha: "2026-08-01", monto: 1500, categoria: "mercado" })], "2026-08");
    const rubros = calcularRubros(actual, previa);
    expect(rubros[0].delta).toBe(50);
  });
});
