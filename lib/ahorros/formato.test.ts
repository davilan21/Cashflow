import { describe, it, expect } from "vitest";
import { dolares, formatearDecimal, parsearDecimal } from "./formato";

describe("dolares", () => {
  it("dos decimales, miles con punto, coma decimal", () => {
    expect(dolares(1234.5)).toBe("US$1.234,50");
    expect(dolares(0)).toBe("US$0,00");
    expect(dolares(1000000)).toBe("US$1.000.000,00");
  });
  it("negativos con − delante del símbolo", () => {
    expect(dolares(-250.25)).toBe("−US$250,25");
  });
});

describe("formatearDecimal", () => {
  it("agrupa la parte entera y recorta a dos decimales", () => {
    expect(formatearDecimal("1234,567")).toBe("1.234,56");
    expect(formatearDecimal("1234")).toBe("1.234");
    expect(formatearDecimal("0,5")).toBe("0,5");
  });
  it("acepta punto como decimal si no hay coma, e ignora basura", () => {
    expect(formatearDecimal("1234.5")).toBe("1.234,5");
    expect(formatearDecimal("US$ 1.234,50")).toBe("1.234,50");
  });
  it("deja la coma final mientras se escribe", () => {
    expect(formatearDecimal("12,")).toBe("12,");
  });
  it("vacío → vacío", () => {
    expect(formatearDecimal("")).toBe("");
  });
});

describe("parsearDecimal", () => {
  it("devuelve el número", () => {
    expect(parsearDecimal("1.234,56")).toBe(1234.56);
    expect(parsearDecimal("1234.5")).toBe(1234.5);
    expect(parsearDecimal("0")).toBe(0);
  });
  it("vacío o sin dígitos → null", () => {
    expect(parsearDecimal("")).toBeNull();
    expect(parsearDecimal("abc")).toBeNull();
  });
});
