import { describe, it, expect, vi } from "vitest";

// Sin DOM: useRef/useCallback como identidades alcanzan para probar la lógica del hook.
vi.mock("react", () => ({
  useRef: <T,>(v: T) => ({ current: v }),
  useCallback: <F,>(fn: F) => fn,
}));

import { useColaPorClave } from "./useColaPorClave";

function diferida() {
  let resolver!: () => void;
  let rechazar!: (e: unknown) => void;
  const promesa = new Promise<void>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
}

const vaciar = () => new Promise((r) => setTimeout(r, 0));

describe("useColaPorClave: encolar", () => {
  it("las tareas de una misma clave corren en orden, una después de otra", async () => {
    const { encolar } = useColaPorClave();
    const log: string[] = [];
    const d1 = diferida();
    const p1 = encolar("k", async () => { log.push("1:inicio"); await d1.promesa; log.push("1:fin"); });
    const p2 = encolar("k", async () => { log.push("2:inicio"); });
    await vaciar();
    expect(log).toEqual(["1:inicio"]);
    d1.resolver();
    await Promise.all([p1, p2]);
    expect(log).toEqual(["1:inicio", "1:fin", "2:inicio"]);
  });

  it("claves distintas no se esperan entre sí", async () => {
    const { encolar } = useColaPorClave();
    const log: string[] = [];
    const bloqueada = diferida();
    const pa = encolar("a", async () => { await bloqueada.promesa; log.push("a"); });
    const pb = encolar("b", async () => { log.push("b"); });
    await pb;
    expect(log).toEqual(["b"]);
    bloqueada.resolver();
    await pa;
    expect(log).toEqual(["b", "a"]);
  });

  it("una tarea que falla no frena la siguiente de la misma clave", async () => {
    const { encolar } = useColaPorClave();
    const d1 = diferida();
    const p1 = encolar("k", () => d1.promesa);
    const segunda = vi.fn(async () => {});
    const p2 = encolar("k", segunda);
    d1.rechazar(new Error("falló"));
    await expect(p1).rejects.toThrow("falló");
    await p2;
    expect(segunda).toHaveBeenCalledTimes(1);
  });
});

describe("useColaPorClave: nuevaGeneracion", () => {
  it("solo la generación más nueva de cada clave es la última", () => {
    const { nuevaGeneracion } = useColaPorClave();
    const g1 = nuevaGeneracion("k");
    expect(g1()).toBe(true);
    const g2 = nuevaGeneracion("k");
    const otra = nuevaGeneracion("otra");
    expect([g1(), g2(), otra()]).toEqual([false, true, true]);
  });
});
