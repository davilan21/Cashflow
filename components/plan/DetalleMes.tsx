"use client";

import { pesos } from "@/lib/money";
import { etiquetaOrigenTC } from "@/lib/plan/etiquetas";
import type { LineaPlan, MesPlan } from "@/lib/plan/calculo";
import { IconoLapiz } from "@/components/ui/Iconos";
import { textoAhorro, colorAhorro } from "./ResumenMes";

function Linea({
  nombre,
  monto,
  ajustado,
  detalle,
  onClick,
}: {
  nombre: string;
  monto: number;
  ajustado: boolean;
  detalle?: string;
  onClick?: () => void;
}) {
  const contenido = (
    <>
      <span className="flex-1 text-left text-ink">
        {nombre}
        {detalle && <span className="ml-1.5 text-[11px] text-muted">{detalle}</span>}
      </span>
      <span className={`num text-ink ${ajustado ? "underline decoration-dotted underline-offset-[3px]" : ""}`}>{pesos(monto)}</span>
      {onClick && <IconoLapiz className="w-5 h-5 text-muted shrink-0" />}
    </>
  );
  if (!onClick) return <div className="flex items-center gap-2 min-h-[44px] text-[13px]">{contenido}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 min-h-[44px] text-[13px] rounded-lg px-1 -mx-1 cursor-pointer hover:bg-bg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
      style={{ touchAction: "manipulation" }}
    >
      {contenido}
    </button>
  );
}

function Bloque({ titulo, lineas, total, onEditar }: { titulo: string; lineas: LineaPlan[]; total: number; onEditar: (rubroId: string) => void }) {
  return (
    <div className="mt-3">
      <div className="flex justify-between text-[11px] tracking-wider uppercase text-muted font-semibold">
        <span>{titulo}</span>
        <span className="num">{pesos(total)}</span>
      </div>
      {lineas.length === 0 && <div className="text-[13px] text-muted py-2.5">Sin {titulo.toLowerCase()} este mes.</div>}
      {lineas.map((l) => (
        <Linea key={l.rubroId} nombre={l.nombre} monto={l.monto} ajustado={l.ajustado} onClick={() => onEditar(l.rubroId)} />
      ))}
    </div>
  );
}

export function DetalleMes({ mes, onEditar }: { mes: MesPlan; onEditar: (rubroId: string | null) => void }) {
  return (
    <div className="px-4 pb-4">
      <Bloque titulo="Ingresos" lineas={mes.ingresos} total={mes.totalIngresos} onEditar={onEditar} />
      <Bloque titulo="Fijos" lineas={mes.fijos} total={mes.totalFijos} onEditar={onEditar} />

      <div className="mt-3">
        <div className="text-[11px] tracking-wider uppercase text-muted font-semibold">Tarjeta</div>
        <Linea
          nombre="Factura del ciclo"
          detalle={etiquetaOrigenTC(mes.tc.origen)}
          monto={mes.tc.monto}
          ajustado={mes.tc.origen === "manual"}
          onClick={mes.tc.editable ? () => onEditar(null) : undefined}
        />
        {mes.tc.origen === "sin_datos" && <div className="text-[12px] text-muted">Sin ciclos cerrados con gasto: ajustá el estimado a mano.</div>}
      </div>

      <div className="mt-3 pt-3 border-t border-line flex justify-between text-[13px]">
        <span className="text-muted">Ahorro del mes</span>
        <span className={`num font-semibold ${colorAhorro(mes.ahorro)}`}>{textoAhorro(mes.ahorro)}</span>
      </div>
      {mes.acumulado !== null && (
        <div className="flex justify-between text-[13px] mt-1">
          <span className="text-muted">Acumulado</span>
          <span className={`num ${colorAhorro(mes.acumulado)}`}>{textoAhorro(mes.acumulado)}</span>
        </div>
      )}
    </div>
  );
}
