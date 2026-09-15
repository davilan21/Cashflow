"use client";

export type VistaPlan = "meses" | "rubros";

export function SubTabs({ vista, onCambiar }: { vista: VistaPlan; onCambiar: (v: VistaPlan) => void }) {
  const opciones: { id: VistaPlan; etiqueta: string }[] = [
    { id: "meses", etiqueta: "Meses" },
    { id: "rubros", etiqueta: "Ingresos y fijos" },
  ];
  return (
    <div role="tablist" className="flex gap-1.5 mb-4">
      {opciones.map((o) => {
        const activo = vista === o.id;
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={activo}
            onClick={() => onCambiar(o.id)}
            className={`flex-1 min-h-[44px] px-2 rounded-xl border text-sm cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 ${
              activo ? "border-ink bg-ink text-white font-medium" : "border-line bg-surface text-muted"
            }`}
          >
            {o.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
