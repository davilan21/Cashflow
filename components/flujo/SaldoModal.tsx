"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { pesos } from "@/lib/money";
import { hoyISO } from "@/lib/ciclo";
import type { Ancla } from "@/lib/flujo/tipos";

const campo = "w-full min-h-[44px] px-3 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm";
const etiqueta = "block text-[11px] tracking-wider uppercase text-muted font-semibold mb-1.5";

export function SaldoModal({
  ancla,
  saldoProyectado,
  colchon,
  guardando,
  onGuardar,
  onCerrar,
}: {
  ancla: Ancla | null;
  saldoProyectado: number;
  colchon: number;
  guardando: boolean;
  onGuardar: (fecha: string, monto: number, colchon: number) => void;
  onCerrar: () => void;
}) {
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [colchonInput, setColchonInput] = useState(String(colchon));
  const [error, setError] = useState("");

  const num = (v: string) => Math.round(Number(v.replace(/[^\d]/g, "")));
  const montoNum = num(monto);
  const deriva = monto.trim() ? montoNum - saldoProyectado : null;

  const enviar = () => {
    if (!monto.trim()) {
      setError("Escribe cuánto tienes hoy");
      return;
    }
    if (!Number.isFinite(montoNum)) {
      setError("El saldo tiene que ser un número");
      return;
    }
    setError("");
    onGuardar(fecha, montoNum, num(colchonInput));
  };

  return (
    <Modal onClose={onCerrar}>
      <h2 className="font-display text-lg mb-1">{ancla ? "Actualizar saldo" : "Saldo inicial"}</h2>
      <p className="text-[13px] text-muted mb-4 leading-relaxed">
        {ancla
          ? "Los correos no traen el saldo, solo los movimientos, y no todos. Volver a anclarlo cada tanto es parte del uso normal."
          : "Cuánto tienes hoy en el banco. Es el punto desde el que se proyecta todo — sin esto la curva no significa nada."}
      </p>

      <div className="flex flex-col gap-3.5">
        <label>
          <span className={etiqueta}>Saldo real</span>
          <input
            className={`${campo} num`}
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            inputMode="numeric"
            placeholder="3500000"
            autoFocus
          />
          {montoNum > 0 && <span className="block text-xs text-muted mt-1 num">{pesos(montoNum)}</span>}
        </label>

        <label>
          <span className={etiqueta}>A la fecha</span>
          <input type="date" className={campo} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>

        {ancla && deriva !== null && (
          <div className="bg-[#F6F4FA] border border-line rounded-xl px-3 py-2.5 text-[13px]">
            <div className="flex justify-between">
              <span className="text-muted">Proyectado</span>
              <span className="num">{pesos(saldoProyectado)}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-muted">Diferencia</span>
              <span className={`num font-medium ${deriva < 0 ? "text-alerta" : "text-ok"}`}>
                {deriva > 0 ? "+" : "−"}
                {pesos(Math.abs(deriva))}
              </span>
            </div>
            <p className="text-[11px] text-muted mt-1.5 leading-relaxed">
              Esa diferencia es lo que se movió por fuera de lo que la app ve. Si es grande y siempre en la misma
              dirección, falta un compromiso por registrar.
            </p>
          </div>
        )}

        <label>
          <span className={etiqueta}>Colchón</span>
          <input
            className={`${campo} num`}
            value={colchonInput}
            onChange={(e) => setColchonInput(e.target.value)}
            inputMode="numeric"
            placeholder="2000000"
          />
          <span className="block text-[11px] text-muted mt-1">
            El mínimo que quieres conservar. La curva avisa cuándo lo cruzas.
          </span>
        </label>

        {error && <p className="text-[13px] text-alerta">{error}</p>}

        <div className="flex gap-2.5 mt-1">
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button variant="primary" onClick={enviar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
