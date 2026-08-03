import { describe, it, expect, vi, afterEach } from "vitest";
import {
  cicloDe,
  cicloInicio,
  cicloFin,
  cicloPago,
  mitadDe,
  desplazarMes,
  diasEnMes,
  diasEntre,
  hoyISO,
} from "./ciclo";

describe("cicloDe", () => {
  it("una fecha en la segunda mitad del mes pertenece al ciclo que cierra ese mismo mes", () => {
    expect(cicloDe("2026-08-03")).toBe("2026-08");
    expect(cicloDe("2026-08-01")).toBe("2026-08");
  });

  it("una fecha en la primera mitad del mes pertenece al ciclo que cierra el mes siguiente", () => {
    expect(cicloDe("2026-07-20")).toBe("2026-08");
    expect(cicloDe("2026-07-16")).toBe("2026-08");
  });

  it("el día 15 exacto cae en el ciclo que cierra ese mes", () => {
    expect(cicloDe("2026-07-15")).toBe("2026-07");
  });

  it("el día 16 exacto cae en el ciclo del mes siguiente", () => {
    expect(cicloDe("2026-07-16")).toBe("2026-08");
  });

  it("cruza el cambio de año", () => {
    expect(cicloDe("2026-12-20")).toBe("2027-01");
    expect(cicloDe("2026-12-15")).toBe("2026-12");
  });
});

describe("cicloInicio", () => {
  it("empieza el 16 del mes anterior", () => {
    expect(cicloInicio("2026-08")).toBe("2026-07-16");
  });

  it("cruza el cambio de año hacia atrás", () => {
    expect(cicloInicio("2027-01")).toBe("2026-12-16");
  });
});

describe("cicloFin", () => {
  it("termina el 15 del mes de cierre", () => {
    expect(cicloFin("2026-08")).toBe("2026-08-15");
  });
});

describe("cicloPago", () => {
  it("se paga el 30 en meses de 31 días", () => {
    expect(cicloPago("2026-08")).toBe("2026-08-30");
  });

  it("se paga el 30 en meses de 30 días", () => {
    expect(cicloPago("2026-04")).toBe("2026-04-30");
  });

  it("en febrero se paga el último día del mes (28)", () => {
    expect(cicloPago("2026-02")).toBe("2026-02-28");
  });

  it("en febrero bisiesto se paga el 29", () => {
    expect(cicloPago("2028-02")).toBe("2028-02-29");
  });
});

describe("mitadDe", () => {
  it("día >= 16 es la primera mitad (1)", () => {
    expect(mitadDe("2026-08-16")).toBe(1);
    expect(mitadDe("2026-08-31")).toBe(1);
  });

  it("día <= 15 es la segunda mitad (2)", () => {
    expect(mitadDe("2026-08-15")).toBe(2);
    expect(mitadDe("2026-08-01")).toBe(2);
  });
});

describe("un gasto del 16 y otro del 14 del mes siguiente caen en el mismo ciclo", () => {
  it("2026-07-16 y 2026-08-14 comparten ciclo", () => {
    expect(cicloDe("2026-07-16")).toBe(cicloDe("2026-08-14"));
    expect(cicloDe("2026-07-16")).toBe("2026-08");
  });
});

describe("desplazarMes", () => {
  it("avanza y retrocede dentro del mismo año", () => {
    expect(desplazarMes("2026-08", 1)).toBe("2026-09");
    expect(desplazarMes("2026-08", -1)).toBe("2026-07");
  });

  it("cruza diciembre -> enero", () => {
    expect(desplazarMes("2026-12", 1)).toBe("2027-01");
  });

  it("cruza enero -> diciembre hacia atrás", () => {
    expect(desplazarMes("2027-01", -1)).toBe("2026-12");
  });

  it("soporta saltos de varios meses", () => {
    expect(desplazarMes("2026-01", 13)).toBe("2027-02");
    expect(desplazarMes("2026-01", -13)).toBe("2024-12");
  });
});

describe("diasEnMes", () => {
  it("meses de 31, 30 y 28/29 días", () => {
    expect(diasEnMes("2026-01")).toBe(31);
    expect(diasEnMes("2026-04")).toBe(30);
    expect(diasEnMes("2026-02")).toBe(28);
    expect(diasEnMes("2028-02")).toBe(29);
  });
});

describe("diasEntre", () => {
  it("cuenta días de forma inclusiva simétrica", () => {
    expect(diasEntre("2026-07-16", "2026-08-15")).toBe(30);
    expect(diasEntre("2026-08-15", "2026-07-16")).toBe(-30);
    expect(diasEntre("2026-08-01", "2026-08-01")).toBe(0);
  });

  it("cruza fin de año sin error de zona horaria", () => {
    expect(diasEntre("2026-12-31", "2027-01-01")).toBe(1);
  });
});

describe("hoyISO", () => {
  const RealDate = Date;
  afterEach(() => vi.useRealTimers());

  it("devuelve la fecha de America/Bogota, no la del reloj del proceso", () => {
    // 2026-08-03T02:30:00Z es 2026-08-02 21:30 en Bogotá (UTC-5):
    // si el proceso corriera en UTC, una fecha ingenua diría 08-03.
    vi.useFakeTimers();
    vi.setSystemTime(new RealDate("2026-08-03T02:30:00Z"));
    expect(hoyISO()).toBe("2026-08-02");
  });

  it("formato YYYY-MM-DD", () => {
    expect(hoyISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
