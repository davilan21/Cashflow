const colorPor = (pct: number) => (pct >= 100 ? "#C4544F" : pct >= 80 ? "#C08A2E" : "#4E8C5A");

/** Barra de progreso a rayas, en 10 segmentos, usada para los topes de ciclo y quincena. */
export function BarraTope({ pct, alto = "h-[26px]" }: { pct: number; alto?: string }) {
  const color = colorPor(pct);
  return (
    <div
      className={`flex gap-0.5 ${alto} rounded-md overflow-hidden bg-[#E4DFEC]`}
      role="img"
      aria-label={`${Math.round(pct)} por ciento del tope`}
    >
      {Array.from({ length: 10 }).map((_, i) => {
        const llenado = Math.max(0, Math.min(1, (pct - i * 10) / 10));
        return (
          <div key={i} className="flex-1 relative overflow-hidden">
            {llenado > 0 && (
              <div
                className="absolute inset-0"
                style={{
                  right: `${(1 - llenado) * 100}%`,
                  backgroundColor: color,
                  backgroundImage:
                    "repeating-linear-gradient(115deg, rgba(255,255,255,0.22) 0 2px, transparent 2px 6px)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Barra delgada de una sola pieza, usada para el tope de quincena y desglose por categoría. */
export function BarraDelgada({ pct, color }: { pct: number; color?: string }) {
  return (
    <div className="flex-1 h-2 rounded bg-[#E4DFEC] overflow-hidden">
      <div
        className="h-full rounded"
        style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color ?? colorPor(pct) }}
      />
    </div>
  );
}

export { colorPor };
