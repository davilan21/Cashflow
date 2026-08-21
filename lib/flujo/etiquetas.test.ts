import { describe, it, expect } from "vitest";
import { notaEvento } from "./etiquetas";
import type { EventoCaja } from "./tipos";

function evento(cambios: Partial<EventoCaja> = {}): EventoCaja {
  return {
    fecha: "2026-08-30",
    monto: -100_000,
    tipo: "gasto",
    etiqueta: "Algo",
    origen: "proyectado",
    registrado: false,
    ...cambios,
  };
}

describe("notaEvento", () => {
  it("un pago de tarjeta con monto final pero sin registrar no dice que está hecho", () => {
    // El caso más caro del módulo: el ciclo cerró, el total ya no se mueve,
    // y nadie ha pagado. Decir "confirmado" acá hace que alguien no pague.
    expect(notaEvento(evento({ tipo: "pago_tc", origen: "real", registrado: false }))).toBe(
      "monto final, sin registrar"
    );
  });

  it("lo que salió del libro de caja va como registrado", () => {
    expect(notaEvento(evento({ origen: "real", registrado: true }))).toBe("registrado");
  });

  it("el hecho manda sobre la certeza del monto", () => {
    // Un movimiento registrado se rotula por el hecho aunque su monto fuera
    // una estimación: lo primero que el usuario necesita saber es si existe.
    expect(notaEvento(evento({ origen: "estimado", registrado: true }))).toBe("registrado");
  });

  it("un monto aproximado sin registrar va como estimado", () => {
    expect(notaEvento(evento({ origen: "estimado" }))).toBe("estimado");
  });

  it("un compromiso proyectado corriente no lleva nota", () => {
    expect(notaEvento(evento())).toBeNull();
  });
});
