import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { ultimoSaldo } from "./queries";

/**
 * Estas pruebas miran la consulta que se le pide a PostgREST, no una respuesta
 * simulada: el orden que viaja en la URL es lo que decide qué fila devuelve
 * Postgres, y es exactamente donde estuvo el defecto. Lo único fingido es el
 * transporte.
 */
function clienteQueCaptura(filas: unknown[]) {
  const urls: string[] = [];
  const supabase = createClient("https://ejemplo.supabase.co", "llave-de-prueba", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (async (input: RequestInfo | URL) => {
        urls.push(typeof input === "string" ? input : input.toString());
        return new Response(JSON.stringify(filas), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch,
    },
  });
  return { supabase, urls };
}

describe("ultimoSaldo", () => {
  it("desempata por created_at: re-anclar el mismo día tiene que ganarle al ancla vieja", async () => {
    // Re-anclar es insertar, nunca editar, así que varias filas con la misma
    // `fecha` son el caso normal. Ordenando solo por `fecha`, Postgres devuelve
    // cualquiera de las dos —en la práctica la más vieja— y el saldo que el
    // usuario acaba de corregir se ignora en silencio.
    const { supabase, urls } = clienteQueCaptura([{ fecha: "2026-08-21", monto: 2_200_000 }]);
    const { data, error } = await ultimoSaldo(supabase);

    const orden = decodeURIComponent(urls[0]).match(/order=([^&]+)/)?.[1];
    // `fecha` decide, `created_at` desempata el re-anclaje del mismo día. El
    // `id` final solo tiene que estar; su valor no aporta semántica.
    expect(orden?.startsWith("fecha.desc,created_at.desc")).toBe(true);
    // Sin esto la prueba pasaría igual con un 400 de PostgREST —por ejemplo
    // si alguna de las columnas del orden no existiera— porque solo miraría
    // la URL que se pidió, no lo que volvió.
    expect(error).toBeNull();
    expect(data).toEqual({ fecha: "2026-08-21", monto: 2_200_000 });
  });

  it("solo mira el ancla consolidada, no las de un instrumento", async () => {
    const { supabase, urls } = clienteQueCaptura([]);
    const { data, error } = await ultimoSaldo(supabase);

    expect(decodeURIComponent(urls[0])).toContain("instrumento_id=is.null");
    expect(error).toBeNull();
    expect(data).toBeNull();
  });
});
