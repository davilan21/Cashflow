"use client";

import { useCallback, useRef } from "react";

/**
 * Dos mutaciones seguidas sobre la misma fila pueden resolver desordenadas y
 * pisar el estado nuevo con el viejo. `encolar` serializa por clave (la
 * siguiente corre aunque la anterior falle) y `nuevaGeneracion` marca cuál
 * escritura es la más nueva: solo esa decide el estado final de la fila.
 */
export function useColaPorClave() {
  const cola = useRef(new Map<string, Promise<void>>());
  const generacion = useRef(new Map<string, number>());

  const encolar = useCallback((clave: string, tarea: () => Promise<void>): Promise<void> => {
    const previa = cola.current.get(clave) ?? Promise.resolve();
    const siguiente = previa.then(tarea, tarea);
    cola.current.set(clave, siguiente);
    return siguiente;
  }, []);

  const nuevaGeneracion = useCallback((clave: string) => {
    const mia = (generacion.current.get(clave) ?? 0) + 1;
    generacion.current.set(clave, mia);
    return () => generacion.current.get(clave) === mia;
  }, []);

  return { encolar, nuevaGeneracion };
}
