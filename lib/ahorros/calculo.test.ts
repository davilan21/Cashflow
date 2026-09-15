import { describe, it, expect } from "vitest";
import { trmVigente, aCOP, resumenInstrumento } from "./calculo";
import type { AhorroInstrumento, AhorroMovimiento, AhorroValoracion, Trm } from "@/lib/types";

export function inst(p: Partial<AhorroInstrumento> & Pick<AhorroInstrumento, "id">): AhorroInstrumento {
  return {
    cuenta_id: "c1", nombre: p.id, tipo: "cuenta", moneda: "COP", titular: null, entidad: null,
    tasa_ea: null, vencimiento: null, activo: true, created_by: null, created_at: "", updated_at: "",
    ...p,
  };
}
export function mov(instrumento_id: string, fecha: string, tipo: "aporte" | "retiro", monto: number): AhorroMovimiento {
  return { id: `${instrumento_id}-${fecha}-${tipo}-${monto}`, cuenta_id: "c1", instrumento_id, fecha, tipo, monto, nota: null, created_by: null, created_at: "" };
}
export function val(instrumento_id: string, fecha: string, valor: number): AhorroValoracion {
  return { id: `${instrumento_id}-${fecha}`, cuenta_id: "c1", instrumento_id, fecha, valor, nota: null, created_by: null, created_at: "" };
}
export function trm(fecha: string, valor: number, fuente: "datos.gov.co" | "manual" = "datos.gov.co"): Trm {
  return { cuenta_id: "c1", fecha, valor, fuente, created_at: "" };
}

const HOY = "2026-09-15";

describe("trmVigente", () => {
  it("la más reciente con fecha <= la pedida; ignora futuras", () => {
    const trms = [trm("2026-09-01", 4000), trm("2026-09-14", 4100), trm("2026-09-20", 4200)];
    expect(trmVigente(trms, HOY)?.valor).toBe(4100);
    expect(trmVigente(trms, "2026-08-31")).toBeNull();
    expect(trmVigente([], HOY)).toBeNull();
  });
});

describe("aCOP", () => {
  it("COP pasa igual; USD multiplica y redondea; USD sin TRM → null", () => {
    expect(aCOP(1500, "COP", null)).toBe(1500);
    expect(aCOP(10.5, "USD", trm(HOY, 4100.25))).toBe(43053);
    expect(aCOP(10.5, "USD", null)).toBeNull();
  });
});

describe("resumenInstrumento", () => {
  const cdt = inst({ id: "cdt1", tipo: "cdt", tasa_ea: 10, vencimiento: "2026-10-27" });

  it("aportado = aportes − retiros, ignorando fecha futura", () => {
    const r = resumenInstrumento(cdt, [mov("cdt1", "2026-08-01", "aporte", 1_000_000), mov("cdt1", "2026-09-01", "retiro", 200_000), mov("cdt1", "2026-09-20", "aporte", 999)], [], null, HOY);
    expect(r.aportado).toBe(800_000);
  });

  it("sin valoraciones: valor = aportado, origen 'aportado', rendimiento 0", () => {
    const r = resumenInstrumento(cdt, [mov("cdt1", "2026-08-01", "aporte", 1_000_000)], [], null, HOY);
    expect(r.valor).toBe(1_000_000);
    expect(r.origenValor).toEqual({ tipo: "aportado" });
    expect(r.rendimiento).toBe(0);
    expect(r.rendimientoPct).toBe(0);
  });

  it("valor = la valoración más reciente <= hoy; las futuras se ignoran", () => {
    const vals = [val("cdt1", "2026-08-20", 1_050_000), val("cdt1", "2026-09-03", 1_100_000), val("cdt1", "2026-09-30", 9_999_999)];
    const r = resumenInstrumento(cdt, [mov("cdt1", "2026-08-01", "aporte", 1_000_000)], vals, null, HOY);
    expect(r.valor).toBe(1_100_000);
    expect(r.origenValor).toEqual({ tipo: "valoracion", fecha: "2026-09-03" });
    expect(r.rendimiento).toBe(100_000);
    expect(r.rendimientoPct).toBe(10);
  });

  it("aportado <= 0 → rendimientoPct null, sin lanzar", () => {
    const r = resumenInstrumento(cdt, [mov("cdt1", "2026-08-01", "aporte", 100), mov("cdt1", "2026-08-02", "retiro", 150)], [val("cdt1", "2026-09-01", 20)], null, HOY);
    expect(r.aportado).toBe(-50);
    expect(r.rendimientoPct).toBeNull();
    expect(resumenInstrumento(cdt, [], [], null, HOY).rendimientoPct).toBeNull();
  });

  it("USD: COP con la TRM dada; sin TRM → null (no 0)", () => {
    const acc = inst({ id: "acc", tipo: "acciones", moneda: "USD" });
    const movs = [mov("acc", "2026-08-01", "aporte", 100)];
    const con = resumenInstrumento(acc, movs, [val("acc", "2026-09-10", 120)], trm(HOY, 4000), HOY);
    expect(con).toMatchObject({ aportadoCOP: 400_000, valorCOP: 480_000, rendimientoCOP: 80_000 });
    const sin = resumenInstrumento(acc, movs, [val("acc", "2026-09-10", 120)], null, HOY);
    expect(sin).toMatchObject({ aportadoCOP: null, valorCOP: null, rendimientoCOP: null, valor: 120 });
  });

  it("CDT: vigente > 30 días, por_vencer 0..30, vencido < 0; sin vencimiento → null", () => {
    const en45 = inst({ id: "a", tipo: "cdt", vencimiento: "2026-10-30" });
    const en30 = inst({ id: "b", tipo: "cdt", vencimiento: "2026-10-15" });
    const en1 = inst({ id: "c", tipo: "cdt", vencimiento: "2026-09-16" });
    const ayer = inst({ id: "d", tipo: "cdt", vencimiento: "2026-09-14" });
    expect(resumenInstrumento(en45, [], [], null, HOY).cdt).toEqual({ diasAlVencimiento: 45, estado: "vigente" });
    expect(resumenInstrumento(en30, [], [], null, HOY).cdt).toEqual({ diasAlVencimiento: 30, estado: "por_vencer" });
    expect(resumenInstrumento(en1, [], [], null, HOY).cdt?.estado).toBe("por_vencer");
    expect(resumenInstrumento(ayer, [], [], null, HOY).cdt).toEqual({ diasAlVencimiento: -1, estado: "vencido" });
    expect(resumenInstrumento(inst({ id: "e", tipo: "cdt" }), [], [], null, HOY).cdt).toBeNull();
    expect(resumenInstrumento(inst({ id: "f", tipo: "fondo" }), [], [], null, HOY).cdt).toBeNull();
  });

  it("solo cuenta movimientos y valoraciones de ESTE instrumento", () => {
    const r = resumenInstrumento(cdt, [mov("otro", "2026-08-01", "aporte", 5_000_000), mov("cdt1", "2026-08-01", "aporte", 1)], [val("otro", "2026-09-01", 7)], null, HOY);
    expect(r.aportado).toBe(1);
    expect(r.valor).toBe(1);
  });
});

