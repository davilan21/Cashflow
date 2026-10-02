import { describe, it, expect } from "vitest";
import { rangoMeses, rubroAplica, lineasDe, estadoCiclo, totalCiclo, promedioCiclosCerrados, calcularTC, calcularPlan } from "./calculo";
import type { PlanRubro, PlanAjuste, Expense } from "@/lib/types";

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

function gasto(fecha: string, monto: number): Expense {
  return { id: `${fecha}-${monto}`, cuenta_id: "c1", fecha, monto, categoria: "otros", nota: null, created_by: null, created_at: "", updated_at: "" };
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

describe("estadoCiclo", () => {
  it("hoy 20-sep: sep cerrado, oct en curso, nov no iniciado", () => {
    expect(estadoCiclo("2026-09", "2026-09-20")).toBe("cerrado");
    expect(estadoCiclo("2026-10", "2026-09-20")).toBe("en_curso");
    expect(estadoCiclo("2026-11", "2026-09-20")).toBe("no_iniciado");
  });
  it("hoy 10-sep: sep en curso, oct no iniciado", () => {
    expect(estadoCiclo("2026-09", "2026-09-10")).toBe("en_curso");
    expect(estadoCiclo("2026-10", "2026-09-10")).toBe("no_iniciado");
  });
  it("bordes: el 15 sigue en curso, el 16 arranca el siguiente", () => {
    expect(estadoCiclo("2026-09", "2026-09-15")).toBe("en_curso");
    expect(estadoCiclo("2026-09", "2026-09-16")).toBe("cerrado");
    expect(estadoCiclo("2026-10", "2026-09-16")).toBe("en_curso");
  });
});

describe("totalCiclo", () => {
  it("15-sep entra a septiembre, 16-sep a octubre", () => {
    const g = [gasto("2026-08-16", 100), gasto("2026-09-15", 200), gasto("2026-09-16", 400)];
    expect(totalCiclo(g, "2026-09")).toBe(300);
    expect(totalCiclo(g, "2026-10")).toBe(400);
  });
});

describe("promedioCiclosCerrados", () => {
  it("usa los 3 ciclos cerrados más recientes", () => {
    // ciclos 2026-05..2026-09 cerrados (hoy 20-sep), con totales 1..5 (x1M)
    const g = [1, 2, 3, 4, 5].map((n, i) => gasto(`2026-0${5 + i}-01`, n * 1_000_000));
    expect(promedioCiclosCerrados(g, "2026-09-20")).toBe(4_000_000); // (3+4+5)/3
  });
  it("no cuenta el ciclo en curso", () => {
    const g = [gasto("2026-08-01", 1_000_000), gasto("2026-09-18", 9_000_000)]; // sep-18 es ciclo 2026-10, en curso
    expect(promedioCiclosCerrados(g, "2026-09-20")).toBe(1_000_000);
  });
  it("un ciclo cerrado sin gasto no entra al promedio (no lo arrastra a un tercio)", () => {
    const g = [gasto("2026-06-01", 3_000_000)]; // jul y ago cerrados pero en cero
    expect(promedioCiclosCerrados(g, "2026-09-20")).toBe(3_000_000);
  });
  it("sin ningún ciclo cerrado con datos → null", () => {
    expect(promedioCiclosCerrados([], "2026-09-20")).toBeNull();
    expect(promedioCiclosCerrados([gasto("2026-09-18", 500)], "2026-09-20")).toBeNull();
  });
});

describe("calcularTC: la factura se paga el mes siguiente al cierre", () => {
  // Caso real: el ciclo que cerró el 15-sep se paga el 2-oct. Octubre debe
  // cargar esa factura, no el ciclo 16-sep..15-oct que se paga en noviembre.
  const hoy = "2026-10-02";
  const gastos = [
    gasto("2026-08-20", 1_000_000), // ciclo 09 (16-ago..15-sep)
    gasto("2026-09-10", 2_000_000), // ciclo 09
    gasto("2026-09-20", 600_000),   // ciclo 10 (16-sep..15-oct, en curso)
  ];

  it("octubre = factura exacta del ciclo que cerró el 15-sep", () => {
    expect(calcularTC(gastos, [], "2026-10", hoy)).toMatchObject({ monto: 3_000_000, origen: "real", editable: false, ciclo: "2026-09" });
  });

  it("noviembre = ritmo del ciclo en curso (16-sep..15-oct)", () => {
    // 30 días de ciclo; corridos al 2-oct = 17
    const tc = calcularTC(gastos, [], "2026-11", hoy);
    expect(tc).toMatchObject({ origen: "ritmo", editable: true, ciclo: "2026-10" });
    expect(tc.monto).toBe(Math.round((600_000 / 17) * 30));
  });

  it("diciembre = promedio (su ciclo todavía no arranca)", () => {
    expect(calcularTC(gastos, [], "2026-12", hoy)).toMatchObject({ monto: 3_000_000, origen: "promedio", ciclo: "2026-11" });
  });
});

describe("calcularTC", () => {
  const hoy = "2026-09-20";
  const gastos = [
    gasto("2026-06-01", 3_000_000), // ciclo 06
    gasto("2026-07-01", 3_000_000), // ciclo 07
    gasto("2026-08-01", 6_000_000), // ciclo 08
    gasto("2026-08-20", 1_000_000), // ciclo 09
    gasto("2026-09-10", 2_000_000), // ciclo 09
    gasto("2026-09-17", 500_000),   // ciclo 10 (en curso)
  ];

  it("mes 10 paga el ciclo 09, cerrado: la factura exacta, no editable, y un ajuste se ignora", () => {
    const tc = calcularTC(gastos, [ajuste("2026-10", null, 999)], "2026-10", hoy);
    expect(tc).toMatchObject({ monto: 3_000_000, origen: "real", editable: false, ciclo: "2026-09", referencia: 3_000_000 });
  });

  it("ciclo en curso: real + ritmo sobre el largo del ciclo", () => {
    // mes 11 paga el ciclo 2026-10: 16-sep..15-oct = 30 días; corridos al 20-sep = 5
    const tc = calcularTC(gastos, [], "2026-11", hoy);
    expect(tc.origen).toBe("ritmo");
    expect(tc.editable).toBe(true);
    expect(tc.monto).toBe(Math.round((500_000 / 5) * 30));
    expect(tc.referencia).toBe(tc.monto);
  });

  it("ciclo en curso con ajuste: manual, y la referencia sigue siendo el ritmo", () => {
    const tc = calcularTC(gastos, [ajuste("2026-11", null, 4_000_000)], "2026-11", hoy);
    expect(tc).toMatchObject({ monto: 4_000_000, origen: "manual", editable: true });
    expect(tc.referencia).toBe(Math.round((500_000 / 5) * 30));
  });

  it("mes 12 (ciclo 11 no iniciado): promedio de los 3 cerrados (07, 08, 09)", () => {
    const tc = calcularTC(gastos, [], "2026-12", hoy);
    expect(tc).toMatchObject({ monto: 4_000_000, origen: "promedio", editable: true, referencia: 4_000_000 });
  });

  it("no iniciado con ajuste: manual", () => {
    const tc = calcularTC(gastos, [ajuste("2026-12", null, 5_500_000)], "2026-12", hoy);
    expect(tc).toMatchObject({ monto: 5_500_000, origen: "manual", referencia: 4_000_000 });
  });

  it("sin historial: sin_datos y monto 0", () => {
    const tc = calcularTC([], [], "2026-12", hoy);
    expect(tc).toMatchObject({ monto: 0, origen: "sin_datos", editable: true, referencia: 0 });
  });

  it("origenReferencia dice qué habría sin el ajuste", () => {
    expect(calcularTC(gastos, [], "2026-10", hoy).origenReferencia).toBe("real");
    expect(calcularTC(gastos, [ajuste("2026-11", null, 1)], "2026-11", hoy).origenReferencia).toBe("ritmo");
    expect(calcularTC(gastos, [ajuste("2026-12", null, 1)], "2026-12", hoy).origenReferencia).toBe("promedio");
    expect(calcularTC([], [ajuste("2026-12", null, 1)], "2026-12", hoy).origenReferencia).toBe("sin_datos");
  });
});

describe("calcularPlan", () => {
  const hoy = "2026-09-20";
  const rubros = [
    rubro({ id: "nomina", tipo: "ingreso", monto_default: 10_000_000, desde: "2026-01" }),
    rubro({ id: "arriendo", tipo: "fijo", monto_default: 2_000_000, desde: "2026-01" }),
  ];
  // Un solo ciclo cerrado con datos: promedio = 3M para todo futuro.
  const gastos = [gasto("2026-08-01", 3_000_000)];

  it("10 meses, el actual marcado", () => {
    const plan = calcularPlan({ rubros, ajustes: [], gastos, hoy });
    expect(plan).toHaveLength(10);
    expect(plan.filter((m) => m.esActual).map((m) => m.mes)).toEqual(["2026-09"]);
  });

  it("ahorro = ingresos − fijos − tc, negativo permitido", () => {
    const plan = calcularPlan({ rubros, ajustes: [], gastos, hoy });
    const dic = plan.find((m) => m.mes === "2026-12")!; // paga el ciclo 11, no iniciado → promedio
    expect(dic.totalIngresos).toBe(10_000_000);
    expect(dic.totalFijos).toBe(2_000_000);
    expect(dic.tc.monto).toBe(3_000_000);
    expect(dic.ahorro).toBe(5_000_000);

    const caro = calcularPlan({ rubros, ajustes: [ajuste("2026-12", null, 20_000_000)], gastos, hoy });
    expect(caro.find((m) => m.mes === "2026-12")!.ahorro).toBe(-12_000_000);
  });

  it("acumulado: null en pasados, = ahorro en el actual, suma hacia adelante", () => {
    const plan = calcularPlan({ rubros, ajustes: [], gastos, hoy });
    const [jun, jul, ago, sep, oct] = plan;
    expect(jun.acumulado).toBeNull();
    expect(jul.acumulado).toBeNull();
    expect(ago.acumulado).toBeNull();
    expect(sep.acumulado).toBe(sep.ahorro);
    expect(oct.acumulado).toBe(sep.ahorro! + oct.ahorro!);
  });

  it("sin rubros de ingreso: ahorro null, acumulado null", () => {
    const plan = calcularPlan({ rubros: [rubros[1]], ajustes: [], gastos, hoy });
    expect(plan.every((m) => m.ahorro === null)).toBe(true);
    expect(plan.every((m) => m.acumulado === null)).toBe(true);
  });

  it("un ingreso que arranca en el futuro: los meses anteriores quedan en null y el acumulado arranca ahí", () => {
    const tardio = [rubro({ id: "nomina", tipo: "ingreso", monto_default: 10_000_000, desde: "2026-12" })];
    const plan = calcularPlan({ rubros: tardio, ajustes: [], gastos, hoy });
    const sep = plan.find((m) => m.mes === "2026-09")!;
    const dic = plan.find((m) => m.mes === "2026-12")!;
    expect(sep.ahorro).toBeNull();
    expect(sep.acumulado).toBeNull();
    expect(dic.ahorro).toBe(7_000_000);
    expect(dic.acumulado).toBe(7_000_000);
  });

  it("un mes intermedio sin ingreso no rompe el acumulado: no aporta y el corrido se mantiene", () => {
    const dosIngresos = [
      rubro({ id: "nomina1", tipo: "ingreso", monto_default: 10_000_000, desde: "2026-01", hasta: "2026-10" }),
      rubro({ id: "nomina2", tipo: "ingreso", monto_default: 10_000_000, desde: "2026-12" }),
    ];
    const plan = calcularPlan({ rubros: dosIngresos, ajustes: [], gastos, hoy });
    const oct = plan.find((m) => m.mes === "2026-10")!;
    const nov = plan.find((m) => m.mes === "2026-11")!;
    const dic = plan.find((m) => m.mes === "2026-12")!;
    // Oct paga el ciclo 09 (cerrado, sin gasto: el único gasto es del ciclo 08),
    // así que tc.monto es 0: ahorro = 10.000.000 − 0 − 0.
    expect(oct.ahorro).toBe(10_000_000);
    expect(nov.ahorro).toBeNull();
    expect(nov.acumulado).toBe(oct.acumulado);
    expect(dic.acumulado).toBe(nov.acumulado! + dic.ahorro!);
  });
});
