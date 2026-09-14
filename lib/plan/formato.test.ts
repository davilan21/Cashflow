import { describe, it, expect } from "vitest";
import { formatearMiles, parsearMonto } from "./formato";

describe("formatearMiles", () => {
  it("agrupa de a tres con punto", () => {
    expect(formatearMiles("4500000")).toBe("4.500.000");
    expect(formatearMiles("800")).toBe("800");
    expect(formatearMiles("1000")).toBe("1.000");
  });
  it("ignora todo lo que no sea dígito (pegado con $ y puntos)", () => {
    expect(formatearMiles("$4.500.000")).toBe("4.500.000");
    expect(formatearMiles("4 500 000")).toBe("4.500.000");
  });
  it("quita ceros a la izquierda y deja vacío como vacío", () => {
    expect(formatearMiles("0045")).toBe("45");
    expect(formatearMiles("")).toBe("");
    expect(formatearMiles("0")).toBe("0");
  });
});

describe("parsearMonto", () => {
  it("devuelve el entero", () => {
    expect(parsearMonto("4.500.000")).toBe(4_500_000);
    expect(parsearMonto("$ 1.000")).toBe(1000);
    expect(parsearMonto("0")).toBe(0);
  });
  it("vacío o sin dígitos → null", () => {
    expect(parsearMonto("")).toBeNull();
    expect(parsearMonto("abc")).toBeNull();
  });
});
