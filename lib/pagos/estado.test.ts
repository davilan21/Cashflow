import { describe, it, expect } from "vitest";
import { fechaVencimiento, estadoPago, itemsPagos, agruparPagos, contadorPagos, resumenPagos, MES_INICIO_PAGOS, type ItemPago } from "./estado";
import type { PlanAjuste, PlanPago, PlanRubro } from "@/lib/types";

function fijo(id: string, dia_pago: number | null, monto = 100, p: Partial<PlanRubro> = {}): PlanRubro {
  return { id, cuenta_id: "c1", tipo: "fijo", nombre: id, monto_default: monto, desde: "2026-01", hasta: null, dia_pago, orden: 0, created_by: null, created_at: id, updated_at: "", ...p };
}
function ajuste(mes: string, rubro_id: string, monto: number): PlanAjuste {
  return { id: `aj-${mes}-${rubro_id}`, cuenta_id: "c1", mes, rubro_id, monto, updated_at: "" };
}
function pago(mes: string, rubro_id: string, monto: number, pagado_el = `${mes}-05`): PlanPago {
  return { id: `${mes}-${rubro_id}`, cuenta_id: "c1", rubro_id, mes, monto, pagado_el, created_by: null, created_at: "", updated_at: "" };
}

describe("fechaVencimiento", () => {
  it("día normal", () => expect(fechaVencimiento("2026-10", 10)).toBe("2026-10-10"));
  it("31 en noviembre vence el 30", () => expect(fechaVencimiento("2026-11", 31)).toBe("2026-11-30"));
  it("30 en febrero vence el 28, y el 29 en bisiesto", () => {
    expect(fechaVencimiento("2026-02", 30)).toBe("2026-02-28");
    expect(fechaVencimiento("2028-02", 30)).toBe("2028-02-29");
  });
  it("sin día → null", () => expect(fechaVencimiento("2026-10", null)).toBeNull());
});

describe("estadoPago", () => {
  it("pagado gana siempre", () => expect(estadoPago("2026-09-01", true, "2026-10-02")).toBe("pagado"));
  it("el día del vencimiento no es vencido", () => expect(estadoPago("2026-10-02", false, "2026-10-02")).toBe("vence_pronto"));
  it("un día después sí", () => expect(estadoPago("2026-10-01", false, "2026-10-02")).toBe("vencido"));
  it("borde de pronto: +3 cuenta, +4 no", () => {
    expect(estadoPago("2026-10-05", false, "2026-10-02")).toBe("vence_pronto");
    expect(estadoPago("2026-10-06", false, "2026-10-02")).toBe("pendiente");
  });
  it("sin día → sin_dia", () => expect(estadoPago(null, false, "2026-10-02")).toBe("sin_dia"));
});

describe("itemsPagos", () => {
  // Noviembre: el mes anterior (octubre) ya está dentro de MES_INICIO_PAGOS.
  const hoy = "2026-11-02";

  it("mes actual completo, con monto sugerido del Plan", () => {
    const items = itemsPagos([fijo("luz", 10, 150_000)], [], [], hoy);
    expect(items.find((i) => i.mes === "2026-11")).toEqual({ rubroId: "luz", nombre: "luz", mes: "2026-11", vence: "2026-11-10", montoSugerido: 150_000, pago: null, estado: "pendiente" });
    // la luz de octubre sin pagar aparece, vencida
    expect(items.find((i) => i.mes === "2026-10")).toMatchObject({ estado: "vencido", vence: "2026-10-10" });
  });

  it("el mes anterior pagado aparece como pagado, para poder corregirlo", () => {
    const items = itemsPagos([fijo("luz", 10)], [], [pago("2026-10", "luz", 120)], hoy);
    expect(items.map((i) => [i.mes, i.estado])).toEqual([
      ["2026-10", "pagado"],
      ["2026-11", "pendiente"],
    ]);
    expect(items[0]).toMatchObject({ pago: { monto: 120, pagadoEl: "2026-10-05" } });
    expect(agruparPagos(items).pagados.map((i) => i.mes)).toEqual(["2026-10"]);
    // el pagado del mes anterior no cuenta en el contador ni en el resumen del mes actual
    expect(contadorPagos(items)).toBe(0);
    expect(resumenPagos(items, "2026-11")).toEqual({ pagado: 0, total: 100, faltan: 1 });
  });

  it("hace dos meses no aparece aunque no se haya pagado", () => {
    const items = itemsPagos([fijo("luz", 10)], [], [], "2026-12-02");
    expect(items.map((i) => i.mes)).toEqual(["2026-11", "2026-12"]);
  });

  it("mes anterior sin día: vencido al último día de ese mes", () => {
    const items = itemsPagos([fijo("cel", null)], [], [], hoy);
    expect(items.find((i) => i.mes === "2026-10")).toMatchObject({ estado: "vencido", vence: "2026-10-31" });
    expect(items.find((i) => i.mes === "2026-11")).toMatchObject({ estado: "sin_dia", vence: null });
  });

  it("fuera de vigencia no aparece", () => {
    const items = itemsPagos([fijo("curso", 10, 100, { desde: "2026-12" }), fijo("luz", 10)], [], [], hoy);
    expect(items.map((i) => i.rubroId)).toEqual(["luz", "luz"]);
  });

  it("solo fijos: los ingresos no aparecen", () => {
    const items = itemsPagos([fijo("nomina", null, 100, { tipo: "ingreso" })], [], [], hoy);
    expect(items).toEqual([]);
  });

  it("un pago trae su monto y el sugerido sigue siendo el estimado", () => {
    const items = itemsPagos([fijo("luz", 10, 150_000)], [], [pago("2026-11", "luz", 182_000, "2026-11-01")], hoy);
    expect(items.find((i) => i.mes === "2026-11")).toMatchObject({ estado: "pagado", montoSugerido: 150_000, pago: { monto: 182_000, pagadoEl: "2026-11-01" } });
  });

  it("el monto sugerido es el ajuste del mes cuando existe", () => {
    const items = itemsPagos([fijo("luz", 10, 150_000)], [ajuste("2026-11", "luz", 170_000)], [], hoy);
    expect(items.find((i) => i.mes === "2026-11")).toMatchObject({ montoSugerido: 170_000 });
    // el ajuste es solo de noviembre: octubre sigue con el default
    expect(items.find((i) => i.mes === "2026-10")).toMatchObject({ montoSugerido: 150_000 });
  });
});

