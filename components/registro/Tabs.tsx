import { pesosCorto } from "@/lib/money";

export type Vista = "m1" | "m2" | "ciclo";

export function Tabs({
  vista,
  onCambiar,
  etiquetaM1,
  etiquetaM2,
  totalM1,
  totalM2,
  total,
}: {
  vista: Vista;
  onCambiar: (v: Vista) => void;
  etiquetaM1: string;
  etiquetaM2: string;
  totalM1: number;
  totalM2: number;
  total: number;
}) {
  const opciones: { id: Vista; etiqueta: string; monto: number }[] = [
    { id: "m1", etiqueta: etiquetaM1, monto: totalM1 },
    { id: "m2", etiqueta: etiquetaM2, monto: totalM2 },
    { id: "ciclo", etiqueta: "Ciclo", monto: total },
  ];

  return (
    <div className="flex gap-1.5 my-4">
      {opciones.map((o) => {
        const activo = vista === o.id;
        return (
          <button
            key={o.id}
            onClick={() => onCambiar(o.id)}
            className={`flex-1 px-1.5 py-2.5 rounded-xl border text-xs ${
              activo ? "border-ink bg-ink text-[#C9C2D6]" : "border-line bg-surface text-muted"
            }`}
          >
            {o.etiqueta}
            <b className={`block text-[15px] font-semibold num mt-0.5 ${activo ? "text-white" : "text-ink"}`}>
              {pesosCorto(o.monto)}
            </b>
          </button>
        );
      })}
    </div>
  );
}