import { resumenPortafolio } from "./calculo";

describe("resumenPortafolio", () => {
  const instrumentos = [
    inst({ id: "cdtD", tipo: "cdt", titular: "u1", vencimiento: "2027-01-01" }),
    inst({ id: "accM", tipo: "acciones", moneda: "USD", titular: "u2" }),
    inst({ id: "fondoH", tipo: "fondo" }), // titular null = hogar
    inst({ id: "viejo", tipo: "cuenta", activo: false }),
  ];
  const movimientos = [
    mov("cdtD", "2026-01-10", "aporte", 3_000_000),
    mov("accM", "2026-02-01", "aporte", 100),
    mov("fondoH", "2026-03-01", "aporte", 1_000_000),
    mov("viejo", "2026-01-01", "aporte", 500_000),
  ];
  const valoraciones = [val("cdtD", "2026-09-01", 3_300_000), val("accM", "2026-09-01", 125)];
  const trms = [trm("2026-09-01", 4000)];
  const base = { instrumentos, movimientos, valoraciones, trms, hoy: HOY };

  it("totales en COP con TRM; inactivos cuentan por defecto", () => {
    const r = resumenPortafolio(base);
    // cdt 3.3M + acc 125×4000=500k + fondo 1M + viejo 500k
    expect(r.totalValorCOP).toBe(5_300_000);
    expect(r.totalAportadoCOP).toBe(3_000_000 + 400_000 + 1_000_000 + 500_000);
    expect(r.rendimientoCOP).toBe(400_000);
    expect(r.rendimientoPct).toBeCloseTo((400_000 / 4_900_000) * 100, 6);
    expect(r.usdSinConvertir).toBe(0);
    expect(r.trm?.valor).toBe(4000);
  });

  it("soloActivos excluye los liquidados", () => {
    const r = resumenPortafolio({ ...base, filtro: { soloActivos: true } });
    expect(r.totalValorCOP).toBe(4_800_000);
    expect(r.instrumentos.map((i) => i.instrumento.id)).not.toContain("viejo");
  });

  it("sin TRM: los USD quedan fuera del total y se reportan aparte", () => {
    const r = resumenPortafolio({ ...base, trms: [] });
    expect(r.totalValorCOP).toBe(4_800_000);
    expect(r.usdSinConvertir).toBe(125);
    expect(r.trm).toBeNull();
    expect(r.instrumentos.find((i) => i.instrumento.id === "accM")?.valorCOP).toBeNull();
  });

  it("orden por valorCOP desc, los sin COP al final", () => {
    const r = resumenPortafolio({ ...base, trms: [] });
    expect(r.instrumentos.map((i) => i.instrumento.id)).toEqual(["cdtD", "fondoH", "viejo", "accM"]);
  });

  it("porTitular y porTipo suman 100 y el null cae en 'hogar'", () => {
    const r = resumenPortafolio(base);
    const suma = (p: { pct: number }[]) => p.reduce((s, x) => s + x.pct, 0);
    expect(suma(r.porTitular)).toBeCloseTo(100, 2);
    expect(suma(r.porTipo)).toBeCloseTo(100, 2);
    expect(r.porTitular.find((p) => p.clave === "hogar")?.valorCOP).toBe(1_500_000);
    expect(r.porTitular.find((p) => p.clave === "u1")?.valorCOP).toBe(3_300_000);
    expect(r.porTipo.find((p) => p.clave === "cdt")?.valorCOP).toBe(3_300_000);
  });

  it("filtro por titular: solo ese titular; null = hogar", () => {
    expect(resumenPortafolio({ ...base, filtro: { titular: "u1" } }).totalValorCOP).toBe(3_300_000);
    expect(resumenPortafolio({ ...base, filtro: { titular: null } }).totalValorCOP).toBe(1_500_000); // fondo + viejo (hogar)
  });

  it("portafolio vacío: ceros y pct null, sin lanzar", () => {
    const r = resumenPortafolio({ instrumentos: [], movimientos: [], valoraciones: [], trms: [], hoy: HOY });
    expect(r).toMatchObject({ totalValorCOP: 0, totalAportadoCOP: 0, rendimientoCOP: 0, rendimientoPct: null, usdSinConvertir: 0 });
    expect(r.porTitular).toEqual([]);
  });
});
