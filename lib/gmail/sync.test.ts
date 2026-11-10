import { describe, it, expect } from "vitest";
import { calcularDesde, construirQueryGmail } from "./sync";

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

describe("construirQueryGmail", () => {
  // Remitentes reales vistos en el buzón (oct-2026). Bancolombia empezó a usar
  // el subdominio "ayn." sin aviso y el filtro por dirección exacta lo ignoró.
  const remitentesReales = [
    "alertasynotificaciones@an.notificacionesbancolombia.com",
    "alertasynotificaciones@ayn.notificacionesbancolombia.com",
    "alertasynotificaciones@bancolombia.com.co",
  ];

  // Gmail: `from:dominio` coincide con cualquier dirección de ese dominio o sus subdominios.
  function cubre(query: string, email: string): boolean {
    const dominio = email.split("@")[1];
    return [...query.matchAll(/from:(\S+?)(?=\s|\)|$)/g)].some(([, t]) =>
      t.includes("@") ? t === email : dominio === t || dominio.endsWith(`.${t}`)
    );
  }

  it.each(remitentesReales)("cubre %s", (email) => {
    expect(cubre(construirQueryGmail(new Date("2026-10-01T00:00:00.000Z")), email)).toBe(true);
  });

  it("filtra por fecha con after: en segundos", () => {
    expect(construirQueryGmail(new Date("2026-10-01T00:00:00.000Z"))).toContain("after:1790812800");
  });
});
