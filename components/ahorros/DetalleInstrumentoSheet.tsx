"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { pesos } from "@/lib/money";
import { dolares } from "@/lib/ahorros/formato";
import { etiquetaFecha, etiquetaTipo, nombreTitular } from "@/lib/ahorros/etiquetas";
import type { ResumenInstrumento } from "@/lib/ahorros/calculo";
import type { AhorroMovimiento, AhorroValoracion, Miembro } from "@/lib/types";
import { IconoLapiz, IconoPapelera } from "@/components/ui/Iconos";

function FilaConBorrar({ texto, monto, onBorrar }: { texto: string; monto: string; onBorrar: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  return (
    <div className="flex items-center gap-2 min-h-[40px] text-[13px]">
      <span className="flex-1 text-muted">{texto}</span>
      <span className="num text-ink">{monto}</span>
      {confirmando ? (
        <button type="button" onClick={onBorrar} className="text-alerta text-[12px] font-medium cursor-pointer min-h-[36px] px-1">
          Confirmar
        </button>
      ) : (
        <button
          type="button"
          aria-label="Eliminar"
          onClick={() => setConfirmando(true)}
          className="text-muted cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
        >
          <IconoPapelera className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export function DetalleInstrumentoSheet({
  resumen,
  movimientos,
  valoraciones,
  miembros,
  onCerrar,
  onAportar,
  onRetirar,
  onActualizarValor,
  onEditar,
  onEliminarMovimiento,
  onEliminarValoracion,
  onEliminarInstrumento,
}: {
  resumen: ResumenInstrumento;
  movimientos: AhorroMovimiento[];
  valoraciones: AhorroValoracion[];
  miembros: Miembro[];
  onCerrar: () => void;
  onAportar: () => void;
  onRetirar: () => void;
  onActualizarValor: () => void;
  onEditar: () => void;
  onEliminarMovimiento: (id: string) => void;
  onEliminarValoracion: (id: string) => void;
  onEliminarInstrumento: () => void;
}) {
  const { instrumento: i } = resumen;
  const fmt = i.moneda === "USD" ? dolares : pesos;
  const [confirmandoBorrarInst, setConfirmandoBorrarInst] = useState(false);

  return (
    <Sheet titulo={i.nombre} onClose={onCerrar}>
      <div className="text-[12px] text-muted mt-1">
        {etiquetaTipo(i.tipo)}
        {i.entidad ? ` · ${i.entidad}` : ""}
        {miembros.length > 1 ? ` · ${nombreTitular(i.titular, miembros)}` : ""}
      </div>
      <div className="text-[26px] font-semibold num text-ink mt-2">{fmt(resumen.valor)}</div>
      <div className="text-[13px] text-muted num">aportado {fmt(resumen.aportado)}</div>

      <div className="flex gap-2 mt-4">
        <Button onClick={onAportar}>Aportar</Button>
        <Button onClick={onRetirar}>Retirar</Button>
        <Button onClick={onActualizarValor}>Valorar</Button>
      </div>

      <div className="mt-4">
        <div className="text-[11px] tracking-wider uppercase text-muted font-semibold mb-1">Movimientos</div>
        {movimientos.length === 0 && <div className="text-[13px] text-muted py-2">Sin movimientos.</div>}
        {movimientos.map((m) => (
          <FilaConBorrar
            key={m.id}
            texto={`${etiquetaFecha(m.fecha)} · ${m.tipo === "aporte" ? "Aporte" : "Retiro"}`}
            monto={`${m.tipo === "retiro" ? "−" : "+"}${fmt(m.monto)}`}
            onBorrar={() => onEliminarMovimiento(m.id)}
          />
        ))}
      </div>

      <div className="mt-4">
        <div className="text-[11px] tracking-wider uppercase text-muted font-semibold mb-1">Valoraciones</div>
        {valoraciones.length === 0 && <div className="text-[13px] text-muted py-2">Sin valoraciones.</div>}
        {valoraciones.map((v) => (
          <FilaConBorrar key={v.id} texto={etiquetaFecha(v.fecha)} monto={fmt(v.valor)} onBorrar={() => onEliminarValoracion(v.id)} />
        ))}
      </div>

      <div className="flex flex-col gap-2 mt-5 pt-4 border-t border-line">
        <Button onClick={onEditar}>
          <span className="inline-flex items-center gap-1.5 justify-center">
            <IconoLapiz className="w-4 h-4" /> Editar
          </span>
        </Button>
        {!confirmandoBorrarInst ? (
          <Button onClick={() => setConfirmandoBorrarInst(true)}>Eliminar</Button>
        ) : (
          <Button onClick={onEliminarInstrumento} className="border-alerta text-alerta">
            {movimientos.length + valoraciones.length > 0
              ? `Sí, eliminar (se pierden ${movimientos.length} movimientos y ${valoraciones.length} valoraciones)`
              : "Sí, eliminar"}
          </Button>
        )}
      </div>
    </Sheet>
  );
}
