"use client";

import { useCallback, useEffect, useState } from "react";

export interface AccionToast {
  etiqueta: string;
  onClick: () => void;
}

export function useToast() {
  const [mensaje, setMensaje] = useState("");
  const [accion, setAccion] = useState<AccionToast | null>(null);

  useEffect(() => {
    if (!mensaje) return;
    // Con acción dura más: tiene que dar tiempo a tocar "Deshacer".
    const t = setTimeout(() => {
      setMensaje("");
      setAccion(null);
    }, accion ? 5000 : 2200);
    return () => clearTimeout(t);
  }, [mensaje, accion]);

  const mostrar = useCallback((texto: string, nuevaAccion?: AccionToast) => {
    setMensaje(texto);
    setAccion(nuevaAccion ?? null);
  }, []);

  return { mensaje, accion, mostrar };
}
