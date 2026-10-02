import { describe, it, expect } from "vitest";
import { etiquetaPago, textoEstadoCiclo } from "./labels";

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
