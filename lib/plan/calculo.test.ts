import { describe, it, expect } from "vitest";
import { rangoMeses, rubroAplica, lineasDe } from "./calculo";
import type { PlanRubro, PlanAjuste } from "@/lib/types";

// Fábricas: solo lo que importa para el cálculo; el resto es relleno fijo.
export function rubro(p: Partial<PlanRubro> & Pick<PlanRubro, "id" | "tipo" | "monto_default" | "desde">): PlanRubro {
  return {
    cuenta_id: "c1",
    nombre: p.id,
    hasta: null,
    orden: 0,
    created_by: null,
    created_at: "",
    updated_at: "",
    ...p,
  };
}

export function ajuste(mes: string, rubro_id: string | null, monto: number): PlanAjuste {
  return { id: `${mes}-${rubro_id ?? "tc"}`, cuenta_id: "c1", mes, rubro_id, monto, updated_at: "" };
}

describe("rangoMeses", () => {
  it("3 atrás + actual + 6 adelante = 10 meses ordenados", () => {
    const r = rangoMeses("2026-09-14", 3, 6);
    expect(r).toHaveLength(10);
    expect(r[0]).toBe("2026-06");
    expect(r[3]).toBe("2026-09");
    expect(r[9]).toBe("2027-03");
  });
  it("cruza el año", () => {
    const r = rangoMeses("2026-11-02", 3, 6);
    expect(r[0]).toBe("2026-08");
    expect(r[9]).toBe("2027-05");
  });
});

describe("rubroAplica", () => {
  it("desde sin hasta: aplica desde ese mes en adelante", () => {
    const r = rubro({ id: "nomina", tipo: "ingreso", monto_default: 1, desde: "2026-09" });
    expect(rubroAplica(r, "2026-08")).toBe(false);
    expect(rubroAplica(r, "2026-09")).toBe(true);
    expect(rubroAplica(r, "2027-03")).toBe(true);
  });
  it("con hasta: incluye el hasta y excluye el siguiente", () => {
    const r = rubro({ id: "curso", tipo: "fijo", monto_default: 1, desde: "2026-09", hasta: "2026-12" });
    expect(rubroAplica(r, "2026-12")).toBe(true);
    expect(rubroAplica(r, "2027-01")).toBe(false);
  });
  it("puntual: exactamente un mes", () => {
    const r = rubro({ id: "prima", tipo: "ingreso", monto_default: 1, desde: "2026-12", hasta: "2026-12" });
    expect(rubroAplica(r, "2026-11")).toBe(false);
    expect(rubroAplica(r, "2026-12")).toBe(true);
    expect(rubroAplica(r, "2027-01")).toBe(false);
  });
});

describe("lineasDe", () => {
  const rubros = [
    rubro({ id: "nomina", tipo: "ingreso", monto_default: 4_500_000, desde: "2026-01", orden: 0 }),
    rubro({ id: "arriendo", tipo: "fijo", monto_default: 2_000_000, desde: "2026-01", orden: 0 }),
    rubro({ id: "prima", tipo: "ingreso", monto_default: 2_000_000, desde: "2026-12", hasta: "2026-12", orden: 1 }),
  ];

  it("filtra por tipo y vigencia, en orden", () => {
    const sep = lineasDe(rubros, [], "2026-09", "ingreso");
    expect(sep.map((l) => l.rubroId)).toEqual(["nomina"]);
    const dic = lineasDe(rubros, [], "2026-12", "ingreso");
    expect(dic.map((l) => l.rubroId)).toEqual(["nomina", "prima"]);
    expect(lineasDe(rubros, [], "2026-09", "fijo").map((l) => l.rubroId)).toEqual(["arriendo"]);
  });

  it("un ajuste reemplaza el default solo en su mes", () => {
    const ajustes = [ajuste("2026-10", "nomina", 5_000_000)];
    const oct = lineasDe(rubros, ajustes, "2026-10", "ingreso")[0];
    expect(oct).toMatchObject({ monto: 5_000_000, montoDefault: 4_500_000, ajustado: true });
    const nov = lineasDe(rubros, ajustes, "2026-11", "ingreso")[0];
    expect(nov).toMatchObject({ monto: 4_500_000, ajustado: false });
  });
});
