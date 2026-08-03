"use client";

import { useCallback, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Expense, NuevoGasto } from "@/lib/types";
import { crearGasto, actualizarGasto, eliminarGasto } from "@/lib/supabase/queries";
import { useOfflineQueue } from "./useOfflineQueue";

type OperacionPendiente =
  | { tipo: "crear"; idTemporal: string; gasto: NuevoGasto }
  | { tipo: "editar"; id: string; cambios: Partial<NuevoGasto> }
  | { tipo: "eliminar"; id: string };

function operacionesIguales(a: OperacionPendiente, b: OperacionPendiente): boolean {
  if (a.tipo !== b.tipo) return false;
  if (a.tipo === "crear" && b.tipo === "crear") return a.idTemporal === b.idTemporal;
  if (a.tipo === "editar" && b.tipo === "editar") return a.id === b.id;
  if (a.tipo === "eliminar" && b.tipo === "eliminar") return a.id === b.id;
  return false;
}

const ordenarPorFecha = (gastos: Expense[]) => [...gastos].sort((a, b) => b.fecha.localeCompare(a.fecha));

/**
 * Estado y mutaciones de gastos con: UI optimista que se revierte si el
 * insert falla, confirmación de escritura contra la respuesta real de
 * Supabase, y una cola de reintento cuando no hay red — nunca localStorage
 * como fuente de verdad, solo como caché de esa cola.
 */
export function useGastos(opts: {
  supabase: SupabaseClient<Database>;
  userId: string;
  iniciales: Expense[];
  lecturaFallida: boolean;
}) {
  const { supabase, userId, iniciales, lecturaFallida } = opts;
  const [gastos, setGastos] = useState<Expense[]>(iniciales);
  const [bloqueado, setBloqueado] = useState(lecturaFallida);
  const [guardadoError, setGuardadoError] = useState(false);

  const ejecutarOperacion = useCallback(
    async (op: OperacionPendiente): Promise<boolean> => {
      if (op.tipo === "crear") {
        const { data, error } = await crearGasto(supabase, userId, op.gasto);
        if (error || !data) return false;
        setGastos((prev) => ordenarPorFecha(prev.map((g) => (g.id === op.idTemporal ? data : g))));
        return true;
      }
      if (op.tipo === "editar") {
        const { data, error } = await actualizarGasto(supabase, op.id, op.cambios);
        if (error || !data) return false;
        setGastos((prev) => ordenarPorFecha(prev.map((g) => (g.id === op.id ? data : g))));
        return true;
      }
      const { error } = await eliminarGasto(supabase, op.id);
      return !error;
    },
    [supabase, userId]
  );

  const cola = useOfflineQueue<OperacionPendiente>({
    storageKey: `cashflow:cola:${userId}`,
    ejecutar: ejecutarOperacion,
    igual: operacionesIguales,
  });

  const agregar = useCallback(
    async (gasto: NuevoGasto) => {
      const idTemporal = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const ahora = new Date().toISOString();
      const optimista: Expense = {
        id: idTemporal,
        user_id: userId,
        fecha: gasto.fecha,
        monto: gasto.monto,
        categoria: gasto.categoria,
        nota: gasto.nota,
        created_at: ahora,
        updated_at: ahora,
      };
      setGastos((prev) => ordenarPorFecha([optimista, ...prev]));

      if (!navigator.onLine) {
        cola.encolar({ tipo: "crear", idTemporal, gasto });
        return;
      }
      try {
        const { data, error } = await crearGasto(supabase, userId, gasto);
        if (error || !data) throw error ?? new Error("sin datos");
        setGastos((prev) => ordenarPorFecha(prev.map((g) => (g.id === idTemporal ? data : g))));
        setGuardadoError(false);
      } catch {
        if (!navigator.onLine) {
          cola.encolar({ tipo: "crear", idTemporal, gasto });
        } else {
          setGastos((prev) => prev.filter((g) => g.id !== idTemporal));
          setGuardadoError(true);
        }
      }
    },
    [supabase, userId, cola]
  );

  const editar = useCallback(
    async (id: string, cambios: Partial<NuevoGasto>) => {
      const anterior = gastos.find((g) => g.id === id);
      if (!anterior) return;
      setGastos((prev) => ordenarPorFecha(prev.map((g) => (g.id === id ? { ...g, ...cambios } : g))));

      if (id.startsWith("tmp-")) {
        // Todavía no existe en el servidor: cuando la cola cree la fila,
        // que sea ya con estos cambios aplicados.
        cola.actualizar(
          (op) => op.tipo === "crear" && op.idTemporal === id,
          (op) => (op.tipo === "crear" ? { ...op, gasto: { ...op.gasto, ...cambios } } : op)
        );
        return;
      }

      if (!navigator.onLine) {
        cola.encolar({ tipo: "editar", id, cambios });
        return;
      }
      try {
        const { data, error } = await actualizarGasto(supabase, id, cambios);
        if (error || !data) throw error ?? new Error("sin datos");
        setGastos((prev) => ordenarPorFecha(prev.map((g) => (g.id === id ? data : g))));
        setGuardadoError(false);
      } catch {
        if (!navigator.onLine) {
          cola.encolar({ tipo: "editar", id, cambios });
        } else {
          setGastos((prev) => ordenarPorFecha(prev.map((g) => (g.id === id ? anterior : g))));
          setGuardadoError(true);
        }
      }
    },
    [gastos, supabase, cola]
  );

  const eliminar = useCallback(
    async (id: string) => {
      const anterior = gastos.find((g) => g.id === id);
      if (!anterior) return;
      setGastos((prev) => prev.filter((g) => g.id !== id));

      if (id.startsWith("tmp-")) {
        // Nunca llegó a existir en el servidor: solo hace falta olvidar la creación encolada.
        cola.quitar({
          tipo: "crear",
          idTemporal: id,
          gasto: { fecha: anterior.fecha, monto: anterior.monto, categoria: anterior.categoria, nota: anterior.nota ?? "" },
        });
        return;
      }

      if (!navigator.onLine) {
        cola.encolar({ tipo: "eliminar", id });
        return;
      }
      try {
        const { error } = await eliminarGasto(supabase, id);
        if (error) throw error;
        setGuardadoError(false);
      } catch {
        if (!navigator.onLine) {
          cola.encolar({ tipo: "eliminar", id });
        } else {
          setGastos((prev) => ordenarPorFecha([...prev, anterior]));
          setGuardadoError(true);
        }
      }
    },
    [gastos, supabase, cola]
  );

  const pendientesIds = useMemo(() => {
    const ids = new Set<string>();
    for (const op of cola.pendientes) ids.add(op.tipo === "crear" ? op.idTemporal : op.id);
    return ids;
  }, [cola.pendientes]);

  const reemplazarGastos = useCallback((nuevos: Expense[]) => {
    setGastos(ordenarPorFecha(nuevos));
    setBloqueado(false);
  }, []);

  return {
    gastos,
    bloqueado,
    guardadoError,
    agregar,
    editar,
    eliminar,
    reemplazarGastos,
    pendientesIds,
    hayPendientes: cola.pendientes.length > 0,
    online: cola.online,
  };
}
