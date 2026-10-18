import { describe, it, expect } from "vitest";
import { parsearCsvTarjeta, categoriaDeComercio, fechaBanco, sqlCargaRespaldo } from "./tarjeta-csv";

const CSV = `Tipo de cuenta,Nombre,Número,Saldo
CCA,Tarjeta de Crédito,4899250091087095,1187362.22
Tipo de transacción,Fecha,Descripción,Valor
Debito,18-oct-2026,MASA FONTANAR       ,-103910
Debito,16-oct-2026,FARMATODO CHIA      ,-64606
Debito,15-oct-2026,CUOTA DE MANEJO,-32800
Credito,2-oct-2026,GRACIAS POR SU PAGO,34050
Debito,24-sept-2026,7 ELEVEN T2 ULTIMA ESP MEXICO DF     MX,-35092.45
Debito,24-sept-2026,7 ELEVEN T2 ULTIMA ESP MEXICO DF     MX,-15659.53
`;

describe("fechaBanco", () => {
  it("convierte día-mes-año con meses abreviados en español", () => {
    expect(fechaBanco("18-oct-2026")).toBe("2026-10-18");
    expect(fechaBanco("2-oct-2026")).toBe("2026-10-02");
    expect(fechaBanco("24-sept-2026")).toBe("2026-09-24");
    expect(fechaBanco("5-ago-2026")).toBe("2026-08-05");
    expect(fechaBanco("1-sep-2026")).toBe("2026-09-01");
  });

  it("rechaza fechas que no entiende en vez de inventar una", () => {
    expect(() => fechaBanco("2026-10-18")).toThrow();
    expect(() => fechaBanco("18-xyz-2026")).toThrow();
    expect(() => fechaBanco("31-feb-2026")).toThrow();
  });
});

describe("parsearCsvTarjeta", () => {
  it("toma solo débitos desde la fecha dada, con monto positivo en pesos", () => {
    const filas = parsearCsvTarjeta(CSV, { desde: "2026-10-15" });
    expect(filas.map((f) => [f.fecha, f.monto, f.descripcion])).toEqual([
      ["2026-10-18", 103910, "MASA FONTANAR"],
      ["2026-10-16", 64606, "FARMATODO CHIA"],
      ["2026-10-15", 32800, "CUOTA DE MANEJO"],
    ]);
  });

  it("ignora los pagos (Credito)", () => {
    const filas = parsearCsvTarjeta(CSV, { desde: "2026-01-01" });
    expect(filas.some((f) => f.descripcion.includes("GRACIAS"))).toBe(false);
  });

  it("redondea decimales al peso y colapsa espacios internos", () => {
    const filas = parsearCsvTarjeta(CSV, { desde: "2026-09-01" });
    const mx = filas.filter((f) => f.fecha === "2026-09-24");
    expect(mx.map((f) => f.monto)).toEqual([35092, 15660]);
    expect(mx[0].descripcion).toBe("7 ELEVEN T2 ULTIMA ESP MEXICO DF MX");
  });

  it("la huella es estable entre exports acumulados del mismo banco", () => {
    const a = parsearCsvTarjeta(CSV, { desde: "2026-10-15" });
    const masNuevo = CSV.replace(
      "Tipo de transacción,Fecha,Descripción,Valor\n",
      "Tipo de transacción,Fecha,Descripción,Valor\nDebito,19-oct-2026,OTRA COMPRA,-1000\n"
    );
    const b = parsearCsvTarjeta(masNuevo, { desde: "2026-10-15" });
    for (const fila of a) expect(b.map((x) => x.ref)).toContain(fila.ref);
  });

  it("dos filas idénticas el mismo día tienen huellas distintas", () => {
    const dup = `Tipo de transacción,Fecha,Descripción,Valor
Debito,18-oct-2026,OXXO,-2000
Debito,18-oct-2026,OXXO,-2000
`;
    const filas = parsearCsvTarjeta(dup, { desde: "2026-10-01" });
    expect(filas).toHaveLength(2);
    expect(filas[0].ref).not.toBe(filas[1].ref);
  });

  it("falla ruidoso si no encuentra el encabezado de movimientos", () => {
    expect(() => parsearCsvTarjeta("a,b,c\n1,2,3\n", { desde: "2026-10-01" })).toThrow(/encabezado/);
  });

  it("falla ruidoso con un valor que no es número", () => {
    const malo = `Tipo de transacción,Fecha,Descripción,Valor
Debito,18-oct-2026,ALGO,abc
`;
    expect(() => parsearCsvTarjeta(malo, { desde: "2026-10-01" })).toThrow(/valor/i);
  });

  it("acepta comas dentro de la descripción", () => {
    const coma = `Tipo de transacción,Fecha,Descripción,Valor
Debito,18-oct-2026,TIENDA, S.A.,-5000
`;
    expect(parsearCsvTarjeta(coma, { desde: "2026-10-01" })[0].descripcion).toBe("TIENDA, S.A.");
  });
});

describe("categoriaDeComercio", () => {
  it("propone categoría por palabras clave del comercio", () => {
    expect(categoriaDeComercio("MASA FONTANAR")).toBe("restaurantes");
    expect(categoriaDeComercio("OSAKI CHIA")).toBe("restaurantes");
    expect(categoriaDeComercio("PRICESMART CHIA")).toBe("mercado");
    expect(categoriaDeComercio("TEXACO EDS LAS MARGA")).toBe("transporte");
    expect(categoriaDeComercio("FARMATODO CHIA")).toBe("salud");
    expect(categoriaDeComercio("CUOTA DE MANEJO")).toBe("otros");
    expect(categoriaDeComercio("SEGURO VIDA DEUDOR")).toBe("otros");
    expect(categoriaDeComercio("ALGO DESCONOCIDO")).toBe("otros");
  });
});

describe("sqlCargaRespaldo", () => {
  const filas = parsearCsvTarjeta(
    `Tipo de transacción,Fecha,Descripción,Valor
Debito,18-oct-2026,O'HARA CAFE,-5000
`,
    { desde: "2026-10-01" }
  );

  it("inserta como respaldo, idempotente por huella y con comillas escapadas", () => {
    const sql = sqlCargaRespaldo(filas, { cuentaId: "c-1", createdBy: "u-1" });
    expect(sql).toContain("'respaldo'");
    expect(sql).toContain("O''HARA CAFE");
    expect(sql).toContain("on conflict (cuenta_id, ref_import) where ref_import is not null do nothing");
    expect(sql).toContain("'restaurantes'");
  });

  it("rechaza ids que no son uuid-ish para no inyectar SQL", () => {
    expect(() => sqlCargaRespaldo(filas, { cuentaId: "x'; drop table expenses; --", createdBy: "u-1" })).toThrow();
  });

  it("vacío si no hay filas", () => {
    expect(sqlCargaRespaldo([], { cuentaId: "c-1", createdBy: "u-1" })).toBe("");
  });
});
