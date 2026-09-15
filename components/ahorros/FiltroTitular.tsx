"use client";

import type { Miembro } from "@/lib/types";
import { nombreTitular } from "@/lib/ahorros/etiquetas";

/** undefined = todos; null = hogar; string = ese miembro. */
export type ValorFiltro = string | null | undefined;

export function FiltroTitular({
  miembros,
  valor,
  onCambiar,
}: {
  miembros: Miembro[];
  valor: ValorFiltro;
  onCambiar: (v: ValorFiltro) => void;
}) {
  if (miembros.length < 2) return null; // cuenta individual: no hay nada que filtrar
  const opciones: { clave: ValorFiltro; etiqueta: string }[] = [
    { clave: undefined, etiqueta: "Todos" },
    ...miembros.map((m) => ({ clave: m.user_id, etiqueta: nombreTitular(m.user_id, miembros) })),
  ];
  return (
    <div role="tablist" className="flex gap-1.5 mb-4 overflow-x-auto">
      {opciones.map((o) => {
        const activo = o.clave === valor;
        return (
          <button
            key={String(o.clave)}
            role="tab"
            aria-selected={activo}
            onClick={() => onCambiar(o.clave)}
            className={`shrink-0 min-h-[36px] px-3 rounded-xl border text-[13px] cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 ${
              activo ? "border-ink bg-ink text-white font-medium" : "border-line bg-surface text-muted"
            }`}
          >
            {o.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
