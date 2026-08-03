"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

export function TopesModal({
  topeCiclo,
  topeQuincena,
  onGuardar,
  onCerrar,
}: {
  topeCiclo: number;
  topeQuincena: number;
  onGuardar: (topeCiclo: number, topeQuincena: number) => void;
  onCerrar: () => void;
}) {
  const [ciclo, setCiclo] = useState(String(topeCiclo));
  const [quincena, setQuincena] = useState(String(topeQuincena));

  const guardar = () => {
    const c = parseInt(ciclo.replace(/\D/g, ""), 10);
    const q = parseInt(quincena.replace(/\D/g, ""), 10);
    onGuardar(c > 0 ? c : topeCiclo, q > 0 ? q : topeQuincena);
  };

  return (
    <Modal onClose={onCerrar}>
      <h3 className="text-[17px] font-semibold text-ink">Topes</h3>
      <p className="text-[13px] text-muted mt-1.5">Te aviso al llegar al 80% y cuando los pases.</p>

      <label className="block text-[11px] tracking-wider uppercase text-muted font-semibold mt-3.5" htmlFor="tope-ciclo">
        Por ciclo (lo que se paga)
      </label>
      <input
        id="tope-ciclo"
        autoFocus
        inputMode="numeric"
        value={ciclo}
        onChange={(e) => setCiclo(e.target.value.replace(/\D/g, ""))}
        onKeyDown={(e) => e.key === "Enter" && guardar()}
        className="w-full border-[1.5px] border-line rounded-lg px-3 py-3 num text-[17px] text-ink mt-1.5"
      />

      <label className="block text-[11px] tracking-wider uppercase text-muted font-semibold mt-3.5" htmlFor="tope-q">
        Por quincena
      </label>
      <input
        id="tope-q"
        inputMode="numeric"
        value={quincena}
        onChange={(e) => setQuincena(e.target.value.replace(/\D/g, ""))}
        onKeyDown={(e) => e.key === "Enter" && guardar()}
        className="w-full border-[1.5px] border-line rounded-lg px-3 py-3 num text-[17px] text-ink mt-1.5"
      />

      <div className="flex gap-2 mt-4.5">
        <Button onClick={onCerrar}>Cancelar</Button>
        <Button variant="primary" onClick={guardar}>
          Guardar topes
        </Button>
      </div>
    </Modal>
  );
}
