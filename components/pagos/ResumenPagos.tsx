import { pesos } from "@/lib/money";
import { etiquetaMes } from "@/lib/plan/etiquetas";

export function ResumenPagos({ mes, pagado, total, faltan }: { mes: string; pagado: number; total: number; faltan: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((pagado / total) * 100)) : 0;
  return (
    <div className="bg-surface border border-line rounded-2xl p-4 mb-3.5">
      <div className="text-[11px] tracking-wider uppercase text-muted font-semibold mb-1">{etiquetaMes(mes)}</div>
      <div className="text-[15px] text-ink">
        pagado <span className="num font-semibold">{pesos(pagado)}</span> de <span className="num">{pesos(total)}</span>
      </div>
      <div className="h-2 bg-bg rounded-full mt-2.5 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-ok rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-muted mt-1.5">{faltan === 0 ? "todo pagado" : faltan === 1 ? "falta 1" : `faltan ${faltan}`}</div>
    </div>
  );
}
