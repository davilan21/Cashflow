import { describe, it, expect } from "vitest";
import { escalaSaldo, indicesEquiespaciados } from "./escala";

describe("escalaSaldo", () => {
  it("produce ticks equiespaciados", () => {
    const { ticks } = escalaSaldo(0, 11_000_000);
    const saltos = ticks.slice(1).map((t, i) => t - ticks[i]);
    expect(new Set(saltos).size).toBe(1);
  });

  it("el dominio contiene todos los datos", () => {
    const { dominio } = escalaSaldo(-1_150_000, 11_400_000);
    expect(dominio[0]).toBeLessThanOrEqual(-1_150_000);
    expect(dominio[1]).toBeGreaterThanOrEqual(11_400_000);
  });

  it("incluye el cero cuando el rango lo cruza", () => {
    const { ticks } = escalaSaldo(-2_000_000, 5_000_000);
    expect(ticks).toContain(0);
  });

  it("los ticks empiezan y terminan en el dominio", () => {
    const { dominio, ticks } = escalaSaldo(300_000, 4_800_000);
    expect(ticks[0]).toBe(dominio[0]);
    expect(ticks[ticks.length - 1]).toBe(dominio[1]);
  });

  it("deja aire arriba para la etiqueta del colchón", () => {
    // Un máximo que cae justo en un paso no debe quedar pegado al techo.
    const { dominio } = escalaSaldo(0, 4_000_000);
    expect(dominio[1]).toBeGreaterThan(4_000_000);
  });

  it("aguanta una curva plana sin dividir por cero", () => {
    const { dominio, ticks } = escalaSaldo(5_000_000, 5_000_000);
    expect(dominio[1]).toBeGreaterThan(dominio[0]);
    expect(ticks.length).toBeGreaterThan(1);
  });

  it("escala igual de bien montos chicos que grandes", () => {
    expect(escalaSaldo(0, 400_000).ticks.length).toBeLessThanOrEqual(6);
    expect(escalaSaldo(0, 90_000_000).ticks.length).toBeLessThanOrEqual(6);
  });

  it("no desperdicia el alto del gráfico con aire de más", () => {
    // Un rango de 10,5M no debe estirarse hasta 15M: eso deja la curva
    // aplastada en dos tercios del espacio.
    const { dominio } = escalaSaldo(0, 10_500_000);
    expect(dominio[1]).toBeLessThanOrEqual(12_500_000);
  });
});

describe("indicesEquiespaciados", () => {
  it("siempre incluye el primero y el último", () => {
    const i = indicesEquiespaciados(91, 4);
    expect(i[0]).toBe(0);
    expect(i[i.length - 1]).toBe(90);
    expect(i).toHaveLength(4);
  });

  it("devuelve todos si hay menos de los pedidos", () => {
    expect(indicesEquiespaciados(3, 5)).toEqual([0, 1, 2]);
  });

  it("no explota con una serie vacía", () => {
    expect(indicesEquiespaciados(0, 4)).toEqual([]);
  });
});
