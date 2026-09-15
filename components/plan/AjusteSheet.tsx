"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { pesos } from "@/lib/money";
import { formatearMiles, parsearMonto } from "@/lib/plan/formato";

export function AjusteSheet({
  titulo,
  montoActual,
  referencia,
  tieneAjuste,
  onGuardar,
  onQuitar,
  onCerrar,
}: {
  titulo: string;
  montoActual: number;
  referencia: { etiqueta: string; monto: number };
  tieneAjuste: boolean;
  onGuardar: (monto: number) => void;
  onQuitar: () => void;
  onCerrar: () => void;
}) {
  const [texto, setTexto] = useState(formatearMiles(String(montoActual)));
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const validar = (): number | null => {
    const n = parsearMonto(texto);
    if (n === null) {
      setError("Escribí un monto (puede ser 0).");
      return null;
    }
    setError(null);
    return n;
  };

  const guardar = () => {
    const n = validar();
    if (n === null) return;
    setEnviando(true);
    onGuardar(n);
  };

  return (
    <Sheet titulo={titulo} onClose={onCerrar}>
      <label htmlFor="ajuste-monto" className="block text-[11px] tracking-wider uppercase text-muted font-semibold mt-3.5">
        Monto de este mes
      </label>
      <div className="relative mt-1.5">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-[20px] num">$</span>
        <input
          id="ajuste-monto"
          autoFocus
          inputMode="numeric"
          value={texto}
          onChange={(e) => setTexto(formatearMiles(e.target.value))}
          onBlur={validar}
          onKeyDown={(e) => e.key === "Enter" && guardar()}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "ajuste-error" : undefined}
          className={`w-full border-[1.5px] rounded-lg pl-8 pr-3 py-3 num text-[24px] text-ink ${error ? "border-alerta" : "border-line"}`}
        />
      </div>
      {error && (
        <div id="ajuste-error" className="text-[12px] text-alerta mt-1.5">
          {error}
        </div>
      )}
      <div className="text-[13px] text-muted mt-2">
        {referencia.etiqueta}: <span className="num">{pesos(referencia.monto)}</span>
      </div>

      <div className="flex flex-col gap-2 mt-5">
        <Button variant="primary" onClick={guardar} disabled={enviando}>
          {enviando ? "Guardando…" : "Guardar"}
        </Button>
        {tieneAjuste && (
          <Button onClick={onQuitar} disabled={enviando}>
            Volver a {referencia.etiqueta.toLowerCase()}
          </Button>
        )}
      </div>
    </Sheet>
  );
}
