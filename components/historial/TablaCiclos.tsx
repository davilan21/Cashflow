import { etiquetaCiclo, etiquetaPago } from "@/lib/labels";
import { pesos, pesosCorto } from "@/lib/money";
import type { ResumenCiclo } from "@/lib/historial";
import type { Category } from "@/lib/types";

export function TablaCiclos({
  resumen,
  tope,
  catById,
  onSeleccionar,
}: {
  resumen: ResumenCiclo[];
  tope: number;
  catById: (id: string) => Category;
  onSeleccionar: (ciclo: string) => void;
}) {
  return (
    <>
      {[...resumen].reverse().map((r) => {
        const excedido = r.total > tope;
        return (
          <button
            key={r.ciclo}
            onClick={() => onSeleccionar(r.ciclo)}
            className="flex items-center gap-2.5 bg-surface border border-line rounded-xl px-3 py-2.5 mb-1.5 w-full cursor-pointer text-left text-ink"
          >
            <span className="flex-1 min-w-0">
              <span className="block text-sm">{etiquetaCiclo(r.ciclo)}</span>
              <span className="block text-[11px] text-muted mt-0.5">
                {r.enCurso ? "en curso" : `pagado el ${etiquetaPago(r.ciclo)}`}
                {r.topCategoria ? ` · más en ${catById(r.topCategoria).nombre.toLowerCase()}` : ""}
              </span>
            </span>
            <span className="text-[15px] num">{pesos(r.total)}</span>
            {!r.enCurso && (
              <span
                className="text-[11px] px-1.5 py-1 rounded-full font-semibold whitespace-nowrap"
                style={{
                  background: excedido ? "#FBEEED" : "#EEF4EF",
                  color: excedido ? "#8E3733" : "#3A6644",
                }}
              >
                {excedido ? `+${pesosCorto(r.total - tope)}` : "en tope"}
              </span>
            )}
          </button>
        );
      })}
    </>
  );
}
