import { describe, it, expect } from "vitest";
import {
  ocurrenciasDeRegla,
  expandirReglas,
  expandirDeudas,
  eventosPagoTarjeta,
  ciclosSinPagar,
  proyectar,
} from "./proyeccion";
import type { Deuda, EntradaProyeccion, GastoTarjeta, Movimiento, Regla } from "./tipos";

const VACIO = new Set<string>();

function regla(cambios: Partial<Regla> = {}): Regla {
  return {
    id: "r1",
    tipo: "gasto_fijo",
    nombre: "Arriendo",
    monto: 2_000_000,
    monto_tipo: "fijo",
    frecuencia: "mensual",
    dia_1: 5,
    dia_2: null,
    mes: null,
    medio_pago: "debito",
    categoria: null,
    desde: "2026-01-01",
    hasta: null,
    activa: true,
    ...cambios,
  };
}

function gasto(fecha: string, monto: number, regla_id: string | null = null): GastoTarjeta {
  return { id: `${fecha}-${monto}`, fecha, monto, regla_id };
}

function entrada(cambios: Partial<EntradaProyeccion> = {}): EntradaProyeccion {
  return {
    hoy: "2026-08-20",
    horizonteDias: 90,
    colchon: 0,
    ancla: { fecha: "2026-08-20", monto: 5_000_000 },
    movimientos: [],
    reglas: [],
    deudas: [],
    gastosTarjeta: [],
    ...cambios,
  };
}

describe("ocurrenciasDeRegla", () => {
  it("una mensual cae una vez por mes", () => {
    expect(ocurrenciasDeRegla(regla(), "2026-08-01", "2026-10-31")).toEqual([
      "2026-08-05",
      "2026-09-05",
      "2026-10-05",
    ]);
  });

  it("una quincenal cae en sus dos días", () => {
    const r = regla({ frecuencia: "quincenal", dia_1: 15, dia_2: 30, tipo: "ingreso", nombre: "Nómina" });
    expect(ocurrenciasDeRegla(r, "2026-08-01", "2026-09-30")).toEqual([
      "2026-08-15",
      "2026-08-30",
      "2026-09-15",
      "2026-09-30",
    ]);
  });

  it("recorta el día al último del mes cuando no existe", () => {
    const r = regla({ dia_1: 31 });
    expect(ocurrenciasDeRegla(r, "2027-01-01", "2027-03-31")).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
  });

  it("una quincenal del 30 se paga el 28 en febrero", () => {
    const r = regla({ frecuencia: "quincenal", dia_1: 15, dia_2: 30 });
    expect(ocurrenciasDeRegla(r, "2027-02-01", "2027-02-28")).toEqual(["2027-02-15", "2027-02-28"]);
  });

  it("una anual solo cae en su mes", () => {
    const r = regla({ frecuencia: "anual", mes: 6, dia_1: 30, tipo: "ingreso", nombre: "Prima" });
    expect(ocurrenciasDeRegla(r, "2026-01-01", "2027-12-31")).toEqual(["2026-06-30", "2027-06-30"]);
  });

  it("una bimestral cae cada dos meses contados desde su arranque", () => {
    const r = regla({ frecuencia: "bimestral", dia_1: 10, desde: "2026-01-01" });
    expect(ocurrenciasDeRegla(r, "2026-01-01", "2026-06-30")).toEqual(["2026-01-10", "2026-03-10", "2026-05-10"]);
  });

  it("una única cae una sola vez", () => {
    const r = regla({ frecuencia: "unica", desde: "2026-09-01", dia_1: 12 });
    expect(ocurrenciasDeRegla(r, "2026-08-01", "2026-12-31")).toEqual(["2026-09-12"]);
  });

  it("respeta la vigencia: no cae antes de `desde` ni después de `hasta`", () => {
    const r = regla({ desde: "2026-09-01", hasta: "2026-10-31" });
    expect(ocurrenciasDeRegla(r, "2026-08-01", "2026-12-31")).toEqual(["2026-09-05", "2026-10-05"]);
  });

  it("una regla inactiva no cae nunca", () => {
    expect(ocurrenciasDeRegla(regla({ activa: false }), "2026-08-01", "2026-12-31")).toEqual([]);
  });
});

