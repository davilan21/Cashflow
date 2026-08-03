"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { pesos } from "@/lib/money";
import type { Category, NuevoGasto } from "@/lib/types";

export function ConfirmarGastos({
  propuestos,
  categorias,
  onConfirmar,
  onCancelar,
}: {
  propuestos: NuevoGasto[];
  categorias: Category[];
  onConfirmar: (gastos: NuevoGasto[]) => void;
  onCancelar: () => void;
}) {
  const [items, setItems] = useState<NuevoGasto[]>(propuestos);

  const actualizar = (i: number, cambios: Partial<NuevoGasto>) =>
    setItems((prev) => prev.map((g, idx) => (idx === i ? { ...g, ...cambios } : g)));

  const quitar = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const total = items.reduce((s, g) => s + g.monto, 0);

  return (
    <Modal onClose={onCancelar}>
      <h3 className="text-[17px] font-semibold text-ink">
        {items.length === 1 ? "Confirma el gasto" : `Confirma ${items.length} gastos`}
      </h3>
      <p className="text-[13px] text-muted mt-1.5">Toca para corregir antes de guardar.</p>

      <div className="mt-3 space-y-3">
        {items.map((g, i) => (
          <div key={i} className="border border-line rounded-xl p-3">
            <div className="flex justify-between items-center gap-2">
              <input
                inputMode="numeric"
                value={String(g.monto)}
                onChange={(e) => actualizar(i, { monto: parseInt(e.target.value.replace(/\D/g, ""), 10) || 0 })}
                className="w-full border border-line rounded-lg px-2.5 py-2 text-base num text-ink"
                aria-label="Monto"
              />
              {items.length > 1 && (
                <button onClick={() => quitar(i)} className="text-muted text-lg px-1" aria-label="Quitar este gasto">
                  ×
                </button>
              )}
            </div>
            <input
              value={g.nota}
              onChange={(e) => actualizar(i, { nota: e.target.value })}
              placeholder="Descripción"
              className="w-full border border-line rounded-lg px-2.5 py-2 text-sm text-ink mt-2"
              aria-label="Descripción"
            />
            <div className="flex gap-2 mt-2">
              <select
                value={g.categoria}
                onChange={(e) => actualizar(i, { categoria: e.target.value })}
                className="flex-1 border border-line rounded-lg px-2.5 py-2 text-sm text-ink bg-surface"
                aria-label="Categoría"
              >
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={g.fecha}
                onChange={(e) => actualizar(i, { fecha: e.target.value })}
                className="border border-line rounded-lg px-2.5 py-2 text-sm text-ink"
                aria-label="Fecha"
              />
            </div>
          </div>
        ))}
      </div>

      {items.length > 1 && (
        <p className="text-sm text-muted mt-3 text-right num">Total {pesos(total)}</p>
      )}

      <div className="flex gap-2 mt-4">
        <Button onClick={onCancelar}>Cancelar</Button>
        <Button variant="primary" disabled={items.length === 0} onClick={() => onConfirmar(items)}>
          {items.length === 0 ? "Nada que guardar" : "Guardar"}
        </Button>
      </div>
    </Modal>
  );
}
