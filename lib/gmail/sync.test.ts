import { describe, it, expect } from "vitest";
import { calcularDesde } from "./sync";

describe("calcularDesde", () => {
  it("sin sync previo, resta los días de backfill desde ahora", () => {
    const ahora = new Date("2026-08-18T12:00:00.000Z");
    expect(calcularDesde(null, 30, ahora).toISOString()).toBe("2026-07-19T12:00:00.000Z");
  });

  it("con sync previo, usa esa fecha tal cual (ignora backfill)", () => {
    const ahora = new Date("2026-08-18T12:00:00.000Z");
    expect(calcularDesde("2026-08-10T08:00:00.000Z", 30, ahora).toISOString()).toBe("2026-08-10T08:00:00.000Z");
  });
});
