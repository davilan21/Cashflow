"use client";

import { pesos } from "@/lib/money";
import { etiquetaMes } from "@/lib/plan/etiquetas";
import { textoEstadoPago } from "@/lib/pagos/etiquetas";
import type { ItemPago } from "@/lib/pagos/estado";

const COLOR: Record<ItemPago["estado"], string> = {
  vencido: "text-alerta",
  vence_pronto: "text-[#9A6A12]",
  pendiente: "text-muted",
  sin_dia: "text-muted",
  pagado: "text-ok",
};

export function FilaPago({
  item,
  hoy,
  mostrarMes,
  onCheck,
  onAbrir,
}: {
  item: ItemPago;
  hoy: string;
  mostrarMes: boolean;
  onCheck: () => void;
  onAbrir: () => void;
}) {
  const pagado = item.estado === "pagado";
  return (
    <div className="flex items-center gap-2 bg-surface border border-line rounded-xl pl-3 pr-1.5 mb-1.5 min-h-[56px]">
      <button type="button" onClick={onAbrir} className="flex-1 min-w-0 text-left py-2 cursor-pointer">
        <span className={`block text-sm ${pagado ? "text-muted line-through" : "text-ink"}`}>
          {item.nombre}
          {mostrarMes && <span className="ml-1.5 text-[11px] text-muted no-underline">{etiquetaMes(item.mes).toLowerCase()}</span>}
        </span>
        <span className={`block text-[11px] mt-0.5 ${COLOR[item.estado]}`}>{textoEstadoPago(item, hoy)}</span>
      </button>
      <span className="num text-[14px] text-ink">{pesos(item.pago?.monto ?? item.montoSugerido)}</span>
      <button
        type="button"
        onClick={onCheck}
        aria-label={pagado ? `Desmarcar ${item.nombre}` : `Marcar ${item.nombre} como pagado`}
        aria-pressed={pagado}
        className={`w-11 h-11 shrink-0 rounded-full border-2 flex items-center justify-center cursor-pointer transition-colors duration-150 ${
          pagado ? "bg-ok border-ok text-white" : "border-line text-transparent hover:border-ink"
        }`}
        style={{ touchAction: "manipulation" }}
      >
        ✓
      </button>
    </div>
  );
}
