"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { BANCOS, TIPOS_INSTRUMENTO } from "@/lib/flujo/etiquetas";
import { validarInstrumento } from "@/lib/flujo/validacion";
import type { Instrumento, NuevoInstrumento } from "@/lib/flujo/queries";

const campo = "w-full min-h-[44px] px-3 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm";
const etiqueta = "block text-[11px] tracking-wider uppercase text-muted font-semibold mb-1.5";

export function InstrumentoModal({
  instrumento,
  guardando,
  onGuardar,
  onCerrar,
}: {
  instrumento: Instrumento | null;
  guardando: boolean;
  onGuardar: (i: NuevoInstrumento) => void;
  onCerrar: () => void;
}) {
  const [nombre, setNombre] = useState(instrumento?.nombre ?? "");
  const [banco, setBanco] = useState<Instrumento["banco"]>(instrumento?.banco ?? "davibank");
  const [tipo, setTipo] = useState<Instrumento["tipo"]>(instrumento?.tipo ?? "ahorros");
  const [ultimos4, setUltimos4] = useState(instrumento?.ultimos4 ?? "");
  const [alias, setAlias] = useState((instrumento?.alias_pago ?? []).join(", "));
  const [activo, setActivo] = useState(instrumento?.activo ?? true);
  const [error, setError] = useState("");

  const enviar = () => {
    const nuevo: NuevoInstrumento = {
      nombre: nombre.trim(),
      banco,
      tipo,
      ultimos4: ultimos4.trim() || null,
      alias_pago: alias.trim()
        ? alias
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean)
        : null,
      // `principal` no se toca acá: se cambia desde la lista, que sabe
      // desmarcar el anterior. Hay un índice único que solo admite uno.
      principal: instrumento?.principal ?? false,
      titular: instrumento?.titular ?? null,
      activo,
    };
    const problema = validarInstrumento(nuevo);
    if (problema) {
      setError(problema);
      return;
    }
    setError("");
    onGuardar(nuevo);
  };

  return (
    <Modal onClose={onCerrar}>
      <h2 className="font-display text-lg mb-4">{instrumento ? "Editar cuenta" : "Nueva cuenta"}</h2>

      <div className="flex flex-col gap-3.5">
        <label>
          <span className={etiqueta}>Nombre</span>
          <input
            className={campo}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ahorros Davibank"
            autoFocus
          />
        </label>

        <label>
          <span className={etiqueta}>Banco</span>
          <select className={campo} value={banco} onChange={(e) => setBanco(e.target.value as Instrumento["banco"])}>
            {BANCOS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.etiqueta}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className={etiqueta}>Tipo</span>
          <select className={campo} value={tipo} onChange={(e) => setTipo(e.target.value as Instrumento["tipo"])}>
            {TIPOS_INSTRUMENTO.map((t) => (
              <option key={t.id} value={t.id}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className={etiqueta}>Últimos 4 dígitos</span>
          <input
            className={`${campo} num`}
            value={ultimos4}
            onChange={(e) => setUltimos4(e.target.value)}
            inputMode="numeric"
            maxLength={4}
            placeholder="1234"
          />
          <span className="block text-[11px] text-muted mt-1">
            Es como los correos identifican de dónde salió la plata. Un mismo número en dos bancos son cuentas
            distintas.
          </span>
        </label>

        {tipo === "tc" && (
          <label>
            <span className={etiqueta}>Cómo aparece al pagarla</span>
            <input
              className={campo}
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="Bancolombia Tarjeta de Crédito, PSE Bancolombia"
            />
            <span className="block text-[11px] text-muted mt-1">
              El nombre del beneficiario en el comprobante de PSE, separado por comas. Es lo que permite reconocer el
              pago de la tarjeta y no contarlo como un gasto más.
            </span>
          </label>
        )}

        <label className="flex items-center gap-2.5 text-sm">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          <span>Activa</span>
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
