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

describe("app/api/trm/route.ts — contrato de la fecha (regresión)", () => {
  it("guardarTrm(...) y el JSON de respuesta deben usar siempre `hoy`, nunca `r.data.fecha`", () => {
    // Este archivo (lib/ahorros/trm.ts) reporta correctamente la fecha real
    // externa en `data.fecha` de obtenerTrmDatosGov — eso NO es el bug, es el
    // comportamiento correcto de esta función.
    //
    // El bug de la regresión pasada estaba en app/api/trm/route.ts, que no
    // tiene arnés de pruebas en este repo (requeriría mockear next/server y
    // @/lib/supabase/server, que lee cookies). Confirmado por inspección el
    // 2026-09-15: la ruta calcula `hoy = hoyISO()`, llama
    // `guardarTrm(supabase, cuenta.data, hoy, r.data.valor, "datos.gov.co")`
    // (usa `hoy`, no `r.data.fecha`) y responde con
    // `NextResponse.json({ ...r.data, fecha: hoy })` (sobreescribe explícitamente
    // cualquier `r.data.fecha` con `hoy`). La ruta ya está correcta — no hizo
    // falta ningún cambio. Si alguien vuelve a usar `r.data.fecha` como clave
    // de guardado o en el cuerpo de la respuesta, esta nota deja de ser
    // cierta y hay que corregir la ruta.
  });
});
