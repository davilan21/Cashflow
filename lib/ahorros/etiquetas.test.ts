import { describe, it, expect } from "vitest";
import { etiquetaTipo, etiquetaFecha, etiquetaVencimiento, etiquetaOrigenValor, nombreTitular } from "./etiquetas";

describe("etiquetas de ahorros", () => {
  it("tipo", () => {
    expect(etiquetaTipo("cdt")).toBe("CDT");
    expect(etiquetaTipo("acciones")).toBe("Acciones");
    expect(etiquetaTipo("otro")).toBe("Otro");
  });
  it("fecha corta", () => {
    expect(etiquetaFecha("2026-09-03")).toBe("3 sep");
  });
  it("vencimiento", () => {
    expect(etiquetaVencimiento("por_vencer", 12, "2026-09-27")).toBe("vence en 12 días");
    expect(etiquetaVencimiento("por_vencer", 0, "2026-09-15")).toBe("vence hoy");
    expect(etiquetaVencimiento("vencido", -3, "2026-09-12")).toBe("vencido");
    expect(etiquetaVencimiento("vigente", 90, "2026-12-14")).toBe("vence 14 dic");
  });
  it("origen del valor", () => {
    expect(etiquetaOrigenValor({ tipo: "valoracion", fecha: "2026-09-03" })).toBe("valorado 3 sep");
    expect(etiquetaOrigenValor({ tipo: "aportado" })).toBe("= aportado (sin valorar)");
  });
  it("titular", () => {
    const miembros = [
      { cuenta_id: "c", user_id: "u1", apodo: "David", joined_at: "" },
      { cuenta_id: "c", user_id: "u2", apodo: null, joined_at: "" },
    ];
    expect(nombreTitular("u1", miembros)).toBe("David");
    expect(nombreTitular("u2", miembros)).toBe("Miembro");
    expect(nombreTitular(null, miembros)).toBe("Hogar");
    expect(nombreTitular("u9", miembros)).toBe("Miembro");
  });
});
