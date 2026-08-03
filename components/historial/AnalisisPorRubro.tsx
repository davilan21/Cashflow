import { pesos } from "@/lib/money";
import type { Rubro } from "@/lib/historial";
import type { Category } from "@/lib/types";

export function AnalisisPorRubro({ rubros, catById }: { rubros: Rubro[]; catById: (id: string) => Category }) {
  return (
    <>
      {rubros.map((r) => {
        const cat = catById(r.id);
        const max = Math.max(...r.serie, 1);
        const puntos = r.serie
          .map((v, i) => `${(i / Math.max(1, r.serie.length - 1)) * 56},${18 - (v / max) * 16}`)
          .join(" ");
        return (
          <div key={r.id} className="flex items-center gap-2.5 bg-surface border border-line rounded-xl px-3 py-2.5 mb-1.5">
            <span className="w-[9px] h-[26px] rounded shrink-0" style={{ backgroundColor: cat.color }} />
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] truncate">{cat.nombre}</span>
              <span className="block text-[11px] text-muted mt-0.5">
                <span className="num">{pesos(r.monto)}</span> · {Math.round(r.share)}% del gasto
                {r.delta !== null && (
                  <span
                    className="ml-1.5 text-[11px] font-semibold"
                    style={{ color: r.delta > 0 ? "#C4544F" : "#4E8C5A" }}
                  >
                    {r.delta > 0 ? "▲" : "▼"} {Math.abs(Math.round(r.delta))}%
                  </span>
                )}
              </span>
            </span>
            {r.serie.length > 1 && (
              <svg className="w-14 h-5 shrink-0" viewBox="0 0 56 20" preserveAspectRatio="none" aria-hidden="true">
                <polyline
                  points={puntos}
                  fill="none"
                  stroke={cat.color}
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
        );
      })}
    </>
  );
}
