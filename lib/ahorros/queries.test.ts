import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { listarMovimientos, crearMovimiento, guardarValoracion, guardarTrm, listarInstrumentos } from "./queries";

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
        return new Response(JSON.stringify(respuesta), { status, headers: { "Content-Type": "application/json" } });
      }) as typeof fetch,
    },
  });
  return { supabase, peticiones };
}

describe("listarMovimientos", () => {
  it("ordena fecha desc, created_at desc y convierte numeric a number", async () => {
    const { supabase, peticiones } = clienteQueCaptura([{ id: "m1", monto: "1234.56", fecha: "2026-09-01", tipo: "aporte" }]);
    const { data, error } = await listarMovimientos(supabase);
    expect(error).toBeNull();
    expect(peticiones[0].url.match(/order=([^&]+)/)?.[1]).toBe("fecha.desc,created_at.desc");
    expect(data?.[0].monto).toBe(1234.56);
    expect(typeof data?.[0].monto).toBe("number");
  });
});

describe("listarInstrumentos", () => {
  it("tasa_ea null se conserva; numérica se convierte", async () => {
    const { supabase } = clienteQueCaptura([{ id: "a", tasa_ea: null }, { id: "b", tasa_ea: "10.500" }]);
    const { data } = await listarInstrumentos(supabase);
    expect(data?.[0].tasa_ea).toBeNull();
    expect(data?.[1].tasa_ea).toBe(10.5);
  });
});

describe("crearMovimiento", () => {
  it("envía tipo y monto positivo; devuelve la fila pelada de .single()", async () => {
    const fila = { id: "m1", cuenta_id: "c1", instrumento_id: "i1", fecha: "2026-09-15", tipo: "retiro", monto: "500.00", nota: null };
    const { supabase, peticiones } = clienteQueCaptura(fila);
    const { data, error } = await crearMovimiento(supabase, "c1", { instrumento_id: "i1", fecha: "2026-09-15", tipo: "retiro", monto: 500, nota: null });
    expect(peticiones[0].metodo).toBe("POST");
    expect(JSON.parse(peticiones[0].cuerpo!)).toMatchObject({ cuenta_id: "c1", instrumento_id: "i1", tipo: "retiro", monto: 500 });
    expect(peticiones[0].headers.get("Accept")).toBe("application/vnd.pgrst.object+json");
    expect(error).toBeNull();
    expect(data?.monto).toBe(500);
  });
  it("un 403 vuelve como error con código, no se traga", async () => {
    const { supabase } = clienteQueCaptura({ message: "new row violates row-level security policy", code: "42501" }, 403);
    const { data, error } = await crearMovimiento(supabase, "c1", { instrumento_id: "i1", fecha: "2026-09-15", tipo: "aporte", monto: 1, nota: null });
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });
});

describe("guardarValoracion", () => {
  it("upsert sobre (instrumento_id, fecha)", async () => {
    const fila = { id: "v1", cuenta_id: "c1", instrumento_id: "i1", fecha: "2026-09-15", valor: "1100000.00", nota: null };
    const { supabase, peticiones } = clienteQueCaptura(fila);
    const { data, error } = await guardarValoracion(supabase, "c1", "i1", "2026-09-15", 1_100_000, null);
    expect(peticiones[0].url).toContain("on_conflict=instrumento_id,fecha");
    expect(peticiones[0].headers.get("Prefer")).toContain("resolution=merge-duplicates");
    expect(error).toBeNull();
    expect(data?.valor).toBe(1_100_000);
  });
});

describe("guardarTrm", () => {
  it("upsert sobre (cuenta_id, fecha) con fuente", async () => {
    const fila = { cuenta_id: "c1", fecha: "2026-09-15", valor: "4123.4500", fuente: "manual" };
    const { supabase, peticiones } = clienteQueCaptura(fila);
    const { data, error } = await guardarTrm(supabase, "c1", "2026-09-15", 4123.45, "manual");
    expect(peticiones[0].url).toContain("on_conflict=cuenta_id,fecha");
    expect(JSON.parse(peticiones[0].cuerpo!)).toMatchObject({ fuente: "manual", valor: 4123.45 });
    expect(error).toBeNull();
    expect(data?.valor).toBe(4123.45);
  });
});
