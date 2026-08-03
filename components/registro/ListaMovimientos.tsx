import { useMemo } from "react";
import { mesDe } from "@/lib/ciclo";
import { etiquetaDia } from "@/lib/labels";
import { pesos } from "@/lib/money";
import { ItemGasto } from "./ItemGasto";
import type { Category, Expense } from "@/lib/types";
import type { Vista } from "./Tabs";

export function ListaMovimientos({
  visibles,
  vista,
  catById,
  pendientesIds,
  onEditar,
  onEliminar,
}: {
  visibles: Expense[];
  vista: Vista;
  catById: (id: string) => Category;
  pendientesIds: Set<string>;
  onEditar: (g: Expense) => void;
  onEliminar: (id: string) => void;
}) {
  const porDia = useMemo(() => {
    const mapa = new Map<string, Expense[]>();
    for (const g of visibles) {
      const lista = mapa.get(g.fecha) ?? [];
      lista.push(g);
      mapa.set(g.fecha, lista);
    }
    return [...mapa.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [visibles]);

  return (
    <>
      {porDia.map(([fecha, items], idx) => {
        const anterior = porDia[idx - 1];
        const cambioDeMes = vista === "ciclo" && anterior && mesDe(anterior[0]) !== mesDe(fecha);
        return (
          <div key={fecha}>
            {cambioDeMes && (
              <div className="flex items-center gap-2.5 my-5 text-muted text-[11px] tracking-wider uppercase font-semibold before:content-[''] before:flex-1 before:border-t-2 before:border-dashed before:border-[#CFC8DC] after:content-[''] after:flex-1 after:border-t-2 after:border-dashed after:border-[#CFC8DC]">
                cambio de mes
              </div>
            )}
            <div className="flex justify-between text-xs text-muted px-0.5 pt-2.5 pb-1.5 capitalize">
              <span>{etiquetaDia(fecha)}</span>
              <span className="num">{pesos(items.reduce((s, g) => s + g.monto, 0))}</span>
            </div>
            {items.map((g) => (
              <ItemGasto
                key={g.id}
                gasto={g}
                categoria={catById(g.categoria)}
                pendiente={pendientesIds.has(g.id)}
                onEditar={() => onEditar(g)}
                onEliminar={() => onEliminar(g.id)}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}
