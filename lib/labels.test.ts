import { describe, it, expect } from "vitest";
import { etiquetaCiclo, etiquetaMitad1, etiquetaMitad2, etiquetaPago, textoEstadoCiclo } from "./labels";

describe("etiquetaCiclo", () => {
  it("va del 15 del mes anterior al 14 del mes de cierre", () => {
    expect(etiquetaCiclo("2026-08")).toBe("15 jul – 14 ago");
  });

  it("cruza el cambio de año", () => {
    expect(etiquetaCiclo("2027-01")).toBe("15 dic – 14 ene");
  });
});

describe("etiquetas de quincena", () => {
  it("la primera mitad va del 15 al fin del mes anterior al de cierre", () => {
    expect(etiquetaMitad1("2026-08")).toBe("15–31 jul");
    expect(etiquetaMitad1("2026-03")).toBe("15–28 feb");
    expect(etiquetaMitad1("2028-03")).toBe("15–29 feb");
  });

  it("la segunda mitad va del 1 al 14 del mes de cierre", () => {
    expect(etiquetaMitad2("2026-08")).toBe("1–14 ago");
  });
});

describe("etiquetaPago", () => {
  it("nombra el mes del pago, no el del cierre", () => {
    expect(etiquetaPago("2026-09")).toBe("2 de octubre");
  });

  it("el ciclo de diciembre se paga en enero", () => {
    expect(etiquetaPago("2026-12")).toBe("2 de enero");
  });
});

describe("textoEstadoCiclo", () => {
  it("el ciclo en curso dice 'en curso'", () => {
    expect(textoEstadoCiclo("2026-10", true, "2026-10-01")).toBe("en curso");
  });

  it("cerrado pero antes del 2: por pagar", () => {
    expect(textoEstadoCiclo("2026-09", false, "2026-09-16")).toBe("por pagar el 2 de octubre");
    expect(textoEstadoCiclo("2026-09", false, "2026-10-01")).toBe("por pagar el 2 de octubre");
  });

  it("desde el 2: pagado", () => {
    expect(textoEstadoCiclo("2026-09", false, "2026-10-02")).toBe("pagado el 2 de octubre");
    expect(textoEstadoCiclo("2026-08", false, "2026-10-02")).toBe("pagado el 2 de septiembre");
  });
});
