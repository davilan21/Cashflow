import { describe, it, expect } from "vitest";
import { cuotaFrancesa, tablaAmortizacion } from "./deuda";
import type { Deuda } from "./tipos";

function deuda(cambios: Partial<Deuda> = {}): Deuda {
  return {
    id: "d1",
    nombre: "Crédito",
    tipo: "credito",
    saldo_actual: 12_000_000,
    saldo_a_fecha: "2026-08-05",
    tasa_mensual: 0.015,
    cuota: null,
    n_cuotas: 24,
    cuotas_pagadas: 12,
    dia_pago: 10,
    medio_pago: "debito",
    instrumento_id: null,
    activa: true,
    ...cambios,
  };
}

describe("cuotaFrancesa", () => {
  it("reparte el saldo en partes iguales cuando no hay intereses", () => {
    expect(cuotaFrancesa(1_200_000, 0, 12)).toBe(100_000);
  });

  it("calcula la cuota del sistema francés", () => {
    // 10.000.000 al 1,5% EM a 12 meses ≈ 916.800
    expect(cuotaFrancesa(10_000_000, 0.015, 12)).toBe(916_800);
  });

  it("con una sola cuota, cobra el saldo más su interés", () => {
    expect(cuotaFrancesa(1_000_000, 0.02, 1)).toBe(1_020_000);
  });

  it("devuelve 0 si no quedan cuotas", () => {
    expect(cuotaFrancesa(1_000_000, 0.02, 0)).toBe(0);
  });
});

describe("tablaAmortizacion", () => {
  it("genera solo las cuotas que faltan, numeradas desde la siguiente", () => {
    const t = tablaAmortizacion(deuda());
    expect(t).toHaveLength(12);
    expect(t[0].numero).toBe(13);
    expect(t[11].numero).toBe(24);
  });

  it("deja el saldo exactamente en cero al final", () => {
    const t = tablaAmortizacion(deuda());
    expect(t[t.length - 1].saldoDespues).toBe(0);
  });

  it("el saldo solo baja, nunca sube", () => {
    const t = tablaAmortizacion(deuda());
    t.forEach((c, i) => {
      const previo = i === 0 ? 12_000_000 : t[i - 1].saldoDespues;
      expect(c.saldoDespues).toBeLessThan(previo);
    });
  });

  it("cada cuota es interés más abono", () => {
    tablaAmortizacion(deuda()).forEach((c) => {
      expect(c.cuota).toBe(c.interes + c.abono);
    });
  });

  it("el interés baja a medida que baja el saldo", () => {
    const t = tablaAmortizacion(deuda());
    expect(t[0].interes).toBeGreaterThan(t[t.length - 1].interes);
  });

  it("usa la cuota real de la deuda cuando viene dada, en vez de la fórmula", () => {
    // La cuota francesa de este crédito es ~1.100.000; con 1.500.000 se paga
    // más rápido y la tabla tiene que respetar el dato real, no la fórmula.
    const t = tablaAmortizacion(deuda({ cuota: 1_500_000 }));
    expect(t[0].cuota).toBe(1_500_000);
    expect(t.length).toBeLessThan(12);
    expect(t[t.length - 1].saldoDespues).toBe(0);
    // La última se recorta a lo que falta: nunca se cobra de más.
    expect(t[t.length - 1].cuota).toBeLessThanOrEqual(1_500_000);
  });

  it("sin intereses, todo el pago es abono", () => {
    const t = tablaAmortizacion(deuda({ tasa_mensual: 0, saldo_actual: 1_200_000, n_cuotas: 12, cuotas_pagadas: 0 }));
    expect(t).toHaveLength(12);
    t.forEach((c) => expect(c.interes).toBe(0));
    expect(t[t.length - 1].saldoDespues).toBe(0);
  });

  it("la última cuota absorbe el redondeo en vez de dejar saldo debiendo", () => {
    // 1.000.000 / 3 no es exacto: la última cuota tiene que cuadrar el resto.
    const t = tablaAmortizacion(deuda({ tasa_mensual: 0, saldo_actual: 1_000_000, n_cuotas: 3, cuotas_pagadas: 0 }));
    expect(t.reduce((s, c) => s + c.abono, 0)).toBe(1_000_000);
    expect(t[t.length - 1].saldoDespues).toBe(0);
  });

  it("devuelve vacío para una deuda ya terminada", () => {
    expect(tablaAmortizacion(deuda({ cuotas_pagadas: 24 }))).toEqual([]);
  });

  it("devuelve vacío para una deuda inactiva o sin saldo", () => {
    expect(tablaAmortizacion(deuda({ activa: false }))).toEqual([]);
    expect(tablaAmortizacion(deuda({ saldo_actual: 0 }))).toEqual([]);
  });

  it("no genera una tabla infinita si la cuota no alcanza a cubrir el interés", () => {
    // Cuota de $1.000 contra un interés mensual de $180.000: dato mal
    // capturado. Se cancela en una sola cuota en vez de proyectar una deuda
    // que crece para siempre.
    const t = tablaAmortizacion(deuda({ cuota: 1_000, saldo_actual: 12_000_000, tasa_mensual: 0.015 }));
    expect(t).toHaveLength(1);
    expect(t[0].saldoDespues).toBe(0);
  });

  it("recorta el día de pago al último del mes cuando no existe", () => {
    const t = tablaAmortizacion(
      deuda({ dia_pago: 31, saldo_a_fecha: "2027-01-01", n_cuotas: 3, cuotas_pagadas: 0 })
    );
    expect(t.map((c) => c.fecha)).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
  });

  it("si el día de pago del mes del saldo ya pasó, la primera cuota es el mes siguiente", () => {
    expect(tablaAmortizacion(deuda({ saldo_a_fecha: "2026-08-05", dia_pago: 10 }))[0].fecha).toBe("2026-08-10");
    expect(tablaAmortizacion(deuda({ saldo_a_fecha: "2026-08-15", dia_pago: 10 }))[0].fecha).toBe("2026-09-10");
  });
});
