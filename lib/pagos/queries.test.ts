import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { listarPagos, marcarPago, desmarcarPago } from "./queries";

function clienteQueCaptura(respuesta: unknown, status = 200) {
  const peticiones: { url: string; metodo: string; cuerpo: string | null; headers: Headers }[] = [];
  const supabase = createClient("https://ejemplo.supabase.co", "llave-de-prueba", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        peticiones.push({
          url: decodeURIComponent(typeof input === "string" ? input : input.toString()),
          metodo: init?.method ?? "GET",
          cuerpo: typeof init?.body === "string" ? init.body : null,
          headers: new Headers(init?.headers),
        });
        // Status 204 No Content no puede tener body
        const body = status === 204 ? null : JSON.stringify(respuesta);
        return new Response(body, { status, headers: { "Content-Type": "application/json" } });
      }) as typeof fetch,
    },
  });
  return { supabase, peticiones };
}

describe("listarPagos", () => {
  it("ordena por columnas que juntas son únicas, para que no baile entre recargas", async () => {
    const { supabase, peticiones } = clienteQueCaptura([]);
    await listarPagos(supabase);
    expect(peticiones[0].url).toContain("/plan_pagos?");
    expect(peticiones[0].url.match(/order=([^&]+)/)?.[1]).toBe("mes.asc,rubro_id.asc");
  });
});

describe("marcarPago", () => {
  it("upsert sobre (cuenta_id, rubro_id, mes) mandando pagado_el explícito", async () => {
    const fila = { id: "p1", cuenta_id: "c1", rubro_id: "luz", mes: "2026-10", monto: 182_000, pagado_el: "2026-10-02" };
    const { supabase, peticiones } = clienteQueCaptura(fila);
    const { data, error } = await marcarPago(supabase, "c1", "luz", "2026-10", 182_000, "2026-10-02");
    expect(peticiones[0].metodo).toBe("POST");
    expect(peticiones[0].url).toContain("on_conflict=cuenta_id,rubro_id,mes");
    expect(peticiones[0].headers.get("Prefer")).toContain("resolution=merge-duplicates");
    expect(JSON.parse(peticiones[0].cuerpo!)).toEqual({ cuenta_id: "c1", rubro_id: "luz", mes: "2026-10", monto: 182_000, pagado_el: "2026-10-02" });
    expect(error).toBeNull();
    expect(data).toEqual(fila);
  });

  it("propaga el error de la base", async () => {
    const { supabase } = clienteQueCaptura({ code: "23514", message: "no es un gasto fijo" }, 400);
    const { data, error } = await marcarPago(supabase, "c1", "nomina", "2026-10", 1, "2026-10-02");
    expect(data).toBeNull();
    expect(error?.code).toBe("23514");
  });
});

describe("desmarcarPago", () => {
  it("borra filtrando por cuenta, rubro y mes", async () => {
    const { supabase, peticiones } = clienteQueCaptura(null, 204);
    const { error } = await desmarcarPago(supabase, "c1", "luz", "2026-10");
    expect(error).toBeNull();
    expect(peticiones[0].metodo).toBe("DELETE");
    expect(peticiones[0].url).toContain("cuenta_id=eq.c1");
    expect(peticiones[0].url).toContain("rubro_id=eq.luz");
    expect(peticiones[0].url).toContain("mes=eq.2026-10");
  });
});
