import { describe, it, expect } from "vitest";
import { etiquetaFechaCorta, textoEstadoPago } from "./etiquetas";
import type { ItemPago } from "./estado";

const item = (p: Partial<ItemPago>): ItemPago => ({ rubroId: "x", nombre: "x", mes: "2026-10", vence: null, montoSugerido: 0, pago: null, estado: "sin_dia", ...p });
const hoy = "2026-10-02";

describe("etiquetaFechaCorta", () => {
  it("'2026-10-08' → '8 oct'", () => expect(etiquetaFechaCorta("2026-10-08")).toBe("8 oct"));
});

describe("textoEstadoPago", () => {
  it("pagado", () => expect(textoEstadoPago(item({ estado: "pagado", pago: { monto: 1, pagadoEl: "2026-10-08" } }), hoy)).toBe("pagado el 8 oct"));
  it("vencido ayer / hace n días", () => {
    expect(textoEstadoPago(item({ estado: "vencido", vence: "2026-10-01" }), hoy)).toBe("venció ayer");
    expect(textoEstadoPago(item({ estado: "vencido", vence: "2026-09-10" }), hoy)).toBe("venció hace 22 días");
  });
  it("vence hoy / mañana / en n días", () => {
    expect(textoEstadoPago(item({ estado: "vence_pronto", vence: "2026-10-02" }), hoy)).toBe("vence hoy");
    expect(textoEstadoPago(item({ estado: "vence_pronto", vence: "2026-10-03" }), hoy)).toBe("vence mañana");
    expect(textoEstadoPago(item({ estado: "vence_pronto", vence: "2026-10-05" }), hoy)).toBe("vence en 3 días");
  });
  it("pendiente", () => expect(textoEstadoPago(item({ estado: "pendiente", vence: "2026-10-20" }), hoy)).toBe("vence el 20 oct"));
  it("sin día", () => expect(textoEstadoPago(item({ estado: "sin_dia" }), hoy)).toBe("sin día de pago"));
});
