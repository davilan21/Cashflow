"use client";

import { pesos } from "@/lib/money";
import { dolares } from "@/lib/ahorros/formato";
import { etiquetaOrigenValor, etiquetaTipo, etiquetaVencimiento, nombreTitular } from "@/lib/ahorros/etiquetas";
import type { ResumenInstrumento } from "@/lib/ahorros/calculo";
import type { Miembro } from "@/lib/types";
import { IconoMas } from "@/components/ui/Iconos";

function Fila({ r, miembros, onClick }: { r: ResumenInstrumento; miembros: Miembro[]; onClick: () => void }) {
  const { instrumento: i } = r;
  const enMoneda = i.moneda === "USD" ? dolares(r.valor) : pesos(r.valor);
  const colorRend = r.rendimiento < 0 ? "text-alerta" : r.rendimiento > 0 ? "text-ok" : "text-muted";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 min-h-[64px] px-4 text-left cursor-pointer hover:bg-bg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 ${!i.activo ? "opacity-50" : ""}`}
      style={{ touchAction: "manipulation" }}
    >
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="text-[15px] text-ink truncate">{i.nombre}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#E4DFEC] text-muted shrink-0">{etiquetaTipo(i.tipo)}</span>
        </span>
        <span className="block text-[12px] text-muted truncate">
          {[i.entidad, miembros.length > 1 ? nombreTitular(i.titular, miembros) : null].filter(Boolean).join(" · ")}
        </span>
        {r.cdt && (
          <span className={`block text-[11px] ${r.cdt.estado === "vencido" ? "text-alerta" : r.cdt.estado === "por_vencer" ? "text-aviso" : "text-muted"}`}>
            {etiquetaVencimiento(r.cdt.estado, r.cdt.diasAlVencimiento, i.vencimiento!)}
          </span>
        )}
      </span>
      <span className="text-right shrink-0">
        <span className="block text-[15px] font-medium num text-ink">{enMoneda}</span>
        {i.moneda === "USD" && (
          <span className="block text-[11px] num text-muted">{r.valorCOP === null ? "sin TRM" : pesos(r.valorCOP)}</span>
        )}
        <span className={`block text-[11px] num ${colorRend}`}>
          {r.rendimiento === 0 ? etiquetaOrigenValor(r.origenValor) : `${r.rendimiento < 0 ? "−" : "+"}${(i.moneda === "USD" ? dolares : pesos)(Math.abs(r.rendimiento))}`}
        </span>
      </span>
    </button>
  );
}

export function ListaInstrumentos({
  resumenes,
  miembros,
  onSeleccionar,
  onNuevo,
}: {
  resumenes: ResumenInstrumento[];
  miembros: Miembro[];
  onSeleccionar: (id: string) => void;
  onNuevo: () => void;
}) {
  const activos = resumenes.filter((r) => r.instrumento.activo);
  const inactivos = resumenes.filter((r) => !r.instrumento.activo);
  return (
    <div className="bg-surface border border-line rounded-2xl divide-y divide-line lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
      {activos.map((r) => (
        <Fila key={r.instrumento.id} r={r} miembros={miembros} onClick={() => onSeleccionar(r.instrumento.id)} />
      ))}
      {inactivos.length > 0 && (
        <>
          <div className="px-4 pt-3 pb-1 text-[11px] tracking-wider uppercase text-muted font-semibold">Liquidados</div>
          {inactivos.map((r) => (
            <Fila key={r.instrumento.id} r={r} miembros={miembros} onClick={() => onSeleccionar(r.instrumento.id)} />
          ))}
        </>
      )}
      <button
        type="button"
        onClick={onNuevo}
        className="w-full flex items-center gap-2 min-h-[48px] px-4 text-[13px] text-ink font-medium cursor-pointer hover:bg-bg transition-colors duration-150 rounded-b-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
      >
        <IconoMas className="w-5 h-5" />
        Agregar ahorro
      </button>
    </div>
  );
}
