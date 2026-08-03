"use client";

import { useCallback, useEffect, useState } from "react";

export function useToast() {
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(() => setMensaje(""), 2200);
    return () => clearTimeout(t);
  }, [mensaje]);

  const mostrar = useCallback((texto: string) => setMensaje(texto), []);

  return { mensaje, mostrar };
}
