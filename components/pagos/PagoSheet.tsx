"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { pesos } from "@/lib/money";
import { formatearMiles, parsearMonto } from "@/lib/plan/formato";
import type { ItemPago } from "@/lib/pagos/estado";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

export function PagoSheet({
  item,
  hoy,
  onGuardar,
  onDesmarcar,
  onCerrar,
}: {
  item: ItemPago;
  hoy: string;
  onGuardar: (monto: number, pagadoEl: string) => void;
  onDesmarcar: () => void;
  onCerrar: () => void;
}) {
  const [texto, setTexto] = useState(formatearMiles(String(item.pago?.monto ?? item.montoSugerido)));
  const [fecha, setFecha] = useState(item.pago?.pagadoEl ?? hoy);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const guardar = () => {
    const n = parsearMonto(texto);
    if (n === null) return setError("Escribí un monto (puede ser 0).");
    if (!FECHA_RE.test(fecha)) return setError("Elegí la fecha del pago.");
    if (fecha > hoy) return setError("La fecha del pago no puede ser futura.");
    setError(null);
    setEnviando(true);
    onGuardar(n, fecha);
  };

  return (
    <Sheet titulo={item.nombre} onClose={onCerrar}>
      <label htmlFor="pago-monto" className="block text-[11px] tracking-wider uppercase text-muted font-semibold mt-3.5">Monto pagado</label>
      <div className="relative mt-1.5">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-[20px] num">$</span>
        <input
          id="pago-monto"
          autoFocus
          inputMode="numeric"
          value={texto}
          onChange={(e) => setTexto(formatearMiles(e.target.value))}
          onKeyDown={(e) => e.key === "Enter" && guardar()}
          aria-invalid={Boolean(error)}
          className={`w-full border-[1.5px] rounded-lg pl-8 pr-3 py-3 num text-[24px] text-ink ${error ? "border-alerta" : "border-line"}`}
        />
      </div>
      <div className="text-[13px] text-muted mt-2">
        Estimado: <span className="num">{pesos(item.montoSugerido)}</span>
      </div>

      <label htmlFor="pago-fecha" className="block text-[11px] tracking-wider uppercase text-muted font-semibold mt-3.5">Fecha del pago</label>
      <input id="pago-fecha" type="date" max={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full border-[1.5px] border-line rounded-lg px-3 py-3 text-[15px] text-ink mt-1.5 bg-surface" />

      {error && <div className="text-[12px] text-alerta mt-2">{error}</div>}

      <div className="flex flex-col gap-2 mt-5">
        <Button variant="primary" onClick={guardar} disabled={enviando}>
          {enviando ? "Guardando…" : item.pago ? "Guardar" : "Marcar pagado"}
        </Button>
        {item.pago && (
          <Button onClick={onDesmarcar} disabled={enviando}>
            Desmarcar
          </Button>
        )}
      </div>
    </Sheet>
  );
}
