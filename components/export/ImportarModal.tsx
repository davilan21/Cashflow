"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { parsearImportacion, type ImportacionParseada } from "@/lib/import";
import { pesos } from "@/lib/money";

export function ImportarModal({
  categoriasValidas,
  onImportar,
  onCerrar,
}: {
  categoriasValidas: Set<string>;
  onImportar: (datos: ImportacionParseada, modo: "combinar" | "reemplazar") => void;
  onCerrar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [datos, setDatos] = useState<ImportacionParseada | null>(null);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const analizar = (t: string) => {
    setTexto(t);
    if (!t.trim()) {
      setDatos(null);
      setError("");
      return;
    }
    const r = parsearImportacion(t, categoriasValidas);
    if (!r) {
      setDatos(null);
      setError("Ese texto no tiene un registro válido. Pega el JSON completo.");
    } else {
      setDatos(r);
      setError("");
    }
  };

  const confirmar = async (modo: "combinar" | "reemplazar") => {
    if (!datos || enviando) return;
    setEnviando(true);
    await onImportar(datos, modo);
  };

  return (
    <Modal onClose={onCerrar}>
      <h3 className="text-[17px] font-semibold text-ink">Importar registro</h3>
      <p className="text-[13px] text-muted mt-1.5">Pega el JSON que copiaste de otro dispositivo o del prototipo anterior.</p>

      <textarea
        autoFocus
        value={texto}
        onChange={(e) => analizar(e.target.value)}
        placeholder='{"tope": 4000000, "gastos": [...]}'
        className="w-full h-[150px] border border-line rounded-lg p-2.5 font-mono text-[11px] mt-3 text-ink resize-none"
      />

      {error && <p className="text-alerta text-[13px] mt-1">{error}</p>}
      {datos && (
        <p className="text-[13px] mt-1.5" style={{ color: "#3A6644" }}>
          Encontré {datos.gastos.length} {datos.gastos.length === 1 ? "consumo" : "consumos"} por{" "}
          {pesos(datos.gastos.reduce((s, g) => s + g.monto, 0))}.
        </p>
      )}

      <div className="flex gap-2 mt-4">
        <Button onClick={onCerrar} disabled={enviando}>
          Cancelar
        </Button>
        <Button disabled={!datos || enviando} onClick={() => confirmar("combinar")}>
          Combinar
        </Button>
        <Button variant="primary" disabled={!datos || enviando} onClick={() => confirmar("reemplazar")}>
          Reemplazar
        </Button>
      </div>
    </Modal>
  );
}
