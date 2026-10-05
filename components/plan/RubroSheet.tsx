"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { formatearMiles, parsearMonto } from "@/lib/plan/formato";
import type { NuevoRubro, PlanRubro, TipoRubro } from "@/lib/types";

const campo = "w-full border-[1.5px] border-line rounded-lg px-3 py-3 text-[15px] text-ink mt-1.5 bg-surface";
const etiqueta = "block text-[11px] tracking-wider uppercase text-muted font-semibold mt-3.5";
// Mismo check que la base de datos (0011_plan_mensual.sql): 'YYYY-MM'.
const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function RubroSheet({
  inicial,
  tipoInicial,
  mesActual,
  ajustesDelRubro,
  onGuardar,
  onEliminar,
  onCerrar,
}: {
  inicial: PlanRubro | null;
  tipoInicial: TipoRubro;
  mesActual: string;
  ajustesDelRubro: number;
  onGuardar: (datos: NuevoRubro) => void;
  onEliminar: () => void;
  onCerrar: () => void;
}) {
  const [tipo, setTipo] = useState<TipoRubro>(inicial?.tipo ?? tipoInicial);
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [monto, setMonto] = useState(inicial ? formatearMiles(String(inicial.monto_default)) : "");
  const [desde, setDesde] = useState(inicial?.desde ?? mesActual);
  const [puntual, setPuntual] = useState(Boolean(inicial && inicial.hasta === inicial.desde));
  const [hasta, setHasta] = useState(inicial?.hasta && inicial.hasta !== inicial.desde ? inicial.hasta : "");
  const [error, setError] = useState<string | null>(null);
  const [confirmandoBorrar, setConfirmandoBorrar] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const validar = (): NuevoRubro | null => {
    const n = parsearMonto(monto);
    if (!nombre.trim()) {
      setError("Ponele un nombre.");
      return null;
    }
    if (n === null) {
      setError("Escribí un monto (puede ser 0).");
      return null;
    }
    if (!MES_RE.test(desde)) {
      setError("Elegí el mes desde el que aplica.");
      return null;
    }
    const hastaFinal = puntual ? desde : hasta || null;
    if (hastaFinal !== null && !MES_RE.test(hastaFinal)) {
      setError("Elegí el mes final con el formato AAAA-MM.");
      return null;
    }
    if (hastaFinal !== null && hastaFinal < desde) {
      setError("El mes final no puede ser antes del inicial.");
      return null;
    }
    setError(null);
    return { tipo, nombre: nombre.trim(), monto_default: n, desde, hasta: hastaFinal, dia_pago: inicial?.dia_pago ?? null };
  };

  const guardar = () => {
    const datos = validar();
    if (!datos) return;
    setEnviando(true);
    onGuardar(datos);
  };

  return (
    <Sheet titulo={inicial ? "Editar rubro" : tipoInicial === "ingreso" ? "Nuevo ingreso" : "Nuevo gasto fijo"} onClose={onCerrar}>
      <div role="radiogroup" aria-label="Tipo" className="flex gap-1.5 mt-3.5">
        {(["ingreso", "fijo"] as TipoRubro[]).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={tipo === t}
            onClick={() => setTipo(t)}
            className={`flex-1 min-h-[44px] rounded-xl border text-sm cursor-pointer transition-colors duration-200 ${
              tipo === t ? "border-ink bg-ink text-white font-medium" : "border-line bg-surface text-muted"
            }`}
          >
            {t === "ingreso" ? "Ingreso" : "Gasto fijo"}
          </button>
        ))}
      </div>

      <label htmlFor="rubro-nombre" className={etiqueta}>Nombre</label>
      <input id="rubro-nombre" autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={tipo === "ingreso" ? "Nómina David" : "Arriendo"} className={campo} />

      <label htmlFor="rubro-monto" className={etiqueta}>Monto por mes</label>
      <input id="rubro-monto" inputMode="numeric" value={monto} onChange={(e) => setMonto(formatearMiles(e.target.value))} onKeyDown={(e) => e.key === "Enter" && guardar()} className={`${campo} num text-[20px]`} />

      <label htmlFor="rubro-desde" className={etiqueta}>Desde</label>
      <input id="rubro-desde" type="month" value={desde} onChange={(e) => setDesde(e.target.value)} className={campo} />

      <label className="flex items-center gap-2.5 min-h-[44px] mt-2 text-[13px] text-ink cursor-pointer">
        <input type="checkbox" checked={puntual} onChange={(e) => setPuntual(e.target.checked)} className="w-5 h-5 accent-ink" />
        Puntual (un solo mes)
      </label>

      {!puntual && (
        <>
          <label htmlFor="rubro-hasta" className={etiqueta}>Hasta (opcional)</label>
          <input id="rubro-hasta" type="month" value={hasta} onChange={(e) => setHasta(e.target.value)} className={campo} />
        </>
      )}

      {error && <div className="text-[12px] text-alerta mt-2">{error}</div>}

      <div className="flex flex-col gap-2 mt-5">
        <Button variant="primary" onClick={guardar} disabled={enviando}>
          {enviando ? "Guardando…" : "Guardar"}
        </Button>
        {inicial && !confirmandoBorrar && (
          <Button onClick={() => setConfirmandoBorrar(true)} disabled={enviando}>
            Eliminar
          </Button>
        )}
        {inicial && confirmandoBorrar && (
          <Button onClick={onEliminar} disabled={enviando} className="border-alerta text-alerta">
            {ajustesDelRubro > 0 ? `Sí, eliminar (se pierden ${ajustesDelRubro} ajustes)` : "Sí, eliminar"}
          </Button>
        )}
      </div>
    </Sheet>
  );
}
