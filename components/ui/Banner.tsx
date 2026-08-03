export function Banner({
  children,
  accion,
}: {
  children: React.ReactNode;
  accion?: { etiqueta: string; onClick: () => void };
}) {
  return (
    <div className="flex items-center gap-2.5 bg-[#FBEEED] text-[#8E3733] rounded-xl px-3 py-2.5 text-[13px] leading-relaxed mb-3.5">
      <span className="flex-1">{children}</span>
      {accion && (
        <button
          onClick={accion.onClick}
          className="shrink-0 border border-[#E0BDBA] bg-white text-[#8E3733] rounded-lg px-2.5 py-1.5 text-xs"
        >
          {accion.etiqueta}
        </button>
      )}
    </div>
  );
}
