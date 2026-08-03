export function RangoSelector({ rango, onCambiar }: { rango: number; onCambiar: (r: number) => void }) {
  return (
    <div className="flex gap-1.5 shrink-0">
      {[3, 6, 12].map((r) => (
        <button
          key={r}
          onClick={() => onCambiar(r)}
          className={`border rounded-lg px-2.5 py-1.5 text-xs ${
            rango === r ? "bg-ink border-ink text-white" : "border-line bg-surface text-muted"
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
