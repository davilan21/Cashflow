"use client";

import { etiquetaCiclo, etiquetaCorta } from "@/lib/labels";
import { pesos, pesosCorto } from "@/lib/money";
import type { ResumenCiclo } from "@/lib/historial";

const colorPorTotal = (total: number, tope: number) =>
  total > tope ? "#C4544F" : total > tope * 0.8 ? "#C08A2E" : "#4E8C5A";

export function GraficaCiclos({
  ventana,
  tope,
  onSeleccionar,
}: {
  ventana: ResumenCiclo[];
  tope: number;
  onSeleccionar: (ciclo: string) => void;
}) {
  const maxPlot = Math.max(tope, ...ventana.map((r) => r.total), 1) * 1.12;
  const topeY = (tope / maxPlot) * 100;

  return (
    <div className="bg-surface border border-line rounded-2xl px-3.5 pt-4 pb-2.5">
      <div className="relative flex items-end gap-1.5 h-[140px]">
        <div className="absolute left-0 right-0 border-t-2 border-dashed border-ink/35" style={{ bottom: `${topeY}%` }} />
        <span
          className="absolute right-0 text-[10px] text-muted bg-surface pl-1"
          style={{ bottom: `${topeY}%`, transform: "translateY(-14px)" }}
        >
          tope {pesosCorto(tope)}
        </span>
        {ventana.map((r) => (
          <button
            key={r.ciclo}
            onClick={() => onSeleccionar(r.ciclo)}
            aria-label={`Ciclo ${etiquetaCiclo(r.ciclo)}: ${pesos(r.total)}`}
            className="flex-1 flex flex-col justify-end items-center h-full bg-none border-none p-0 cursor-pointer"
          >
            {ventana.length <= 6 && <span className="text-[10px] text-muted mb-1 num">{pesosCorto(r.total)}</span>}
            <span
              className="w-full rounded-t-[5px] rounded-b-[2px]"
              style={{
                height: `${Math.max(2, (r.total / maxPlot) * 100)}%`,
                backgroundColor: colorPorTotal(r.total, tope),
                opacity: r.enCurso ? 0.55 : 1,
                backgroundImage:
                  "repeating-linear-gradient(115deg, rgba(255,255,255,0.2) 0 2px, transparent 2px 6px)",
              }}
            />
          </button>
        ))}
      </div>
      <div className="flex gap-1.5 mt-2">
        {ventana.map((r) => (
          <span key={r.ciclo} className="flex-1 text-center text-[10px] text-muted">
            {etiquetaCorta(r.ciclo)}
          </span>
        ))}
      </div>
    </div>
  );
}