describe("expandirReglas", () => {
  it("los ingresos entran positivos y los gastos salen negativos", () => {
    const eventos = expandirReglas(
      [regla(), regla({ id: "r2", tipo: "ingreso", nombre: "Nómina", monto: 5_000_000, dia_1: 15 })],
      "2026-08-01",
      "2026-08-31",
      VACIO
    );
    expect(eventos.find((e) => e.etiqueta === "Arriendo")?.monto).toBe(-2_000_000);
    expect(eventos.find((e) => e.etiqueta === "Nómina")?.monto).toBe(5_000_000);
  });

  it("un fijo que va a la tarjeta NO genera evento de caja propio", () => {
    // Toca caja el día que se paga el ciclo, no el día del cargo. Contarlo
    // acá sería doble conteo.
    const netflix = regla({ id: "r9", nombre: "Netflix", monto: 45_000, medio_pago: "tc", dia_1: 8 });
    expect(expandirReglas([netflix], "2026-08-01", "2026-08-31", VACIO)).toEqual([]);
  });

  it("un ingreso estimado se marca como tal", () => {
    const r = regla({ tipo: "ingreso", monto_tipo: "estimado", nombre: "Freelance", dia_1: 20 });
    expect(expandirReglas([r], "2026-08-01", "2026-08-31", VACIO)[0].origen).toBe("estimado");
  });

  it("no reproyecta una ocurrencia ya confirmada a mano", () => {
    const consumidas = new Set(["r1|2026-08-05"]);
    const eventos = expandirReglas([regla()], "2026-08-01", "2026-09-30", consumidas);
    expect(eventos.map((e) => e.fecha)).toEqual(["2026-09-05"]);
  });
});

describe("expandirDeudas", () => {
  const deuda: Deuda = {
    id: "d1",
    nombre: "Crédito carro",
    saldo_actual: 12_000_000,
    saldo_a_fecha: "2026-08-01",
    tasa_mensual: 0.015,
    cuota: 1_100_000,
    n_cuotas: 24,
    cuotas_pagadas: 12,
    dia_pago: 10,
    medio_pago: "debito",
    activa: true,
  };

  it("genera las cuotas de la ventana, siempre negativas", () => {
    const eventos = expandirDeudas([deuda], "2026-08-01", "2026-10-31", VACIO);
    expect(eventos.map((e) => e.fecha)).toEqual(["2026-08-10", "2026-09-10", "2026-10-10"]);
    eventos.forEach((e) => expect(e.monto).toBeLessThan(0));
  });

  it("no reproyecta una cuota ya confirmada", () => {
    const eventos = expandirDeudas([deuda], "2026-08-01", "2026-09-30", new Set(["d1|2026-08-10"]));
    expect(eventos.map((e) => e.fecha)).toEqual(["2026-09-10"]);
  });
});

