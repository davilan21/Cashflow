"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { Category, Expense } from "@/lib/types";

export function EditarGastoModal({
  gasto,
  categorias,
  onGuardar,
  onEliminar,
  onCerrar,
}: {
  gasto: Expense;
  categorias: Category[];
  onGuardar: (cambios: { monto: number; categoria: string; nota: string; fecha: string }) => void;
  onEliminar: () => void;
  onCerrar: () => void;
}) {
  const [monto, setMonto] = useState(String(gasto.monto));
  const [categoria, setCategoria] = useState(gasto.categoria);
  const [nota, setNota] = useState(gasto.nota ?? "");
  const [fecha, setFecha] = useState(gasto.fecha);

  const guardar = () => {
    const m = parseInt(monto.replace(/\D/g, ""), 10);
    if (!(m > 0)) return;
    onGuardar({ monto: m, categoria, nota: nota.trim(), fecha });
  };

  return (
    <Modal onClose={onCerrar}>
      <h3 className="text-[17px] font-semibold text-ink">Editar consumo</h3>

      <label className="block text-[11px] tracking-wider uppercase text-muted font-semibold mt-3.5" htmlFor="ed-monto">
        Monto
      </label>
      <input
        id="ed-monto"
        autoFocus
        inputMode="numeric"
        value={monto}
        onChange={(e) => setMonto(e.target.value.replace(/\D/g, ""))}
        onKeyDown={(e) => e.key === "Enter" && guardar()}
        className="w-full border-[1.5px] border-line rounded-lg px-3 py-3 num text-[17px] text-ink mt-1.5 focus:outline-2 focus:outline-[#6B4E9E] focus:border-ink"
      />

      <label className="block text-[11px] tracking-wider uppercase text-muted font-semibold mt-3.5" htmlFor="ed-nota">
        Descripción
      </label>
      <input
        id="ed-nota"
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && guardar()}
        className="w-full border-[1.5px] border-line rounded-lg px-3 py-3 text-[15px] text-ink mt-1.5 focus:outline-2 focus:outline-[#6B4E9E] focus:border-ink"
      />

      <label className="block text-[11px] tracking-wider uppercase text-muted font-semibold mt-3.5" htmlFor="ed-cat">
        Categoría
      </label>
      <select
        id="ed-cat"
        value={categoria}
        onChange={(e) => setCategoria(e.target.value)}
        className="w-full border border-line rounded-lg px-3 py-3 text-[15px] text-ink mt-1.5 bg-surface"
      >
        {categorias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>

      <label className="block text-[11px] tracking-wider uppercase text-muted font-semibold mt-3.5" htmlFor="ed-fecha">
        Fecha
      </label>
      <input
        id="ed-fecha"
        type="date"
        value={fecha}
        onChange={(e) => setFecha(e.target.value)}
        className="w-full border border-line rounded-lg px-3 py-2.5 text-[15px] text-ink mt-1.5"
      />

      <div className="flex gap-2 mt-4.5">
        <Button onClick={onCerrar}>Cancelar</Button>
        <Button variant="primary" onClick={guardar}>
          Guardar cambios
        </Button>
      </div>
      <button onClick={onEliminar} className="w-full mt-2.5 border-none bg-none text-alerta text-[13px] cursor-pointer py-2">
        Eliminar este consumo
      </button>
    </Modal>
  );
}
