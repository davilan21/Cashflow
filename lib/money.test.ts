import { describe, it, expect } from "vitest";
import { pesos, pesosCorto } from "./money";

describe("pesos", () => {
  it("formatea con separador de miles es-CO y sin decimales", () => {
    expect(pesos(1250000)).toBe("$1.250.000");
    expect(pesos(0)).toBe("$0");
    expect(pesos(999)).toBe("$999");
  });

  it("redondea", () => {
    expect(pesos(1250000.6)).toBe("$1.250.001");
  });
});

describe("pesosCorto", () => {
  it("usa k para miles", () => {
    expect(pesosCorto(250000)).toBe("$250k");
    expect(pesosCorto(15000)).toBe("$15k");
  });

  it("usa M para millones, sin decimal si es exacto", () => {
    expect(pesosCorto(4000000)).toBe("$4M");
    expect(pesosCorto(1000000)).toBe("$1M");
  });

  it("usa un decimal en M cuando no es exacto", () => {
    expect(pesosCorto(1250000)).toBe("$1.3M");
    expect(pesosCorto(3260000)).toBe("$3.3M");
  });

  it("por debajo de mil usa el formato completo", () => {
    expect(pesosCorto(500)).toBe("$500");
  });
});
