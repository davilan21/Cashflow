import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { parsearLocal } from "./parse-local";

// "Hoy" fijo para las pruebas: 2026-08-03, lunes.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-03T15:00:00Z")); // mediodía en Bogotá
});
afterEach(() => vi.useRealTimers());

describe("parsearLocal — montos", () => {
  it("200k son 200000", () => {
    expect(parsearLocal("200k en almuerzo")[0].monto).toBe(200000);
  });

  it("200 mil son 200000", () => {
    expect(parsearLocal("200 mil en mercado")[0].monto).toBe(200000);
  });

  it("un número suelto menor a 1000 se asume en miles", () => {
    expect(parsearLocal("200 en bus")[0].monto).toBe(200000);
  });

  it("un número suelto de 1000 o más se toma literal", () => {
    expect(parsearLocal("1500 en algo")[0].monto).toBe(1500);
  });

  it("1 palo y 1 millón son 1000000", () => {
    expect(parsearLocal("1 palo en tecnologia")[0].monto).toBe(1_000_000);
    expect(parsearLocal("1 millón en un viaje")[0].monto).toBe(1_000_000);
  });

  it("sin monto no devuelve nada", () => {
    expect(parsearLocal("almuerzo con amigos")).toEqual([]);
  });
});

describe("parsearLocal — categoría", () => {
  it("detecta por palabra clave", () => {
    expect(parsearLocal("200k en almuerzo")[0].categoria).toBe("restaurantes");
    expect(parsearLocal("50k de uber")[0].categoria).toBe("transporte");
    expect(parsearLocal("30k netflix")[0].categoria).toBe("suscripciones");
  });

  it("sin coincidencia cae en otros", () => {
    expect(parsearLocal("200k para algo raro")[0].categoria).toBe("otros");
  });
});

describe("parsearLocal — fecha", () => {
  it("sin referencia temporal usa hoy", () => {
    expect(parsearLocal("200k en almuerzo")[0].fecha).toBe("2026-08-03");
  });

  it("entiende hoy, ayer y anteayer", () => {
    expect(parsearLocal("hoy 200k en almuerzo")[0].fecha).toBe("2026-08-03");
    expect(parsearLocal("ayer 200k en almuerzo")[0].fecha).toBe("2026-08-02");
    expect(parsearLocal("anteayer 200k en almuerzo")[0].fecha).toBe("2026-08-01");
  });

  it("entiende un día de la semana y toma la ocurrencia pasada más cercana", () => {
    // hoy es lunes 2026-08-03; "el viernes" debe ser el viernes anterior (2026-07-31)
    expect(parsearLocal("200k el viernes en mercado")[0].fecha).toBe("2026-07-31");
    // "el lunes" cuando hoy es lunes: se refiere a hoy
    expect(parsearLocal("200k el lunes en mercado")[0].fecha).toBe("2026-08-03");
  });
});

describe("parsearLocal — nota", () => {
  it("guarda el texto original recortado, sin más procesamiento", () => {
    expect(parsearLocal("hoy   200k  en almuerzo")[0].nota).toBe("hoy 200k en almuerzo");
  });
});