describe("eventosPagoTarjeta", () => {
  it("un ciclo cerrado y sin pagar sale por su total real, el día de pago", () => {
    // Ciclo 2026-08 = 16 jul a 15 ago, se paga el 30 de agosto.
    const gastos = [gasto("2026-07-20", 1_000_000), gasto("2026-08-10", 500_000)];
    const eventos = eventosPagoTarjeta(gastos, [], VACIO, "2026-08-20", "2026-08-20", "2026-09-10");
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ fecha: "2026-08-30", monto: -1_500_000, origen: "real" });
  });

  it("un ciclo ya pagado no genera evento proyectado", () => {
    const gastos = [gasto("2026-07-20", 1_000_000)];
    expect(eventosPagoTarjeta(gastos, [], new Set(["2026-08"]), "2026-08-20", "2026-08-20", "2026-09-10")).toEqual([]);
  });

  it("el ciclo en curso extrapola solo el gasto discrecional", () => {
    // Ciclo 2026-09 (16 ago–15 sep). Al 20 de agosto van 5 días corridos con
    // 500k discrecionales: el ritmo es 100k/día por los 26 días que faltan.
    const gastos = [gasto("2026-08-16", 500_000)];
    const eventos = eventosPagoTarjeta(gastos, [], VACIO, "2026-08-20", "2026-09-20", "2026-10-05");
    const ciclo = eventos.find((e) => e.refId === "2026-09");
    expect(ciclo?.origen).toBe("estimado");
    expect(ciclo?.monto).toBe(-(500_000 + 100_000 * 26));
  });

  it("un fijo de tarjeta ya cobrado no se vuelve a sumar al ciclo", () => {
    const netflix = regla({ id: "rn", nombre: "Netflix", monto: 45_000, medio_pago: "tc", dia_1: 8 });
    const cobrado = [gasto("2026-08-16", 500_000), gasto("2026-09-08", 45_000, "rn")];
    const conFijo = eventosPagoTarjeta(cobrado, [netflix], VACIO, "2026-09-10", "2026-09-20", "2026-10-05");
    const sinFijo = eventosPagoTarjeta(cobrado, [], VACIO, "2026-09-10", "2026-09-20", "2026-10-05");
    // Con la regla o sin ella el total es el mismo: ya está en `expenses`.
    expect(conFijo.find((e) => e.refId === "2026-09")?.monto).toBe(sinFijo.find((e) => e.refId === "2026-09")?.monto);
  });

  it("un fijo de tarjeta que aún no llega sí se suma al ciclo", () => {
    const netflix = regla({ id: "rn", nombre: "Netflix", monto: 45_000, medio_pago: "tc", dia_1: 8 });
    const gastos = [gasto("2026-08-16", 500_000)];
    const conFijo = eventosPagoTarjeta(gastos, [netflix], VACIO, "2026-08-20", "2026-09-20", "2026-10-05");
    const sinFijo = eventosPagoTarjeta(gastos, [], VACIO, "2026-08-20", "2026-09-20", "2026-10-05");
    const dif =
      (sinFijo.find((e) => e.refId === "2026-09")?.monto ?? 0) - (conFijo.find((e) => e.refId === "2026-09")?.monto ?? 0);
    expect(dif).toBe(45_000);
  });

  it("el run-rate no arrastra los fijos ya cobrados del ciclo", () => {
    // Mismo gasto total, pero uno es fijo. El discrecional es menor, así que
    // la extrapolación tiene que ser menor también.
    const soloDiscrecional = [gasto("2026-08-16", 1_000_000)];
    const conFijo = [gasto("2026-08-16", 500_000), gasto("2026-08-17", 500_000, "rn")];
    const a = eventosPagoTarjeta(soloDiscrecional, [], VACIO, "2026-08-20", "2026-09-20", "2026-10-05");
    const b = eventosPagoTarjeta(conFijo, [], VACIO, "2026-08-20", "2026-09-20", "2026-10-05");
    expect(Math.abs(b[0].monto)).toBeLessThan(Math.abs(a[0].monto));
  });

  it("un ciclo sin gastos no genera evento", () => {
    expect(eventosPagoTarjeta([], [], VACIO, "2026-08-20", "2026-08-20", "2026-09-10")).toEqual([]);
  });
});

describe("ciclosSinPagar", () => {
  it("señala un ciclo cerrado cuya fecha de pago ya pasó sin registro", () => {
    const gastos = [gasto("2026-07-20", 1_000_000)];
    expect(ciclosSinPagar(gastos, VACIO, "2026-09-05")).toEqual(["2026-08"]);
  });

  it("no señala uno ya pagado, ni uno cuya fecha aún no llega", () => {
    const gastos = [gasto("2026-07-20", 1_000_000)];
    expect(ciclosSinPagar(gastos, new Set(["2026-08"]), "2026-09-05")).toEqual([]);
    expect(ciclosSinPagar(gastos, VACIO, "2026-08-20")).toEqual([]);
  });
});

