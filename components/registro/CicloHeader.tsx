import { etiquetaCiclo, etiquetaPago } from "@/lib/labels";

export function CicloHeader({
  ciclo,
  haySiguiente,
  onAnterior,
  onSiguiente,
}: {
  ciclo: string;
  haySiguiente: boolean;
  onAnterior: () => void;
  onSiguiente: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div>
        <div className="text-[11px] tracking-wider uppercase text-muted font-semibold">Ciclo de la tarjeta</div>
        <h1 className="text-2xl font-extrabold text-ink">{etiquetaCiclo(ciclo)}</h1>
        <div className="text-xs text-muted mt-0.5">Se paga el {etiquetaPago(ciclo)}</div>
      </div>
      <div className="flex gap-1 shrink-0">
        <button
          onClick={onAnterior}
          aria-label="Ciclo anterior"
          className="w-8 h-8 rounded-lg border border-line bg-surface text-ink text-base leading-none"
        >
          ←
        </button>
        <button
          onClick={onSiguiente}
          disabled={!haySiguiente}
          aria-label="Ciclo siguiente"
          className="w-8 h-8 rounded-lg border border-line bg-surface text-ink text-base leading-none disabled:opacity-35"
        >
          →
        </button>
      </div>
    </div>
  );
}
