"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { etiquetaTipo, nombreTitular } from "@/lib/ahorros/etiquetas";
import type { AhorroInstrumento, Miembro, Moneda, NuevoInstrumento, TipoInstrumento } from "@/lib/types";

const TIPOS: TipoInstrumento[] = ["cdt", "acciones", "fondo", "cuenta", "otro"];
const campo = "w-full border-[1.5px] border-line rounded-lg px-3 py-3 text-[15px] text-ink mt-1.5 bg-surface";
const etiqueta = "block text-[11px] tracking-wider uppercase text-muted font-semibold mt-3.5";

export function InstrumentoSheet({
  inicial,
  miembros,
  onGuardar,
  onCerrar,
}: {
  inicial: AhorroInstrumento | null;
  miembros: Miembro[];
  onGuardar: (datos: NuevoInstrumento) => void;
  onCerrar: () => void;
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [tipo, setTipo] = useState<TipoInstrumento>(inicial?.tipo ?? "cdt");
  const [moneda, setMoneda] = useState<Moneda>(inicial?.moneda ?? "COP");
  const [titular, setTitular] = useState<string | null>(inicial?.titular ?? null);
  const [entidad, setEntidad] = useState(inicial?.entidad ?? "");
  const [tasaEa, setTasaEa] = useState(inicial?.tasa_ea != null ? String(inicial.tasa_ea) : "");
  const [vencimiento, setVencimiento] = useState(inicial?.vencimiento ?? "");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const validar = (): NuevoInstrumento | null => {
    if (!nombre.trim()) {
      setError("Ponele un nombre.");
      return null;
    }
    if (tipo === "cdt" && !vencimiento) {
      setError("Un CDT necesita fecha de vencimiento.");
      return null;
    }
    const tasa = tasaEa.trim() ? Number(tasaEa.replace(",", ".")) : null;
    if (tasa !== null && (Number.isNaN(tasa) || tasa < 0)) {
      setError("La tasa tiene que ser un número ≥ 0.");
      return null;
    }
    setError(null);
    return {
      nombre: nombre.trim(),
      tipo,
      moneda,
      titular,
      entidad: entidad.trim() || null,
      tasa_ea: tipo === "cdt" ? tasa : null,
      vencimiento: tipo === "cdt" ? vencimiento : null,
    };
  };

  const guardar = () => {
    const datos = validar();
    if (!datos) return;
    setEnviando(true);
    onGuardar(datos);
  };

  return (
    <Sheet titulo={inicial ? "Editar ahorro" : "Nuevo ahorro"} onClose={onCerrar}>
      <label htmlFor="ah-nombre" className={etiqueta}>Nombre</label>
      <input id="ah-nombre" autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="CDT Bancolombia" className={campo} />

      <label className={etiqueta}>Tipo</label>
      <div role="radiogroup" className="flex flex-wrap gap-1.5 mt-1.5">
        {TIPOS.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={tipo === t}
            onClick={() => setTipo(t)}
            className={`min-h-[44px] px-3 rounded-xl border text-[13px] cursor-pointer transition-colors duration-200 ${
              tipo === t ? "border-ink bg-ink text-white font-medium" : "border-line bg-surface text-muted"
            }`}
          >
            {etiquetaTipo(t)}
          </button>
        ))}
      </div>

      <label className={etiqueta}>Moneda</label>
      <div role="radiogroup" className="flex gap-1.5 mt-1.5">
        {(["COP", "USD"] as Moneda[]).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={moneda === m}
            onClick={() => setMoneda(m)}
            className={`flex-1 min-h-[44px] rounded-xl border text-[13px] cursor-pointer transition-colors duration-200 ${
              moneda === m ? "border-ink bg-ink text-white font-medium" : "border-line bg-surface text-muted"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {miembros.length > 1 && (
        <>
          <label className={etiqueta}>Titular</label>
          <div role="radiogroup" className="flex flex-wrap gap-1.5 mt-1.5">
            {[{ id: null, etiqueta: "Hogar" }, ...miembros.map((m) => ({ id: m.user_id, etiqueta: nombreTitular(m.user_id, miembros) }))].map((o) => (
              <button
                key={String(o.id)}
                type="button"
                role="radio"
                aria-checked={titular === o.id}
                onClick={() => setTitular(o.id)}
                className={`min-h-[44px] px-3 rounded-xl border text-[13px] cursor-pointer transition-colors duration-200 ${
                  titular === o.id ? "border-ink bg-ink text-white font-medium" : "border-line bg-surface text-muted"
                }`}
              >
                {o.etiqueta}
              </button>
            ))}
          </div>
        </>
      )}

      <label htmlFor="ah-entidad" className={etiqueta}>Entidad (opcional)</label>
      <input id="ah-entidad" value={entidad} onChange={(e) => setEntidad(e.target.value)} placeholder="Bancolombia, Trii…" className={campo} />

      {tipo === "cdt" && (
        <>
          <label htmlFor="ah-tasa" className={etiqueta}>Tasa efectiva anual % (opcional)</label>
          <input id="ah-tasa" inputMode="decimal" value={tasaEa} onChange={(e) => setTasaEa(e.target.value)} className={`${campo} num`} />

          <label htmlFor="ah-vence" className={etiqueta}>Vencimiento</label>
          <input id="ah-vence" type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} className={campo} />
        </>
      )}

      {error && <div className="text-[12px] text-alerta mt-2">{error}</div>}

      <div className="mt-5">
        <Button variant="primary" onClick={guardar} disabled={enviando}>
          {enviando ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </Sheet>
  );
}
