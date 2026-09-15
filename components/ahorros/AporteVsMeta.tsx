import Link from "next/link";
import { pesos } from "@/lib/money";
import { dolares } from "@/lib/ahorros/formato";
import { etiquetaMes } from "@/lib/plan/etiquetas";
import { BarraTope } from "@/components/ui/BarraTope";
import type { AporteVsMeta as Datos } from "@/lib/ahorros/calculo";

export function AporteVsMeta({ datos }: { datos: Datos }) {
  if (datos.meta === null) {
    return (
      <div className="bg-surface border border-line rounded-2xl p-4 mb-3.5 text-[13px] text-muted">
        Definí ingresos en{" "}
        <Link href="/plan" className="text-ink underline underline-offset-2">
          Plan
        </Link>{" "}
        para tener una meta de ahorro.
      </div>
    );
  }
  const pct = datos.pct ?? 0;
  // Invertido respecto al tope de la tarjeta: acá llegar a 100% es bueno (verde), no malo.
  const color = pct >= 100 ? "#4E8C5A" : pct >= 50 ? "#C08A2E" : "#C4544F";
  return (
    <div className="bg-surface border border-line rounded-2xl p-4 mb-3.5">
      <div className="flex justify-between items-baseline text-[13px] mb-2">
        <span className="text-muted">{etiquetaMes(datos.mes)}</span>
        <span className="num text-ink">
          aportaste {pesos(datos.aportadoCOP)} de {pesos(datos.meta)}
        </span>
      </div>
      <BarraTope
        pct={pct}
        alto="h-[18px]"
        color={color}
        etiqueta={`${Math.round(pct)} por ciento del ahorro del mes`}
      />
      {datos.usdSinConvertir > 0 && (
        <div className="text-[12px] text-aviso mt-1.5">
          + {dolares(datos.usdSinConvertir)} sin convertir — sin TRM
        </div>
      )}
      {datos.faltante !== null && datos.faltante > 0 && (
        <div className="text-[12px] text-muted mt-1.5 num">faltan {pesos(datos.faltante)}</div>
      )}
    </div>
  );
}
