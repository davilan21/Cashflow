const TONOS = {
  alerta: { caja: "bg-[#FBEEED] text-[#8E3733]", boton: "border-[#E0BDBA] text-[#8E3733]" },
  info: { caja: "bg-[#EAF0F7] text-[#2F4A6B]", boton: "border-[#BFD0E4] text-[#2F4A6B]" },
} as const;

export function Banner({
  children,
  accion,
  tono = "alerta",
}: {
  children: React.ReactNode;
  accion?: { etiqueta: string; onClick: () => void };
  tono?: keyof typeof TONOS;
}) {
  const t = TONOS[tono];
  return (
    <div className={`flex items-center gap-2.5 ${t.caja} rounded-xl px-3 py-2.5 text-[13px] leading-relaxed mb-3.5`}>
      <span className="flex-1">{children}</span>
      {accion && (
        <button
          onClick={accion.onClick}
          className={`shrink-0 min-h-[36px] border bg-white ${t.boton} rounded-lg px-2.5 py-1.5 text-xs cursor-pointer`}
        >
          {accion.etiqueta}
        </button>
      )}
    </div>
  );
}
