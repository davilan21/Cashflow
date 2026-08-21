import { describe, it, expect } from "vitest";
import { validarRegla, validarInstrumento } from "./validacion";
import { resumenRegla, notaMedioPago } from "./etiquetas";
import type { NuevaRegla, NuevoInstrumento } from "./queries";
import type { Regla } from "./tipos";

function nueva(cambios: Partial<NuevaRegla> = {}): NuevaRegla {
  return {
    tipo: "gasto_fijo",
    nombre: "Arriendo",
    monto: 2_000_000,
    monto_tipo: "fijo",
    frecuencia: "mensual",
    dia_1: 5,
    dia_2: null,
    mes: null,
    medio_pago: "debito",
    instrumento_id: null,
    categoria: null,
    desde: "2026-08-01",
    hasta: null,
    activa: true,
    ...cambios,
  };
}

function instrumento(cambios: Partial<NuevoInstrumento> = {}): NuevoInstrumento {
  return {
    nombre: "Ahorros Davibank",
    banco: "davibank",
    tipo: "ahorros",
    ultimos4: "1234",
    alias_pago: null,
    principal: false,
    titular: null,
    activo: true,
    ...cambios,
  };
}

describe("validarRegla", () => {
  it("acepta una regla completa", () => {
    expect(validarRegla(nueva())).toBeNull();
  });

  it("exige nombre y monto positivo", () => {
    expect(validarRegla(nueva({ nombre: "   " }))).toBe("Ponle un nombre");
    expect(validarRegla(nueva({ monto: 0 }))).toMatch(/mayor que cero/);
    expect(validarRegla(nueva({ monto: NaN }))).toMatch(/mayor que cero/);
  });

  it("exige un día válido", () => {
    expect(validarRegla(nueva({ dia_1: 0 }))).toMatch(/entre 1 y 31/);
    expect(validarRegla(nueva({ dia_1: 32 }))).toMatch(/entre 1 y 31/);
  });

  it("una quincenal necesita dos días distintos", () => {
    expect(validarRegla(nueva({ frecuencia: "quincenal" }))).toMatch(/sus dos días/);
    expect(validarRegla(nueva({ frecuencia: "quincenal", dia_1: 15, dia_2: 15 }))).toMatch(/distintos/);
    expect(validarRegla(nueva({ frecuencia: "quincenal", dia_1: 15, dia_2: 30 }))).toBeNull();
  });

  it("una anual necesita mes", () => {
    expect(validarRegla(nueva({ frecuencia: "anual" }))).toMatch(/qué mes/);
    expect(validarRegla(nueva({ frecuencia: "anual", mes: 6 }))).toBeNull();
  });

  it("un gasto fijo necesita medio de pago; un ingreso no", () => {
    expect(validarRegla(nueva({ medio_pago: null }))).toMatch(/medio de pago/);
    expect(validarRegla(nueva({ tipo: "ingreso", medio_pago: null }))).toBeNull();
  });

  it("rechaza una vigencia al revés", () => {
    expect(validarRegla(nueva({ desde: "2026-08-01", hasta: "2026-07-01" }))).toMatch(/anterior/);
  });
});

describe("validarInstrumento", () => {
  it("acepta uno completo, y uno sin dígitos", () => {
    expect(validarInstrumento(instrumento())).toBeNull();
    expect(validarInstrumento(instrumento({ ultimos4: null }))).toBeNull();
  });

  it("exige nombre", () => {
    expect(validarInstrumento(instrumento({ nombre: " " }))).toBe("Ponle un nombre");
  });

  it("los últimos dígitos son exactamente cuatro números", () => {
    expect(validarInstrumento(instrumento({ ultimos4: "12" }))).toMatch(/cuatro números/);
    expect(validarInstrumento(instrumento({ ultimos4: "12a4" }))).toMatch(/cuatro números/);
  });
});

describe("resumenRegla", () => {
  const base: Regla = { ...nueva(), id: "r1" };

  it("describe cada frecuencia en una línea", () => {
    expect(resumenRegla(base)).toBe("Cada mes el 5");
    expect(resumenRegla({ ...base, frecuencia: "quincenal", dia_1: 15, dia_2: 30 })).toBe(
      "El 15 y el 30 de cada mes"
    );
    expect(resumenRegla({ ...base, frecuencia: "bimestral" })).toBe("Cada dos meses, el 5");
    expect(resumenRegla({ ...base, frecuencia: "anual", mes: 6, dia_1: 30 })).toBe("Cada junio el 30");
    expect(resumenRegla({ ...base, frecuencia: "unica", dia_1: 12 })).toBe("Una sola vez, el 12");
  });
});

describe("notaMedioPago", () => {
  const base: Regla = { ...nueva(), id: "r1" };

  it("avisa que un fijo de tarjeta no sale de la caja en su fecha", () => {
    expect(notaMedioPago({ ...base, medio_pago: "tc" })).toMatch(/pagas el ciclo/);
  });

  it("no dice nada para un fijo de débito ni para un ingreso", () => {
    expect(notaMedioPago(base)).toBeNull();
    expect(notaMedioPago({ ...base, tipo: "ingreso", medio_pago: null })).toBeNull();
  });
});
