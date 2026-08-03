"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cola de mutaciones pendientes por falta de red. Es un caché opcional:
 * si Supabase confirma la operación, sale de la cola; si el usuario
 * recarga la página estando offline, la cola sobrevive en localStorage
 * para no perder el gasto, pero el estado real siempre viene de Supabase.
 */
export function useOfflineQueue<T>(opts: {
  storageKey: string;
  ejecutar: (op: T) => Promise<boolean>; // true = confirmado, se saca de la cola
  igual: (a: T, b: T) => boolean;
}) {
  const { storageKey, ejecutar, igual } = opts;
  const [pendientes, setPendientes] = useState<T[]>([]);
  const [online, setOnline] = useState(true);
  const drenando = useRef(false);

  useEffect(() => {
    try {
      const guardado = window.localStorage.getItem(storageKey);
      if (guardado) setPendientes(JSON.parse(guardado));
    } catch {
      // caché corrupto: se ignora, no es la fuente de verdad
    }
    setOnline(navigator.onLine);

    const marcarOnline = () => setOnline(true);
    const marcarOffline = () => setOnline(false);
    window.addEventListener("online", marcarOnline);
    window.addEventListener("offline", marcarOffline);
    return () => {
      window.removeEventListener("online", marcarOnline);
      window.removeEventListener("offline", marcarOffline);
    };
  }, [storageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(pendientes));
    } catch {
      // localStorage lleno o no disponible: la cola sigue viva en memoria
    }
  }, [storageKey, pendientes]);

  const encolar = useCallback((op: T) => {
    setPendientes((prev) => [...prev, op]);
  }, []);

  const quitar = useCallback(
    (op: T) => {
      setPendientes((prev) => prev.filter((p) => !igual(p, op)));
    },
    [igual]
  );

  const actualizar = useCallback((predicate: (op: T) => boolean, actualizar: (op: T) => T) => {
    setPendientes((prev) => prev.map((p) => (predicate(p) ? actualizar(p) : p)));
  }, []);

  const drenar = useCallback(async () => {
    if (drenando.current) return;
    drenando.current = true;
    try {
      // Copia estable: procesa en orden y se detiene en el primer fallo
      // real para no perder el orden de los movimientos.
      let cola = pendientes;
      for (const op of cola) {
        const ok = await ejecutar(op);
        if (!ok) break;
        cola = cola.filter((p) => !igual(p, op));
        setPendientes(cola);
      }
    } finally {
      drenando.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ejecutar, igual]);

  useEffect(() => {
    if (online && pendientes.length > 0) drenar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  return { pendientes, online, encolar, quitar, actualizar, drenar };
}
