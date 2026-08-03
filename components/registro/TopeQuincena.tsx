import { pesos, pesosCorto } from "@/lib/money";
import { BarraDelgada } from "@/components/ui/BarraTope";

export function TopeQuincena({ totalVisible, topeQuincena }: { totalVisible: number; topeQuincena: number }) {
  const pct = topeQuincena > 0 ? (totalVisible / topeQuincena) * 100 : 0;

  return (
    <div className="mb-1">
      <div className="flex justify-between items-baseline gap-2.5 text-xs text-muted mb-1.5">
        <span>Tope de la quincena · {pesosCorto(topeQuincena)}</span>
        <span className="num">
          {totalVisible <= topeQuincena
            ? `quedan ${pesos(topeQuincena - totalVisible)}`
            : `excedido ${pesos(totalVisible - topeQuincena)}`}
        </span>
      </div>
      <BarraDelgada pct={pct} />
    </div>
  );
}
