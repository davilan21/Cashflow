import { pesos } from "@/lib/money";
import { etiquetaMes, etiquetaOrigenTC } from "@/lib/plan/etiquetas";
import type { MesPlan } from "@/lib/plan/calculo";

export function textoAhorro(ahorro: number | null): string {
  if (ahorro === null) return "—";
  return `${ahorro < 0 ? "−" : "+"}${pesos(Math.abs(ahorro))}`;
}

export function colorAhorro(ahorro: number | null): string {
  if (ahorro === null) return "text-muted";
  return ahorro < 0 ? "text-alerta" : "text-ok";
}

export function ResumenMes({ mes, ultimo }: { mes: MesPlan; ultimo: MesPlan }) {
  const gastos = mes.totalFijos + mes.tc.monto;
  return (
    <div className="bg-surface border border-line rounded-2xl p-4 mb-3.5">
      <div className="text-[11px] tracking-wider uppercase text-muted font-semibold mb-1">{etiquetaMes(mes.mes)}</div>
      <div className={`text-[32px] font-semibold leading-none num ${colorAhorro(mes.ahorro)}`}>{textoAhorro(mes.ahorro)}</div>
      <div className="text-xs text-muted mt-1">ahorro del mes</div>

      <div className="grid grid-cols-2 gap-3 mt-4 text-[13px]">
        <div>
          <div className="text-muted">Ingresos</div>
          <div className="num text-ink font-medium">{pesos(mes.totalIngresos)}</div>
        </div>
        <div>
          <div className="text-muted">
            Gastos <span className="text-[11px]">· TC {etiquetaOrigenTC(mes.tc.origen)}</span>
          </div>
          <div className="num text-ink font-medium">{pesos(gastos)}</div>
        </div>
      </div>

      {ultimo.acumulado !== null && (
        <div className="mt-3.5 px-2.5 py-2 rounded-lg text-[13px] leading-relaxed bg-[#EEF4EF] text-[#3A6644]">
          A este ritmo, en {etiquetaMes(ultimo.mes).toLowerCase()} acumulás {textoAhorro(ultimo.acumulado)}.
        </div>
      )}
    </div>
  );
}
