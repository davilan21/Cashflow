"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { Category, GastoPendiente } from "@/lib/types";

export function TarjetaPendiente({
  pendiente,
  categorias,
  seleccionado,
  onCambiarSeleccion,
  onConfirmar,
  onDescartar,
}: {
  pendiente: GastoPendiente;
  categorias: Category[];
  seleccionado: boolean;
  onCambiarSeleccion: (valor: boolean) => void;
  onConfirmar: (cambios: { monto: number; categoria: string; nota: string; fecha: string }) => void;
  onDescartar: () => void;
}) {
  const [monto, setMonto] = useState(String(pendiente.monto));
  const [categoria, setCategoria] = useState(pendiente.categoria);
  const [nota, setNota] = useState(pendiente.nota);
  const [fecha, setFecha] = useState(pendiente.fecha);

  const confirmar = () => {
    const m = parseInt(monto.replace(/\D/g, ""), 10);
    if (!(m > 0)) return;
    onConfirmar({ monto: m, categoria, nota: nota.trim(), fecha });
  };

  return (
    <div className="bg-surface border border-line rounded-2xl px-4 py-3.5 mb-2.5">
      <div className="flex gap-2 mb-2">
        <input
          type="checkbox"
          checked={seleccionado}
          onChange={(e) => onCambiarSeleccion(e.target.checked)}
          aria-label={`Seleccionar ${nota || "este pendiente"}`}
          className="w-5 h-5 shrink-0 self-center accent-ink"
        />
        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          className="flex-1 min-w-0 border border-line rounded-lg px-2.5 py-2 text-sm text-ink"
        />
        <input
          inputMode="numeric"
          value={monto}
          onChange={(e) => setMonto(e.target.value.replace(/\D/g, ""))}
          className="w-28 border border-line rounded-lg px-2.5 py-2 text-sm num text-ink"
        />
      </div>
      <div className="flex gap-2 mb-2.5">
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className="flex-1 border border-line rounded-lg px-2.5 py-2 text-sm text-ink bg-surface"
        >
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="border border-line rounded-lg px-2.5 py-2 text-sm text-ink"
        />
      </div>
      <div className="flex gap-2">
        <Button onClick={onDescartar}>Descartar</Button>
        <Button variant="primary" onClick={confirmar}>
          Confirmar
        </Button>
      </div>
    </div>
  );
}
