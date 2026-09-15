"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { pesos } from "@/lib/money";
import { formatearDecimal, parsearDecimal } from "@/lib/ahorros/formato";
import { etiquetaFecha } from "@/lib/ahorros/etiquetas";
import type { Trm } from "@/lib/types";

export function TrmSheet({
  trmActual,
  actualizando,
  errorActualizar,
  onActualizarAutomatica,
  onGuardarManual,
  onCerrar,
}: {
  trmActual: Trm | null;
  actualizando: boolean;
  errorActualizar: string | null;
  onActualizarAutomatica: () => void;
  onGuardarManual: (valor: number) => void;
  onCerrar: () => void;
}) {
  const [valor, setValor] = useState("");
  const [error, setError] = useState<string | null>(null);

  const guardar = () => {
    const n = parsearDecimal(valor);
    if (n === null || n <= 0) {
      setError("Escribí un valor mayor a 0.");
      return;
    }
    setError(null);
    onGuardarManual(n);
  };

  return (
    <Sheet titulo="Tasa de cambio (TRM)" onClose={onCerrar}>
      <div className="mt-3.5 text-[13px] text-muted">
        {trmActual ? (
          <>
            Actual: <span className="num text-ink">{pesos(trmActual.valor)}</span> · {etiquetaFecha(trmActual.fecha)} ·{" "}
            {trmActual.fuente === "manual" ? "manual" : "automática"}
          </>
        ) : (
          "Sin TRM guardada."
        )}
      </div>

      <Button onClick={onActualizarAutomatica} disabled={actualizando} className="mt-3">
        {actualizando ? "Actualizando…" : "Actualizar de datos.gov.co"}
      </Button>
      {errorActualizar && <div className="text-[12px] text-alerta mt-2">No se pudo actualizar: {errorActualizar}</div>}

      <label htmlFor="trm-manual" className="block text-[11px] tracking-wider uppercase text-muted font-semibold mt-4">
        O fijar una manual (hoy)
      </label>
      <div className="relative mt-1.5">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-[18px] num">$</span>
        <input
          id="trm-manual"
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(formatearDecimal(e.target.value))}
          onKeyDown={(e) => e.key === "Enter" && guardar()}
          className={`w-full border-[1.5px] rounded-lg pl-8 pr-3 py-3 num text-[18px] text-ink ${error ? "border-alerta" : "border-line"}`}
        />
      </div>
      {error && <div className="text-[12px] text-alerta mt-1.5">{error}</div>}

      <div className="mt-4">
        <Button variant="primary" onClick={guardar}>Guardar manual</Button>
      </div>
    </Sheet>
  );
}
