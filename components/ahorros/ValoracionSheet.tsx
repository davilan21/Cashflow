"use client";

import { useMemo, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { formatearMiles, parsearMonto } from "@/lib/plan/formato";
import { formatearDecimal, parsearDecimal } from "@/lib/ahorros/formato";
import { hoyISO } from "@/lib/ciclo";
import { pesos } from "@/lib/money";
import { dolares } from "@/lib/ahorros/formato";
import { aportadoHasta } from "@/lib/ahorros/calculo";
import type { AhorroInstrumento, AhorroMovimiento } from "@/lib/types";

export function ValoracionSheet({
  instrumento,
  movimientos,
  onGuardar,
  onCerrar,
}: {
  instrumento: AhorroInstrumento;
  movimientos: AhorroMovimiento[];
  onGuardar: (valor: number, fecha: string) => void;
  onCerrar: () => void;
}) {
  const esUSD = instrumento.moneda === "USD";
  const fmt = esUSD ? dolares : pesos;
  const [valor, setValor] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Recalcula con la fecha elegida, no con hoy, para que coincida con lo que se está valorando.
  const aportado = useMemo(
    () => aportadoHasta(movimientos, instrumento.id, fecha),
    [movimientos, instrumento.id, fecha]
  );

  const guardar = () => {
    const n = esUSD ? parsearDecimal(valor) : parsearMonto(valor);
    if (n === null || n < 0) {
      setError("Escribí un valor (puede ser 0).");
      return;
    }
    setError(null);
    setEnviando(true);
    onGuardar(n, fecha);
  };

  return (
    <Sheet titulo={`Actualizar valor · ${instrumento.nombre}`} onClose={onCerrar}>
      <label htmlFor="val-valor" className="block text-[11px] tracking-wider uppercase text-muted font-semibold mt-3.5">
        Valor actual ({instrumento.moneda})
      </label>
      <div className="relative mt-1.5">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-[20px] num">{esUSD ? "US$" : "$"}</span>
        <input
          id="val-valor"
          autoFocus
          inputMode={esUSD ? "decimal" : "numeric"}
          value={valor}
          onChange={(e) => setValor(esUSD ? formatearDecimal(e.target.value) : formatearMiles(e.target.value))}
          onKeyDown={(e) => e.key === "Enter" && guardar()}
          className={`w-full border-[1.5px] rounded-lg pl-10 pr-3 py-3 num text-[24px] text-ink ${error ? "border-alerta" : "border-line"}`}
        />
      </div>
      {error && <div className="text-[12px] text-alerta mt-1.5">{error}</div>}
      <div className="text-[13px] text-muted mt-2">Aportado a la fecha: <span className="num">{fmt(aportado)}</span></div>

      <label htmlFor="val-fecha" className="block text-[11px] tracking-wider uppercase text-muted font-semibold mt-3.5">
        Fecha
      </label>
      <input id="val-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full border-[1.5px] border-line rounded-lg px-3 py-3 text-[15px] text-ink mt-1.5" />
      <div className="text-[12px] text-muted mt-1.5">Anotar el mismo día dos veces corrige el valor de ese día.</div>

      <div className="mt-5">
        <Button variant="primary" onClick={guardar} disabled={enviando}>
          {enviando ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </Sheet>
  );
}
