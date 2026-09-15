"use client";

import { pesos } from "@/lib/money";
import { etiquetaVigencia } from "@/lib/plan/etiquetas";
import type { PlanRubro, TipoRubro } from "@/lib/types";
import { IconoLapiz, IconoMas } from "./Iconos";

function Lista({
  titulo,
  tipo,
  rubros,
  onNuevo,
  onEditar,
}: {
  titulo: string;
  tipo: TipoRubro;
  rubros: PlanRubro[];
  onNuevo: (tipo: TipoRubro) => void;
  onEditar: (r: PlanRubro) => void;
}) {
  return (
    <div className="bg-surface border border-line rounded-2xl mb-3.5">
      <div className="px-4 pt-3.5 pb-1 text-[11px] tracking-wider uppercase text-muted font-semibold">{titulo}</div>
      <div className="divide-y divide-line">
        {rubros.length === 0 && <div className="px-4 py-3 text-[13px] text-muted">Todavía no hay {titulo.toLowerCase()}.</div>}
        {rubros.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onEditar(r)}
            className="w-full flex items-center gap-3 min-h-[56px] px-4 text-left cursor-pointer hover:bg-bg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
            style={{ touchAction: "manipulation" }}
          >
            <span className="flex-1">
              <span className="block text-[15px] text-ink">{r.nombre}</span>
              <span className="block text-[12px] text-muted">{etiquetaVigencia(r.desde, r.hasta)}</span>
            </span>
            <span className="num text-[15px] text-ink">{pesos(r.monto_default)}</span>
            <IconoLapiz className="w-5 h-5 text-muted shrink-0" />
          </button>
        ))}
        <button
          type="button"
          onClick={() => onNuevo(tipo)}
          className="w-full flex items-center gap-2 min-h-[48px] px-4 text-[13px] text-ink font-medium cursor-pointer hover:bg-bg transition-colors duration-150 rounded-b-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
        >
          <IconoMas className="w-5 h-5" />
          Agregar {tipo === "ingreso" ? "ingreso" : "fijo"}
        </button>
      </div>
    </div>
  );
}

export function RubrosPanel({
  rubros,
  onNuevo,
  onEditar,
}: {
  rubros: PlanRubro[];
  onNuevo: (tipo: TipoRubro) => void;
  onEditar: (r: PlanRubro) => void;
}) {
  return (
    <>
      <Lista titulo="Ingresos" tipo="ingreso" rubros={rubros.filter((r) => r.tipo === "ingreso")} onNuevo={onNuevo} onEditar={onEditar} />
      <Lista titulo="Fijos" tipo="fijo" rubros={rubros.filter((r) => r.tipo === "fijo")} onNuevo={onNuevo} onEditar={onEditar} />
    </>
  );
}
