"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { armarJSON, armarCSV } from "@/lib/export";
import type { Category, Expense, Settings } from "@/lib/types";

export function ExportarPanel({
  gastos,
  settings,
  catById,
  onCopiado,
}: {
  gastos: Expense[];
  settings: Settings;
  catById: (id: string) => Category;
  onCopiado: (mensaje: string) => void;
}) {
  const [manual, setManual] = useState<{ tipo: string; contenido: string } | null>(null);

  const exportar = async (tipo: "json" | "csv") => {
    const contenido = tipo === "csv" ? armarCSV(gastos, (id) => catById(id).nombre) : armarJSON(gastos, settings);
    try {
      await navigator.clipboard.writeText(contenido);
      onCopiado(tipo === "csv" ? "CSV copiado" : "JSON copiado");
    } catch {
      setManual({ tipo, contenido });
    }
  };

  return (
    <>
      <div className="flex gap-2 mt-2.5">
        <Button onClick={() => exportar("json")}>Copiar JSON</Button>
      </div>
      <div className="flex gap-2 mt-2.5">
        <Button onClick={() => exportar("csv")}>Copiar CSV para Excel</Button>
      </div>

      {manual && (
        <Modal onClose={() => setManual(null)}>
          <h3 className="text-[17px] font-semibold text-ink">Tu registro en {manual.tipo.toUpperCase()}</h3>
          <p className="text-[13px] text-muted mt-1.5">Selecciona el texto y cópialo a mano.</p>
          <textarea
            readOnly
            value={manual.contenido}
            onFocus={(e) => e.target.select()}
            className="w-full h-[150px] border border-line rounded-lg p-2.5 font-mono text-[11px] mt-3 text-ink resize-none"
          />
          <div className="flex gap-2 mt-4">
            <Button variant="primary" onClick={() => setManual(null)}>
              Cerrar
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
