"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { pesos } from "@/lib/money";
import { hoyISO } from "@/lib/ciclo";
import { MEDIOS_PAGO, TIPOS_DEUDA } from "@/lib/flujo/etiquetas";
import { validarDeuda } from "@/lib/flujo/validacion";
import { cuotaFrancesa, tablaAmortizacion } from "@/lib/flujo/deuda";
import type { Instrumento, NuevaDeuda } from "@/lib/flujo/queries";
import type { Deuda, MedioPago } from "@/lib/flujo/tipos";

const campo = "w-full min-h-[44px] px-3 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm";
const etiqueta = "block text-[11px] tracking-wider uppercase text-muted font-semibold mb-1.5";

/** La tasa se captura como porcentaje (1,75) y se guarda como decimal (0,0175). */
function aDecimal(porcentaje: string): number {
  const n = Number(porcentaje.replace(",", "."));
  return Number.isFinite(n) ? n / 100 : NaN;
}

function aPorcentaje(decimal: number): string {
  return String(Math.round(decimal * 1_000_000) / 10_000);
}

export function DeudaModal({
  deuda,
  instrumentos,
  guardando,
  onGuardar,
  onCerrar,
}: {
  deuda: Deuda | null;
  instrumentos: Instrumento[];
  guardando: boolean;
  onGuardar: (d: NuevaDeuda) => void;
  onCerrar: () => void;
}) {
  const [nombre, setNombre] = useState(deuda?.nombre ?? "");
  const [tipo, setTipo] = useState<Deuda["tipo"]>(deuda?.tipo ?? "credito");
  const [saldo, setSaldo] = useState(deuda ? String(deuda.saldo_actual) : "");
  const [saldoAFecha, setSaldoAFecha] = useState(deuda?.saldo_a_fecha ?? hoyISO());
  const [tasa, setTasa] = useState(deuda ? aPorcentaje(deuda.tasa_mensual) : "");
  const [cuotaFija, setCuotaFija] = useState(deuda?.cuota ? String(deuda.cuota) : "");
  const [nCuotas, setNCuotas] = useState(String(deuda?.n_cuotas ?? 12));
  const [pagadas, setPagadas] = useState(String(deuda?.cuotas_pagadas ?? 0));
  const [diaPago, setDiaPago] = useState(String(deuda?.dia_pago ?? 5));
  const [medioPago, setMedioPago] = useState<MedioPago>(deuda?.medio_pago ?? "debito");
  const [instrumentoId, setInstrumentoId] = useState(deuda?.instrumento_id ?? "");
  const [error, setError] = useState("");

  const num = (v: string) => Math.round(Number(v.replace(/[^\d]/g, "")));
  const armar = (): NuevaDeuda => ({
    nombre: nombre.trim(),
    tipo,
    saldo_actual: num(saldo),
    saldo_a_fecha: saldoAFecha,
    tasa_mensual: tasa.trim() ? aDecimal(tasa) : 0,
    cuota: cuotaFija.trim() ? num(cuotaFija) : null,
    n_cuotas: Number(nCuotas),
    cuotas_pagadas: Number(pagadas),
    dia_pago: Number(diaPago),
    medio_pago: medioPago,
    instrumento_id: instrumentoId || null,
    activa: deuda?.activa ?? true,
  });

  // Vista previa en vivo: ver la cuota y la fecha de fin antes de guardar es
  // lo que permite darse cuenta de que la tasa o el plazo quedaron mal.
  const borrador = armar();
  const previaValida = validarDeuda(borrador) === null && borrador.saldo_actual > 0;
  const tabla = previaValida ? tablaAmortizacion({ ...borrador, id: "previa" }) : [];
  const cuotaEstimada =
    previaValida && !borrador.cuota
      ? cuotaFrancesa(borrador.saldo_actual, borrador.tasa_mensual, borrador.n_cuotas - borrador.cuotas_pagadas)
      : borrador.cuota ?? 0;
  const totalAPagar = tabla.reduce((s, c) => s + c.cuota, 0);
  const totalIntereses = tabla.reduce((s, c) => s + c.interes, 0);

  const enviar = () => {
    const nueva = armar();
    const problema = validarDeuda(nueva);
    if (problema) {
      setError(problema);
      return;
    }
    setError("");
    onGuardar(nueva);
  };

  return (
    <Modal onClose={onCerrar}>
      <h2 className="font-display text-lg mb-4">{deuda ? "Editar deuda" : "Nueva deuda"}</h2>

      <div className="flex flex-col gap-3.5">
        <label>
          <span className={etiqueta}>Nombre</span>
          <input
            className={campo}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Crédito de vehículo"
            autoFocus
          />
        </label>

        <label>
          <span className={etiqueta}>Tipo</span>
          <select className={campo} value={tipo} onChange={(e) => setTipo(e.target.value as Deuda["tipo"])}>
            {TIPOS_DEUDA.map((t) => (
              <option key={t.id} value={t.id}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-2.5">
          <label className="flex-1">
            <span className={etiqueta}>Saldo actual</span>
            <input
              className={`${campo} num`}
              value={saldo}
              onChange={(e) => setSaldo(e.target.value)}
              inputMode="numeric"
              placeholder="12000000"
            />
          </label>
          <label className="flex-1">
            <span className={etiqueta}>A la fecha</span>
            <input type="date" className={campo} value={saldoAFecha} onChange={(e) => setSaldoAFecha(e.target.value)} />
          </label>
        </div>
        {num(saldo) > 0 && <span className="block text-xs text-muted -mt-2 num">{pesos(num(saldo))}</span>}

        <label>
          <span className={etiqueta}>Tasa mensual (%)</span>
          <input
            className={`${campo} num`}
            value={tasa}
            onChange={(e) => setTasa(e.target.value)}
            inputMode="decimal"
            placeholder="1.75"
          />
          <span className="block text-[11px] text-muted mt-1">
            La efectiva mensual, no la anual. Déjala vacía si el crédito no cobra intereses.
          </span>
        </label>

        <div className="flex gap-2.5">
          <label className="flex-1">
            <span className={etiqueta}>Cuotas</span>
            <input
              className={`${campo} num`}
              value={nCuotas}
              onChange={(e) => setNCuotas(e.target.value)}
              inputMode="numeric"
            />
          </label>
          <label className="flex-1">
            <span className={etiqueta}>Ya pagadas</span>
            <input
              className={`${campo} num`}
              value={pagadas}
              onChange={(e) => setPagadas(e.target.value)}
              inputMode="numeric"
            />
          </label>
          <label className="flex-1">
            <span className={etiqueta}>Día</span>
            <input
              className={`${campo} num`}
              value={diaPago}
              onChange={(e) => setDiaPago(e.target.value)}
              inputMode="numeric"
            />
          </label>
        </div>

        <label>
          <span className={etiqueta}>Cuota fija</span>
          <input
            className={`${campo} num`}
            value={cuotaFija}
            onChange={(e) => setCuotaFija(e.target.value)}
            inputMode="numeric"
            placeholder="Se calcula sola"
          />
          <span className="block text-[11px] text-muted mt-1">
            Si tu extracto trae una cuota que no calza con la fórmula, ponla acá y se usa esa.
          </span>
        </label>

        <div>
          <span className={etiqueta}>Sale de</span>
          <div className="flex gap-1.5">
            {MEDIOS_PAGO.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMedioPago(m.id)}
                className={`flex-1 px-2 py-2 rounded-lg border text-xs ${
                  medioPago === m.id ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted"
                }`}
              >
                {m.etiqueta}
              </button>
            ))}
          </div>
        </div>

        {instrumentos.length > 0 && (
          <label>
            <span className={etiqueta}>Cuenta</span>
            <select className={campo} value={instrumentoId} onChange={(e) => setInstrumentoId(e.target.value)}>
              <option value="">Sin especificar</option>
              {instrumentos.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nombre}
                </option>
              ))}
            </select>
          </label>
        )}

        {tabla.length > 0 && (
          <div className="bg-[#F6F4FA] border border-line rounded-xl px-3 py-2.5 text-[13px]">
            <div className="flex justify-between">
              <span className="text-muted">Cuota</span>
              <span className="num font-medium">{pesos(cuotaEstimada)}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-muted">Termina</span>
              <span className="num">{tabla[tabla.length - 1].fecha}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-muted">Intereses que faltan</span>
              <span className="num">{pesos(totalIntereses)}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-muted">Total por pagar</span>
              <span className="num">{pesos(totalAPagar)}</span>
            </div>
          </div>
        )}

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
