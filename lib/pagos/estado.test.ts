import { describe, it, expect } from "vitest";
import { fechaVencimiento, estadoPago, itemsPagos, agruparPagos, contadorPagos, resumenPagos } from "./estado";
import type { PlanPago, PlanRubro } from "@/lib/types";

function fijo(id: string, dia_pago: number | null, monto = 100, p: Partial<PlanRubro> = {}): PlanRubro {
  return { id, cuenta_id: "c1", tipo: "fijo", nombre: id, monto_default: monto, desde: "2026-01", hasta: null, dia_pago, orden: 0, created_by: null, created_at: id, updated_at: "", ...p };
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
  const hoy = "2026-10-02";

  it("mes actual completo, con monto sugerido del Plan", () => {
    const items = itemsPagos([fijo("luz", 10, 150_000)], [], [], hoy);
    expect(items.find((i) => i.mes === "2026-10")).toEqual({ rubroId: "luz", nombre: "luz", mes: "2026-10", vence: "2026-10-10", montoSugerido: 150_000, pago: null, estado: "pendiente" });
    // la luz de septiembre sin pagar aparece, vencida
    expect(items.find((i) => i.mes === "2026-09")).toMatchObject({ estado: "vencido", vence: "2026-09-10" });
  });

  it("el mes anterior pagado no aparece", () => {
    const items = itemsPagos([fijo("luz", 10)], [], [pago("2026-09", "luz", 100)], hoy);
    expect(items.map((i) => i.mes)).toEqual(["2026-10"]);
  });

  it("hace dos meses no aparece aunque no se haya pagado", () => {
    const items = itemsPagos([fijo("luz", 10)], [], [], hoy);
    expect(items.some((i) => i.mes === "2026-08")).toBe(false);
  });

  it("mes anterior sin día: vencido al último día de ese mes", () => {
    const items = itemsPagos([fijo("cel", null)], [], [], hoy);
    expect(items.find((i) => i.mes === "2026-09")).toMatchObject({ estado: "vencido", vence: "2026-09-30" });
    expect(items.find((i) => i.mes === "2026-10")).toMatchObject({ estado: "sin_dia", vence: null });
  });

  it("fuera de vigencia no aparece", () => {
    const items = itemsPagos([fijo("curso", 10, 100, { desde: "2026-11" })], [], [], hoy);
    expect(items).toEqual([]);
  });

  it("solo fijos: los ingresos no aparecen", () => {
    const items = itemsPagos([fijo("nomina", null, 100, { tipo: "ingreso" })], [], [], hoy);
    expect(items).toEqual([]);
  });

  it("un pago trae su monto y el sugerido sigue siendo el estimado", () => {
    const items = itemsPagos([fijo("luz", 10, 150_000)], [], [pago("2026-10", "luz", 182_000, "2026-10-01")], hoy);
    expect(items.find((i) => i.mes === "2026-10")).toMatchObject({ estado: "pagado", montoSugerido: 150_000, pago: { monto: 182_000, pagadoEl: "2026-10-01" } });
  });
});

describe("agruparPagos / contadorPagos / resumenPagos", () => {
  const hoy = "2026-10-02";
  const rubros = [fijo("a", 1, 100), fijo("b", 4, 200), fijo("c", 20, 300), fijo("d", null, 400), fijo("e", 25, 500)];
  const pagos = [pago("2026-09", "a", 100), pago("2026-09", "b", 200), pago("2026-09", "c", 300), pago("2026-09", "d", 400), pago("2026-09", "e", 500), pago("2026-10", "e", 550)];
  const items = itemsPagos(rubros, [], pagos, hoy);

  it("agrupa por estado, ordenado por vencimiento", () => {
    const g = agruparPagos(items);
    expect(g.vencidos.map((i) => i.rubroId)).toEqual(["a"]);
    expect(g.pronto.map((i) => i.rubroId)).toEqual(["b"]);
    expect(g.pendientes.map((i) => i.rubroId)).toEqual(["c"]);
    expect(g.sinDia.map((i) => i.rubroId)).toEqual(["d"]);
    expect(g.pagados.map((i) => i.rubroId)).toEqual(["e"]);
  });

  it("contador = vencidos + pronto", () => expect(contadorPagos(items)).toBe(2));

  it("resumen del mes: pagado real, total con pagos reales, faltan", () => {
    expect(resumenPagos(items, "2026-10")).toEqual({ pagado: 550, total: 100 + 200 + 300 + 400 + 550, faltan: 4 });
  });
});
