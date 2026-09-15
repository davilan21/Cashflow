import { describe, it, expect } from "vitest";
import { obtenerTrmDatosGov, resolverTrmDeHoy } from "./trm";

const respuesta = (cuerpo: unknown, status = 200) =>
  (async () => new Response(typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;

describe("obtenerTrmDatosGov", () => {
  it("respuesta válida → valor numérico y fecha YYYY-MM-DD", async () => {
    const r = await obtenerTrmDatosGov(respuesta([{ valor: "4123.45", vigenciadesde: "2026-09-15T00:00:00.000", vigenciahasta: "2026-09-15T00:00:00.000", unidad: "COP" }]));
    expect(r).toEqual({ data: { valor: 4123.45, fecha: "2026-09-15", fuente: "datos.gov.co" }, error: null });
  });
  it("valor fuera de [1000, 20000] → error, nunca un número", async () => {
    const r = await obtenerTrmDatosGov(respuesta([{ valor: "41.23", vigenciadesde: "2026-09-15T00:00:00.000" }]));
    expect(r.data).toBeNull();
    expect(r.error).toMatch(/fuera de rango/);
  });
  it("array vacío → error", async () => {
    const r = await obtenerTrmDatosGov(respuesta([]));
    expect(r.data).toBeNull();
    expect(r.error).toMatch(/sin datos/);
  });
  it("JSON inválido → error", async () => {
    const r = await obtenerTrmDatosGov(respuesta("<html>mantenimiento</html>"));
    expect(r.data).toBeNull();
    expect(r.error).toMatch(/inválida/);
  });
  it("HTTP no-2xx → error con el status", async () => {
    const r = await obtenerTrmDatosGov(respuesta([], 503));
    expect(r.error).toMatch(/503/);
  });
  it("timeout → error", async () => {
    const lento = ((_: unknown, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("abort", "AbortError"))))) as unknown as typeof fetch;
    const r = await obtenerTrmDatosGov(lento, 20);
    expect(r.data).toBeNull();
    expect(r.error).toMatch(/tiempo/);
  });
});

describe("resolverTrmDeHoy", () => {
  it("con fila de hoy no llama afuera", async () => {
    let llamadas = 0;
    const f = (async () => { llamadas++; return new Response("[]"); }) as unknown as typeof fetch;
    const r = await resolverTrmDeHoy({ filaHoy: { cuenta_id: "c", fecha: "2026-09-15", valor: 4000, fuente: "manual", created_at: "" }, fetchFn: f });
    expect(llamadas).toBe(0);
    expect(r).toEqual({ data: { valor: 4000, fecha: "2026-09-15", fuente: "manual" }, error: null, llamoAfuera: false });
  });
  it("sin fila de hoy llama afuera y devuelve lo obtenido", async () => {
    const r = await resolverTrmDeHoy({ filaHoy: null, fetchFn: respuesta([{ valor: "4200", vigenciadesde: "2026-09-15T00:00:00.000" }]) });
    expect(r.llamoAfuera).toBe(true);
    expect(r.data?.valor).toBe(4200);
  });
});
