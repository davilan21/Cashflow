"use client";

import { etiquetaMes } from "@/lib/plan/etiquetas";
import type { MesPlan } from "@/lib/plan/calculo";
import { IconoChevron } from "@/components/ui/Iconos";
import { DetalleMes } from "./DetalleMes";
import { textoAhorro, colorAhorro } from "./ResumenMes";

export function ListaMeses({
  plan,
  abierto,
  onAbrir,
  onEditar,
}: {
  plan: MesPlan[];
  abierto: string | null;
  onAbrir: (mes: string | null) => void;
  onEditar: (mes: string, rubroId: string | null) => void;
}) {
  return (
    <div className="bg-surface border border-line rounded-2xl divide-y divide-line">
      {plan.map((m) => {
        const estaAbierto = abierto === m.mes;
        return (
          <div key={m.mes} id={`mes-${m.mes}`} className={m.esActual ? "bg-[#F7F5FA]" : ""}>
            <button
              type="button"
              aria-expanded={estaAbierto}
              aria-controls={`detalle-${m.mes}`}
              onClick={() => onAbrir(estaAbierto ? null : m.mes)}
              className="w-full flex items-center gap-3 min-h-[56px] px-4 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 rounded-2xl"
              style={{ touchAction: "manipulation" }}
            >
              <span className={`flex-1 text-[15px] ${m.esActual ? "font-semibold text-ink" : "text-ink"}`}>
                {etiquetaMes(m.mes)}
                {m.esActual && <span className="ml-2 text-[11px] text-muted font-normal">hoy</span>}
              </span>
              <span className={`num text-[15px] font-medium ${colorAhorro(m.ahorro)}`}>{textoAhorro(m.ahorro)}</span>
              <IconoChevron className={`w-5 h-5 text-muted transition-transform duration-200 ${estaAbierto ? "rotate-180" : ""}`} />
            </button>
            <div
              id={`detalle-${m.mes}`}
              className="grid transition-[grid-template-rows,opacity] duration-200 ease-out"
              style={{ gridTemplateRows: estaAbierto ? "1fr" : "0fr", opacity: estaAbierto ? 1 : 0 }}
            >
              <div className="overflow-hidden">{estaAbierto && <DetalleMes mes={m} onEditar={(rubroId) => onEditar(m.mes, rubroId)} />}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
