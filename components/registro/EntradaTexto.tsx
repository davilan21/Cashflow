"use client";

export function EntradaTexto({
  texto,
  onChange,
  onEnviar,
  procesando,
  deshabilitado,
  error,
}: {
  texto: string;
  onChange: (v: string) => void;
  onEnviar: () => void;
  procesando: boolean;
  deshabilitado: boolean;
  error: string;
}) {
  return (
    <>
      <div className="relative mb-1.5">
        <textarea
          rows={2}
          value={texto}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onEnviar();
            }
          }}
          placeholder="hoy 200k en almuerzo y 15 en bus"
          aria-label="Escribe tu gasto"
          className="w-full resize-none border-[1.5px] border-ink rounded-2xl bg-surface px-3.5 py-3.5 pr-[52px] text-[15px] text-ink leading-snug min-h-[52px] placeholder:text-[#9A93A8] focus:outline-2 focus:outline-[#6B4E9E] focus:outline-offset-2"
        />
        <button
          onClick={onEnviar}
          disabled={!texto.trim() || procesando || deshabilitado}
          aria-label="Registrar gasto"
          className="absolute right-2 bottom-2 w-9 h-9 rounded-lg border-none bg-ink text-white cursor-pointer text-base leading-none disabled:opacity-40"
        >
          {procesando ? (
            <span className="inline-block w-[13px] h-[13px] border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            "↑"
          )}
        </button>
      </div>
      {error ? (
        <p className="text-alerta text-[13px] my-1.5 ml-0.5">{error}</p>
      ) : (
        <p className="text-xs text-muted mb-1 ml-0.5">
          Solo consumos de la tarjeta. Entiende montos, categoría y si dice &quot;ayer&quot;.
        </p>
      )}
    </>
  );
}
