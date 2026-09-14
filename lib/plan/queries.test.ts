import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { listarRubros, guardarAjuste, quitarAjuste, eliminarRubro } from "./queries";

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
        return new Response(JSON.stringify(respuesta), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch,
    },
  });
  return { supabase, peticiones };
}

describe("listarRubros", () => {
  it("ordena por tipo, orden y created_at para que la lista no baile entre recargas", async () => {
    const { supabase, peticiones } = clienteQueCaptura([]);
    const { error } = await listarRubros(supabase);
    expect(error).toBeNull();
    const orden = peticiones[0].url.match(/order=([^&]+)/)?.[1];
    expect(orden).toBe("tipo.asc,orden.asc,created_at.asc");
  });
});

describe("guardarAjuste", () => {
  it("hace upsert sobre (cuenta_id, mes, rubro_id) y devuelve la fila", async () => {
    const fila = { id: "a1", cuenta_id: "c1", mes: "2026-10", rubro_id: null, monto: 4_000_000, updated_at: "" };
    const { supabase, peticiones } = clienteQueCaptura([fila]);
    const { data, error } = await guardarAjuste(supabase, "c1", "2026-10", null, 4_000_000);

    expect(peticiones[0].metodo).toBe("POST");
    expect(peticiones[0].url).toContain("on_conflict=cuenta_id,mes,rubro_id");
    expect(peticiones[0].headers.get("Prefer")).toContain("resolution=merge-duplicates");
    expect(JSON.parse(peticiones[0].cuerpo!)).toMatchObject({ cuenta_id: "c1", mes: "2026-10", rubro_id: null, monto: 4_000_000 });
    expect(error).toBeNull();
    expect(data).toEqual(fila);
  });

  it("devuelve el error de Supabase, no lo traga", async () => {
    const { supabase } = clienteQueCaptura({ message: "new row violates row-level security policy", code: "42501" }, 403);
    const { data, error } = await guardarAjuste(supabase, "c1", "2026-10", null, 1);
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });
});

describe("quitarAjuste", () => {
  it("borra por la clave; con rubro_id null usa `is.null`", async () => {
    const { supabase, peticiones } = clienteQueCaptura([]);
    const { error } = await quitarAjuste(supabase, "c1", "2026-10", null);
    expect(error).toBeNull();
    expect(peticiones[0].metodo).toBe("DELETE");
    expect(peticiones[0].url).toContain("cuenta_id=eq.c1");
    expect(peticiones[0].url).toContain("mes=eq.2026-10");
    expect(peticiones[0].url).toContain("rubro_id=is.null");
  });
  it("con rubro_id usa `eq`", async () => {
    const { supabase, peticiones } = clienteQueCaptura([]);
    await quitarAjuste(supabase, "c1", "2026-10", "r1");
    expect(peticiones[0].url).toContain("rubro_id=eq.r1");
  });
});

describe("eliminarRubro", () => {
  it("borra por id", async () => {
    const { supabase, peticiones } = clienteQueCaptura([]);
    const { error } = await eliminarRubro(supabase, "r1");
    expect(error).toBeNull();
    expect(peticiones[0].metodo).toBe("DELETE");
    expect(peticiones[0].url).toContain("id=eq.r1");
  });
});
