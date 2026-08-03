import { pesos } from "@/lib/money";
import type { Category, Expense } from "@/lib/types";

export function ItemGasto({
  gasto,
  categoria,
  pendiente,
  onEditar,
  onEliminar,
}: {
  gasto: Expense;
  categoria: Category;
  pendiente: boolean;
  onEditar: () => void;
  onEliminar: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 bg-surface border border-line rounded-xl px-3 py-2.5 mb-1.5">
      <span className="w-[9px] h-[26px] rounded shrink-0" style={{ backgroundColor: categoria.color }} />
      <button
        onClick={onEditar}
        className="flex-1 min-w-0 bg-none border-none p-0 m-0 text-left cursor-pointer text-ink"
        aria-label={`Editar ${gasto.nota || categoria.nombre}`}
      >
        <span className="block text-sm truncate">{gasto.nota || categoria.nombre}</span>
        <span className="block text-[11px] text-muted mt-0.5">{categoria.nombre}</span>
      </button>
      {pendiente && (
        <span className="text-[10px] text-muted border border-line rounded-full px-1.5 py-0.5 shrink-0">pendiente</span>
      )}
      <span className="text-[15px] font-medium num">{pesos(gasto.monto)}</span>
      <button
        onClick={onEliminar}
        aria-label="Eliminar consumo"
        className="border-none bg-none text-[#B9B2C6] cursor-pointer text-lg px-1 leading-none"
      >
        ×
      </button>
    </div>
  );
}