describe("proyectar", () => {
  it("sin nada que proyectar, la curva es plana en el saldo del ancla", () => {
    const p = proyectar(entrada({ horizonteDias: 10 }));
    expect(p.saldoHoy).toBe(5_000_000);
    expect(p.serie).toHaveLength(11);
    expect(p.serie.every((s) => s.saldo === 5_000_000)).toBe(true);
    expect(p.minimo.saldo).toBe(5_000_000);
  });

  it("sin ancla el saldo arranca en cero", () => {
    expect(proyectar(entrada({ ancla: null, horizonteDias: 5 })).saldoHoy).toBe(0);
  });

  it("encuentra el punto más apretado y su fecha", () => {
    const p = proyectar(
      entrada({
        horizonteDias: 40,
        reglas: [
          regla({ id: "rg", nombre: "Arriendo", monto: 3_000_000, dia_1: 5 }),
          regla({ id: "ri", tipo: "ingreso", nombre: "Nómina", monto: 4_000_000, dia_1: 15 }),
        ],
      })
    );
    // 5 sep sale el arriendo (queda 2M) y el 15 entra la nómina (vuelve a 6M).
    expect(p.minimo).toEqual({ fecha: "2026-09-05", saldo: 2_000_000 });
  });

  it("marca el primer día bajo el colchón", () => {
    const p = proyectar(
      entrada({
        horizonteDias: 40,
        colchon: 3_000_000,
        reglas: [regla({ monto: 3_000_000, dia_1: 5 })],
      })
    );
    expect(p.bajoColchon).toEqual({ fecha: "2026-09-05", saldo: 2_000_000 });
  });

  it("sin cruce, bajoColchon es null", () => {
    expect(proyectar(entrada({ horizonteDias: 10, colchon: 1_000_000 })).bajoColchon).toBeNull();
  });

  it("el saldo de hoy asume las ocurrencias entre el ancla y hoy que nadie confirmó", () => {
    // Ancla el 1 de agosto con 5M. El arriendo del 5 no se confirmó, pero
    // salió: el saldo de hoy tiene que reflejarlo.
    const p = proyectar(
      entrada({
        hoy: "2026-08-20",
        ancla: { fecha: "2026-08-01", monto: 5_000_000 },
        reglas: [regla({ monto: 2_000_000, dia_1: 5 })],
        horizonteDias: 5,
      })
    );
    expect(p.saldoHoy).toBe(3_000_000);
  });

  it("no descuenta dos veces la ocurrencia que sí se confirmó", () => {
    const movimiento: Movimiento = {
      id: "m1",
      fecha: "2026-08-05",
      monto: -2_000_000,
      tipo: "gasto",
      etiqueta: "Arriendo",
      ref_ciclo: null,
      ref_id: "r1",
      ref_periodo: "2026-08-05",
    };
    const p = proyectar(
      entrada({
        hoy: "2026-08-20",
        ancla: { fecha: "2026-08-01", monto: 5_000_000 },
        movimientos: [movimiento],
        reglas: [regla({ monto: 2_000_000, dia_1: 5 })],
        horizonteDias: 5,
      })
    );
    expect(p.saldoHoy).toBe(3_000_000);
  });

  it("el pago real de un ciclo reemplaza al proyectado aunque caiga en otra fecha", () => {
    // El ciclo 2026-08 se paga "el 30", pero el pago real fue el 2 de
    // septiembre. Tiene que aparecer una sola vez, no dos.
    const pagoReal: Movimiento = {
      id: "m2",
      fecha: "2026-09-02",
      monto: -1_500_000,
      tipo: "pago_tc",
      etiqueta: "Pago TC",
      ref_ciclo: "2026-08",
      ref_id: null,
      ref_periodo: null,
    };
    const p = proyectar(
      entrada({
        hoy: "2026-08-25",
        horizonteDias: 30,
        movimientos: [pagoReal],
        gastosTarjeta: [gasto("2026-07-20", 1_500_000)],
      })
    );
    const pagos = p.eventos.filter((e) => e.tipo === "pago_tc");
    expect(pagos).toHaveLength(1);
    expect(pagos[0]).toMatchObject({ fecha: "2026-09-02", monto: -1_500_000, origen: "real" });
  });

  it("los gastos del ciclo colapsan en un solo evento el día de pago", () => {
    const p = proyectar(
      entrada({
        hoy: "2026-08-20",
        horizonteDias: 20,
        gastosTarjeta: [gasto("2026-07-18", 800_000), gasto("2026-07-25", 400_000), gasto("2026-08-02", 300_000)],
      })
    );
    const pagos = p.eventos.filter((e) => e.tipo === "pago_tc");
    expect(pagos).toHaveLength(1);
    expect(pagos[0]).toMatchObject({ fecha: "2026-08-30", monto: -1_500_000 });
    expect(p.serie[p.serie.length - 1].saldo).toBe(3_500_000);
  });

  it("la serie cubre el horizonte completo, un punto por día", () => {
    const p = proyectar(entrada({ horizonteDias: 90 }));
    expect(p.serie).toHaveLength(91);
    expect(p.serie[0].fecha).toBe("2026-08-20");
    expect(p.serie[90].fecha).toBe("2026-11-18");
  });

  it("los eventos salen ordenados por fecha", () => {
    const p = proyectar(
      entrada({
        horizonteDias: 60,
        reglas: [
          regla({ id: "a", dia_1: 25 }),
          regla({ id: "b", tipo: "ingreso", nombre: "Nómina", monto: 1_000, dia_1: 3 }),
        ],
      })
    );
    const fechas = p.eventos.map((e) => e.fecha);
    expect([...fechas].sort()).toEqual(fechas);
  });
});