describe("MES_INICIO_PAGOS", () => {
  it("es octubre de 2026", () => expect(MES_INICIO_PAGOS).toBe("2026-10"));

  it("en el primer mes no aparece nada del mes anterior", () => {
    const items = itemsPagos([fijo("luz", 10)], [], [], "2026-10-05");
    expect(items.map((i) => i.mes)).toEqual(["2026-10"]);
    expect(contadorPagos(items)).toBe(0);
  });

  it("ni siquiera los pagados de antes del inicio", () => {
    const items = itemsPagos([fijo("luz", 10)], [], [pago("2026-09", "luz", 100)], "2026-10-05");
    expect(items.map((i) => i.mes)).toEqual(["2026-10"]);
  });

  it("control: al mes siguiente el primer mes sin pagar sí aparece", () => {
    const items = itemsPagos([fijo("luz", 10)], [], [], "2026-11-05");
    expect(items.find((i) => i.mes === "2026-10")).toMatchObject({ estado: "vencido" });
  });
});

describe("agruparPagos / contadorPagos / resumenPagos", () => {
  const hoy = "2026-11-02";
  const rubros = [fijo("a", 1, 100), fijo("b", 4, 200), fijo("c", 20, 300), fijo("d", null, 400), fijo("e", 25, 500)];
  const pagos = [pago("2026-10", "a", 100), pago("2026-10", "b", 200), pago("2026-10", "c", 300), pago("2026-10", "d", 400), pago("2026-10", "e", 500), pago("2026-11", "e", 550)];
  const items = itemsPagos(rubros, [], pagos, hoy);
  const delMes = (xs: ItemPago[], mes: string) => xs.filter((i) => i.mes === mes).map((i) => i.rubroId);

  it("agrupa por estado, ordenado por vencimiento", () => {
    const g = agruparPagos(items);
    expect(g.vencidos.map((i) => i.rubroId)).toEqual(["a"]);
    expect(g.pronto.map((i) => i.rubroId)).toEqual(["b"]);
    expect(g.pendientes.map((i) => i.rubroId)).toEqual(["c"]);
    expect(g.sinDia.map((i) => i.rubroId)).toEqual(["d"]);
    // pagados: los cinco de octubre (por vencimiento) y luego la e de noviembre
    expect(delMes(g.pagados, "2026-10")).toEqual(["a", "b", "c", "e", "d"]);
    expect(delMes(g.pagados, "2026-11")).toEqual(["e"]);
  });

  it("contador = vencidos + pronto", () => expect(contadorPagos(items)).toBe(2));

  it("resumen del mes: pagado real, total con pagos reales, faltan", () => {
    expect(resumenPagos(items, "2026-11")).toEqual({ pagado: 550, total: 100 + 200 + 300 + 400 + 550, faltan: 4 });
  });

  it("un vencido del mes anterior cuenta en el contador pero no en el resumen del mes", () => {
    const xs = itemsPagos([fijo("luz", 10, 100), fijo("agua", 25, 300)], [], [], hoy);
    expect(xs.find((i) => i.mes === "2026-10" && i.rubroId === "luz")).toMatchObject({ estado: "vencido" });
    // luz y agua de octubre vencidas; las de noviembre aún pendientes
    expect(contadorPagos(xs)).toBe(2);
    expect(resumenPagos(xs, "2026-11")).toEqual({ pagado: 0, total: 400, faltan: 2 });
  });
});

describe("agruparPagos: orden dentro de un grupo", () => {
  const item = (nombre: string, vence: string | null, estado: ItemPago["estado"]): ItemPago => ({
    rubroId: nombre, nombre, mes: "2026-11", vence, montoSugerido: 0, pago: null, estado,
  });

  it("por vencimiento ascendente, luego por nombre, y sin fecha al final", () => {
    const g = agruparPagos([
      item("zeta", null, "pagado"),
      item("luz", "2026-11-20", "pagado"),
      item("agua", "2026-11-20", "pagado"),
      item("arriendo", "2026-11-05", "pagado"),
      item("alfa", null, "pagado"),
    ]);
    expect(g.pagados.map((i) => i.nombre)).toEqual(["arriendo", "agua", "luz", "alfa", "zeta"]);
  });

  it("vencidos: el más viejo primero", () => {
    const g = agruparPagos([item("b", "2026-11-01", "vencido"), item("a", "2026-10-15", "vencido")]);
    expect(g.vencidos.map((i) => i.nombre)).toEqual(["a", "b"]);
  });
});
