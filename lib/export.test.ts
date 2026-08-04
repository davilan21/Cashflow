import { describe, it, expect } from "vitest";
import { armarJSON, armarCSV } from "./export";
import type { Expense, Settings } from "./types";

const settings: Settings = {
  cuenta_id: "c1",
  tope_ciclo: 4_000_000,
  tope_quincena: 2_000_000,
  dia_corte: 15,
  dia_pago: 30,
  updated_at: "",
};

const gasto = (over: Partial<Expense>): Expense => ({
  id: "id-1",
  cuenta_id: "c1",
  fecha: "2026-08-01",
  monto: 200000,
  categoria: "restaurantes",
  nota: "almuerzo",
  created_by: "u1",
  created_at: "",
  updated_at: "",
  ...over,
});

describe("armarJSON", () => {
  it("produce el formato de migración esperado: tope, topeQ, gastos", () => {
    const json = JSON.parse(armarJSON([gasto({})], settings));
    expect(json.tope).toBe(4_000_000);
    expect(json.topeQ).toBe(2_000_000);
    expect(json.gastos).toEqual([{ id: "id-1", monto: 200000, categoria: "restaurantes", nota: "almuerzo", fecha: "2026-08-01" }]);
  });

  it("nota null se exporta como cadena vacía", () => {
    const json = JSON.parse(armarJSON([gasto({ nota: null })], settings));
    expect(json.gastos[0].nota).toBe("");
  });
});

describe("armarCSV", () => {
  it("incluye encabezado y columnas fecha,ciclo,quincena,categoria,nota,monto", () => {
    const csv = armarCSV([gasto({ fecha: "2026-08-01" })], () => "Restaurantes y domicilios");
    const [encabezado, fila] = csv.split("\n");
    expect(encabezado).toBe("fecha,ciclo,quincena,categoria,nota,monto");
    expect(fila).toBe('2026-08-01,2026-08,1-15,Restaurantes y domicilios,"almuerzo",200000');
  });

  it("marca la quincena 16-fin para la primera mitad del ciclo", () => {
    const csv = armarCSV([gasto({ fecha: "2026-07-20" })], () => "x");
    expect(csv.split("\n")[1]).toContain(",16-fin,");
  });

  it("escapa comillas dobles en la nota", () => {
    const csv = armarCSV([gasto({ nota: 'con "comillas"' })], () => "x");
    expect(csv).toContain(`"con 'comillas'"`);
  });
});
