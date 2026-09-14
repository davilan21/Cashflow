import { describe, it, expect } from "vitest";
import { etiquetaMes, etiquetaMesCorta, etiquetaVigencia, etiquetaOrigenTC } from "./etiquetas";

describe("etiquetaMes", () => {
  it("mes largo con mayúscula y año", () => {
    expect(etiquetaMes("2026-09")).toBe("Septiembre 2026");
    expect(etiquetaMes("2027-01")).toBe("Enero 2027");
  });
  it("corta: tres letras y dos dígitos", () => {
    expect(etiquetaMesCorta("2026-09")).toBe("sep 26");
  });
});

describe("etiquetaVigencia", () => {
  it("sin fin", () => expect(etiquetaVigencia("2026-09", null)).toBe("desde sep 26"));
  it("rango", () => expect(etiquetaVigencia("2026-09", "2026-12")).toBe("sep 26 – dic 26"));
  it("puntual", () => expect(etiquetaVigencia("2026-12", "2026-12")).toBe("solo dic 26"));
});

describe("etiquetaOrigenTC", () => {
  it("texto por origen", () => {
    expect(etiquetaOrigenTC("real")).toBe("factura");
    expect(etiquetaOrigenTC("ritmo")).toBe("a este ritmo");
    expect(etiquetaOrigenTC("promedio")).toBe("promedio 3 ciclos");
    expect(etiquetaOrigenTC("manual")).toBe("ajustado");
    expect(etiquetaOrigenTC("sin_datos")).toBe("sin historial");
  });
});
