"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { pesos } from "@/lib/money";
import { hoyISO } from "@/lib/ciclo";
import { MESES } from "@/lib/labels";
import { FRECUENCIAS, MEDIOS_PAGO, TIPOS_REGLA } from "@/lib/flujo/etiquetas";
import { validarRegla } from "@/lib/flujo/validacion";
import type { Instrumento, NuevaRegla } from "@/lib/flujo/queries";
import type { Category } from "@/lib/types";
import type { Frecuencia, MedioPago, Regla, TipoRegla } from "@/lib/flujo/tipos";

const campo = "w-full min-h-[44px] px-3 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm";
const etiqueta = "block text-[11px] tracking-wider uppercase text-muted font-semibold mb-1.5";

export function ReglaModal({
  regla,
  instrumentos,
  categorias,
  guardando,
  onGuardar,
  onCerrar,
}: {
  regla: Regla | null;
  instrumentos: Instrumento[];
  categorias: Category[];
  guardando: boolean;
  onGuardar: (r: NuevaRegla) => void;
  onCerrar: () => void;
}) {
  const [tipo, setTipo] = useState<TipoRegla>(regla?.tipo ?? "gasto_fijo");
  const [nombre, setNombre] = useState(regla?.nombre ?? "");
  const [monto, setMonto] = useState(regla ? String(regla.monto) : "");
  const [estimado, setEstimado] = useState(regla?.monto_tipo === "estimado");
  const [frecuencia, setFrecuencia] = useState<Frecuencia>(regla?.frecuencia ?? "mensual");
  const [dia1, setDia1] = useState(String(regla?.dia_1 ?? 1));
  const [dia2, setDia2] = useState(regla?.dia_2 ? String(regla.dia_2) : "30");
  const [mes, setMes] = useState(String(regla?.mes ?? 6));
  const [medioPago, setMedioPago] = useState<MedioPago>(regla?.medio_pago ?? "debito");
  const [instrumentoId, setInstrumentoId] = useState(regla?.instrumento_id ?? "");
  const [categoria, setCategoria] = useState(regla?.categoria ?? "");
  const [desde, setDesde] = useState(regla?.desde ?? hoyISO());
  const [hasta, setHasta] = useState(regla?.hasta ?? "");
  const [error, setError] = useState("");

  const montoNum = Math.round(Number(monto.replace(/[^\d]/g, "")));
  const esGasto = tipo === "gasto_fijo";

  const enviar = () => {
    const nueva: NuevaRegla = {
      tipo,
      nombre: nombre.trim(),
      monto: montoNum,
      monto_tipo: estimado ? "estimado" : "fijo",
      frecuencia,
      dia_1: Number(dia1),
      dia_2: frecuencia === "quincenal" ? Number(dia2) : null,
      mes: frecuencia === "anual" ? Number(mes) : null,
      medio_pago: esGasto ? medioPago : null,
      instrumento_id: instrumentoId || null,
      categoria: esGasto ? categoria || null : null,
      desde,
      hasta: hasta || null,
      activa: regla?.activa ?? true,
    };
    const problema = validarRegla(nueva);
    if (problema) {
      setError(problema);
      return;
    }
    setError("");
    onGuardar(nueva);
  };

  return (
    <Modal onClose={onCerrar}>
      <h2 className="font-display text-lg mb-4">{regla ? "Editar compromiso" : "Nuevo compromiso"}</h2>

      <div className="flex flex-col gap-3.5">
        <div>
          <span className={etiqueta}>Tipo</span>
          <div className="flex gap-1.5">
            {TIPOS_REGLA.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTipo(t.id)}
                className={`flex-1 px-2 py-2 rounded-lg border text-xs ${
                  tipo === t.id ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted"
                }`}
              >
                {t.etiqueta}
              </button>
            ))}
          </div>
        </div>

        <label>
          <span className={etiqueta}>Nombre</span>
          <input
            className={campo}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder={esGasto ? "Arriendo" : "Nómina"}
            autoFocus
          />
        </label>

        <label>
          <span className={etiqueta}>Monto</span>
          <input
            className={`${campo} num`}
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            inputMode="numeric"
            placeholder="2000000"
          />
          {montoNum > 0 && <span className="block text-xs text-muted mt-1 num">{pesos(montoNum)}</span>}
        </label>

        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={estimado}
            onChange={(e) => setEstimado(e.target.checked)}
          />
          <span>
            Es un estimado
            <span className="block text-[11px] text-muted">
              Se dibuja punteado en la curva, y el valor real lo reemplaza
            </span>
          </span>
        </label>

        <label>
          <span className={etiqueta}>Frecuencia</span>
          <select className={campo} value={frecuencia} onChange={(e) => setFrecuencia(e.target.value as Frecuencia)}>
            {FRECUENCIAS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.etiqueta}
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-2.5">
          <label className="flex-1">
            <span className={etiqueta}>{frecuencia === "quincenal" ? "Primer día" : "Día"}</span>
            <input
              className={`${campo} num`}
              value={dia1}
              onChange={(e) => setDia1(e.target.value)}
              inputMode="numeric"
            />
          </label>
          {frecuencia === "quincenal" && (
            <label className="flex-1">
              <span className={etiqueta}>Segundo día</span>
              <input
                className={`${campo} num`}
                value={dia2}
                onChange={(e) => setDia2(e.target.value)}
                inputMode="numeric"
              />
            </label>
          )}
          {frecuencia === "anual" && (
            <label className="flex-1">
              <span className={etiqueta}>Mes</span>
              <select className={campo} value={mes} onChange={(e) => setMes(e.target.value)}>
                {MESES.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <p className="text-[11px] text-muted -mt-2">
          Si el mes no tiene ese día se cobra el último: el 31 cae el 28 en febrero.
        </p>

        {esGasto && (
          <div>
            <span className={etiqueta}>Medio de pago</span>
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
            {medioPago === "tc" && (
              <p className="text-[11px] text-muted mt-1.5">
                No sale de la caja el día del cobro: suma al ciclo y sale el día que pagas la tarjeta.
              </p>
            )}
          </div>
        )}

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

        {esGasto && (
          <label>
            <span className={etiqueta}>Categoría</span>
            <select className={campo} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Sin categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex gap-2.5">
          <label className="flex-1">
            <span className={etiqueta}>Desde</span>
            <input type="date" className={campo} value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label className="flex-1">
            <span className={etiqueta}>Hasta</span>
            <input type="date" className={campo} value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
        </div>

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
