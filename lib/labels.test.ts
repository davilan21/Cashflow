import { describe, it, expect } from "vitest";
import { etiquetaPago } from "./labels";

describe("etiquetaPago", () => {
  it("nombra el mes del pago, no el del cierre", () => {
    expect(etiquetaPago("2026-09")).toBe("2 de octubre");
  });

  it("el ciclo de diciembre se paga en enero", () => {
    expect(etiquetaPago("2026-12")).toBe("2 de enero");
  });
});
