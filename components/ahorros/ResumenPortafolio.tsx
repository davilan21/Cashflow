import { pesos } from "@/lib/money";
import { dolares } from "@/lib/ahorros/formato";
import { etiquetaFecha } from "@/lib/ahorros/etiquetas";
import type { ResumenPortafolio as Resumen } from "@/lib/ahorros/calculo";
import { IconoLapiz } from "@/components/ui/Iconos";

function textoRendimiento(v: number, pct: number | null): string {
  const signo = v < 0 ? "−" : "+";
  const base = `${signo}${pesos(Math.abs(v))}`;
  return pct === null ? base : `${base} (${signo}${Math.abs(pct).toFixed(1)}%)`;
}

export function ResumenPortafolio({ resumen, onEditarTrm }: { resumen: Resumen; onEditarTrm: () => void }) {
  const color = resumen.rendimientoCOP < 0 ? "text-alerta" : "text-ok";
  return (
    <div className="bg-surface border border-line rounded-2xl p-4 mb-3.5">
      <div className="text-[11px] tracking-wider uppercase text-muted font-semibold mb-1">Ahorrado</div>
      <div className="text-[32px] font-semibold leading-none num text-ink">{pesos(resumen.totalValorCOP)}</div>

      <div className={`text-[13px] mt-1.5 num ${color}`}>
        aportado {pesos(resumen.totalAportadoCOP)} · rendimiento {textoRendimiento(resumen.rendimientoCOP, resumen.rendimientoPct)}
      </div>

      {resumen.usdSinConvertir > 0 && (
        <div className="text-[13px] text-aviso mt-1">
          de los cuales {dolares(resumen.usdSinConvertir)} sin convertir — sin TRM
        </div>
      )}

      <button
        type="button"
        onClick={onEditarTrm}
        className="mt-3 flex items-center gap-1.5 min-h-[36px] text-[12px] text-muted cursor-pointer"
      >
        {resumen.trm ? (
          <>
            TRM {pesos(resumen.trm.valor)} · {etiquetaFecha(resumen.trm.fecha)} ·{" "}
            {resumen.trm.fuente === "manual" ? "manual" : "automática"}
          </>
        ) : (
          "Cargar TRM"
        )}
        <IconoLapiz className="w-4 h-4" />
      </button>
    </div>
  );
}
