import { describe, it, expect } from "vitest";
import { parsearImportacion, filtrarNuevos } from "./import";
import type { Expense } from "./types";

const CATEGORIAS = new Set(["mercado", "restaurantes", "otros"]);

describe("parsearImportacion", () => {
  it("acepta el formato { tope, topeQ, gastos }", () => {
    const r = parsearImportacion(
      JSON.stringify({ tope: 4000000, topeQ: 2000000, gastos: [{ monto: 200000, categoria: "restaurantes", nota: "almuerzo", fecha: "2026-08-01" }] }),
      CATEGORIAS
    );
    expect(r).not.toBeNull();
    expect(r!.tope).toBe(4000000);
    expect(r!.topeQ).toBe(2000000);
    expect(r!.gastos).toHaveLength(1);
  });

  it("acepta un array de gastos suelto, sin tope/topeQ", () => {
    const r = parsearImportacion(JSON.stringify([{ monto: 1000, categoria: "mercado", fecha: "2026-08-01" }]), CATEGORIAS);
    expect(r).not.toBeNull();
    expect(r!.tope).toBeNull();
    expect(r!.topeQ).toBeNull();
  });

  it("descarta filas sin monto positivo o con fecha inválida, mantiene las buenas", () => {
    const r = parsearImportacion(
      JSON.stringify([
        { monto: 1000, categoria: "mercado", fecha: "2026-08-01" },
        { monto: -5, categoria: "mercado", fecha: "2026-08-01" },
        { monto: 1000, categoria: "mercado", fecha: "no-es-fecha" },
      ]),
      CATEGORIAS
    );
    expect(r!.gastos).toHaveLength(1);
  });

  it("categoría desconocida cae en 'otros' en vez de perder el gasto", () => {
    const r = parsearImportacion(JSON.stringify([{ monto: 1000, categoria: "algo-inventado", fecha: "2026-08-01" }]), CATEGORIAS);
    expect(r!.gastos[0].categoria).toBe("otros");
  });

  it("JSON inválido devuelve null", () => {
    expect(parsearImportacion("esto no es json", CATEGORIAS)).toBeNull();
  });

  it("sin ningún gasto válido devuelve null", () => {
    expect(parsearImportacion(JSON.stringify({ gastos: [] }), CATEGORIAS)).toBeNull();
  });
});

describe("filtrarNuevos", () => {
  const existente: Expense = {
    id: "x",
    cuenta_id: "c1",
    fecha: "2026-08-01",
    monto: 200000,
    categoria: "restaurantes",
    nota: "almuerzo",
    created_by: "u1",
    created_at: "",
    updated_at: "",
  };

  it("descarta candidatos que ya existen (mismo fecha+monto+categoria+nota)", () => {
    const r = filtrarNuevos([existente], [{ monto: 200000, categoria: "restaurantes", nota: "almuerzo", fecha: "2026-08-01" }]);
    expect(r).toHaveLength(0);
  });

  it("conserva candidatos genuinamente nuevos", () => {
    const r = filtrarNuevos([existente], [{ monto: 15000, categoria: "transporte", nota: "bus", fecha: "2026-08-02" }]);
    expect(r).toHaveLength(1);
  });
});
