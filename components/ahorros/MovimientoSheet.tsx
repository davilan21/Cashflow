"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { formatearMiles, parsearMonto } from "@/lib/plan/formato";
import { formatearDecimal, parsearDecimal } from "@/lib/ahorros/formato";
import { hoyISO } from "@/lib/ciclo";
import type { AhorroInstrumento, NuevoMovimiento, TipoMovimiento } from "@/lib/types";

export function MovimientoSheet({
  instrumento,
  tipo,
  onGuardar,
  onCerrar,
}: {
  instrumento: AhorroInstrumento;
  tipo: TipoMovimiento;
  onGuardar: (datos: NuevoMovimiento) => void;
  onCerrar: () => void;
}) {
  const esUSD = instrumento.moneda === "USD";
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const validar = (): NuevoMovimiento | null => {
    const n = esUSD ? parsearDecimal(monto) : parsearMonto(monto);
    if (n === null || n <= 0) {
      setError("Escribí un monto mayor a 0.");
      return null;
    }
    setError(null);
    return { instrumento_id: instrumento.id, fecha, tipo, monto: n, nota: nota.trim() || null };
  };

  const guardar = () => {
    const datos = validar();
    if (!datos) return;
    setEnviando(true);
    onGuardar(datos);
  };

  return (
    <Sheet titulo={`${tipo === "aporte" ? "Aportar a" : "Retirar de"} ${instrumento.nombre}`} onClose={onCerrar}>
      <label htmlFor="mov-monto" className="block text-[11px] tracking-wider uppercase text-muted font-semibold mt-3.5">
        Monto ({instrumento.moneda})
      </label>
      <div className="relative mt-1.5">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-[20px] num">{esUSD ? "US$" : "$"}</span>
        <input
          id="mov-monto"
          autoFocus
          inputMode={esUSD ? "decimal" : "numeric"}
          value={monto}
          onChange={(e) => setMonto(esUSD ? formatearDecimal(e.target.value) : formatearMiles(e.target.value))}
          onKeyDown={(e) => e.key === "Enter" && guardar()}
          className={`w-full border-[1.5px] rounded-lg pl-10 pr-3 py-3 num text-[24px] text-ink ${error ? "border-alerta" : "border-line"}`}
        />
      </div>
      {error && <div className="text-[12px] text-alerta mt-1.5">{error}</div>}

      <label htmlFor="mov-fecha" className="block text-[11px] tracking-wider uppercase text-muted font-semibold mt-3.5">
        Fecha
      </label>
      <input id="mov-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full border-[1.5px] border-line rounded-lg px-3 py-3 text-[15px] text-ink mt-1.5" />

      <label htmlFor="mov-nota" className="block text-[11px] tracking-wider uppercase text-muted font-semibold mt-3.5">
        Nota (opcional)
      </label>
      <input id="mov-nota" value={nota} onChange={(e) => setNota(e.target.value)} className="w-full border-[1.5px] border-line rounded-lg px-3 py-3 text-[15px] text-ink mt-1.5" />

      <div className="mt-5">
        <Button variant="primary" onClick={guardar} disabled={enviando}>
          {enviando ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </Sheet>
  );
}
