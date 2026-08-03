import { pesos, pesosCorto } from "@/lib/money";
import { BarraTope } from "@/components/ui/BarraTope";

export function TopeCard({
  total,
  tope,
  topeQuincena,
  onEditarTopes,
  esCicloActual,
  restantes,
  proyeccion,
}: {
  total: number;
  tope: number;
  topeQuincena: number;
  onEditarTopes: () => void;
  esCicloActual: boolean;
  restantes: number;
  proyeccion: number;
}) {
  const pct = Math.min(100, (total / tope) * 100);
  const excedido = proyeccion > tope;

  return (
    <div className="bg-surface border border-line rounded-2xl p-4 mb-3.5">
      <div className="flex justify-between items-end gap-2.5 mb-3">
        <div>
          <div className="text-[11px] tracking-wider uppercase text-muted font-semibold mb-1">Va del ciclo</div>
          <div className="text-[32px] font-semibold leading-none num">{pesos(total)}</div>
        </div>
        <button onClick={onEditarTopes} className="text-right text-muted text-xs bg-transparent border-none cursor-pointer">
          topes{" "}
          <u className="decoration-dotted underline-offset-[3px]">
            {pesosCorto(tope)} · {pesosCorto(topeQuincena)}
          </u>
        </button>
      </div>

      <BarraTope pct={pct} />

      <div className="flex justify-between mt-2.5 text-xs text-muted">
        <span>{Math.round(pct)}% del tope</span>
        <span className="num">{total <= tope ? `quedan ${pesos(tope - total)}` : `excedido ${pesos(total - tope)}`}</span>
      </div>

      {esCicloActual && total > 0 && (
        <div
          className="mt-2.5 px-2.5 py-2 rounded-lg text-[13px] leading-relaxed"
          style={{ background: excedido ? "#FBEEED" : "#EEF4EF", color: excedido ? "#8E3733" : "#3A6644" }}
        >
          {excedido
            ? `A este ritmo el corte cierra en ${pesos(proyeccion)} — ${pesos(proyeccion - tope)} por encima. Faltan ${restantes} días y quedan ${pesos(Math.max(0, tope - total))}.`
            : `A este ritmo el corte cierra en ${pesos(proyeccion)}. Faltan ${restantes} días: puedes gastar ${pesos((tope - total) / Math.max(1, restantes))} por día.`}
        </div>
      )}
    </div>
  );
}
