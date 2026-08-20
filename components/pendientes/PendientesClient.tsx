"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { actualizarGastoPendiente, confirmarGastoPendiente } from "@/lib/supabase/queries";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { Toast } from "@/components/ui/Toast";
import { TarjetaPendiente } from "./TarjetaPendiente";
import type { Category, GastoPendiente } from "@/lib/types";
import type { EstadoConexionGmail } from "@/lib/gmail/status";

export function PendientesClient({
  pendientesIniciales,
  categorias,
  estadoConexion,
  lecturaFallida,
}: {
  pendientesIniciales: GastoPendiente[];
  categorias: Category[];
  estadoConexion: EstadoConexionGmail;
  lecturaFallida: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { mensaje, mostrar } = useToast();
  const [pendientes, setPendientes] = useState(pendientesIniciales);
  const [sincronizando, setSincronizando] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [confirmandoLote, setConfirmandoLote] = useState(false);

  // useState solo toma pendientesIniciales en el montaje inicial: sin este
  // efecto, un router.refresh() (tras sincronizar/confirmar/descartar) trae
  // props frescas del servidor pero el estado local se queda pegado en lo
  // que había al montar — la lista se ve desactualizada aunque el badge de
  // NavTabs (que no pasa por useState) sí refleje el conteo real.
  useEffect(() => {
    setPendientes(pendientesIniciales);
  }, [pendientesIniciales]);

  const sincronizar = async () => {
    if (sincronizando) return;
    setSincronizando(true);
    try {
      const res = await fetch("/api/gmail/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        const mensajes: Record<string, string> = {
          expirado: "Tu conexión a Gmail expiró — reconéctala",
          sin_conexion: "No tienes Gmail conectado",
          sin_cuenta: "No se pudo sincronizar: tu cuenta no está lista",
          sync_fallo: "No se pudo sincronizar, intenta de nuevo",
        };
        mostrar(mensajes[data.error] ?? "No se pudo sincronizar");
        return;
      }
      mostrar(data.nuevos > 0 ? `${data.nuevos} gasto(s) nuevo(s)` : "Sin novedades");
    } catch {
      mostrar("No se pudo sincronizar");
    } finally {
      setSincronizando(false);
      router.refresh();
    }
  };

  const quitarDeSeleccion = (id: string) => {
    setSeleccionados((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const confirmar = async (p: GastoPendiente, cambios: { monto: number; categoria: string; nota: string; fecha: string }) => {
    setPendientes((prev) => prev.filter((x) => x.id !== p.id));
    quitarDeSeleccion(p.id);
    const { error } = await confirmarGastoPendiente(supabase, p.id, cambios);
    if (error) {
      setPendientes((prev) => [p, ...prev]);
      mostrar("No se pudo confirmar");
      return;
    }
    mostrar("Gasto confirmado");
    router.refresh();
  };

  const descartar = async (p: GastoPendiente) => {
    setPendientes((prev) => prev.filter((x) => x.id !== p.id));
    quitarDeSeleccion(p.id);
    const { error } = await actualizarGastoPendiente(supabase, p.id, { estado: "descartado" });
    if (error) {
      setPendientes((prev) => [p, ...prev]);
      mostrar("No se pudo descartar");
      return;
    }
    router.refresh();
  };

  // Confirma en lote con los valores tal como están guardados en cada
  // pendiente (no lo que haya sin guardar en el input de cada tarjeta) — el
  // punto de seleccionar varios es aprobar rápido lo que ya se ve bien, no
  // editar uno por uno. Si algo necesita corrección, se edita y confirma
  // individual con su propio botón.
  const confirmarSeleccionados = async () => {
    if (seleccionados.size === 0 || confirmandoLote) return;
    setConfirmandoLote(true);
    const objetivo = pendientes.filter((p) => seleccionados.has(p.id));
    const resultados = await Promise.all(
      objetivo.map(async (p) => {
        const { error } = await confirmarGastoPendiente(supabase, p.id, {
          monto: p.monto,
          categoria: p.categoria,
          nota: p.nota,
          fecha: p.fecha,
        });
        return { id: p.id, error };
      })
    );
    const exitosos = new Set(resultados.filter((r) => !r.error).map((r) => r.id));
    const fallidos = resultados.length - exitosos.size;

    setPendientes((prev) => prev.filter((p) => !exitosos.has(p.id)));
    setSeleccionados((prev) => {
      const next = new Set(prev);
      exitosos.forEach((id) => next.delete(id));
      return next;
    });
    setConfirmandoLote(false);
    mostrar(fallidos > 0 ? `${exitosos.size} confirmados, ${fallidos} no se pudieron` : `${exitosos.size} gasto(s) confirmados`);
    router.refresh();
  };

  if (lecturaFallida) {
    return (
      <Banner accion={{ etiqueta: "Reintentar", onClick: () => router.refresh() }}>
        No pude leer los pendientes. Intenta de nuevo.
      </Banner>
    );
  }

  return (
    <>
      <div className="mb-4">
        <div className="text-[11px] tracking-wider uppercase text-muted font-semibold">Gmail</div>
        <h1 className="text-2xl font-extrabold text-ink">Pendientes</h1>
        <p className="text-xs text-muted mt-0.5">Gastos detectados en tu correo — revisa y confirma.</p>
      </div>

      {!estadoConexion.conectado && <Banner>Todavía no conectas tu Gmail. Ve a Cuenta para conectarlo.</Banner>}

      {estadoConexion.conectado && estadoConexion.estado === "expirado" && (
        <Banner accion={{ etiqueta: "Reconectar", onClick: () => (window.location.href = "/api/gmail/oauth/start") }}>
          Tu conexión a Gmail expiró. Reconéctala para seguir detectando gastos.
        </Banner>
      )}

      {estadoConexion.conectado && estadoConexion.estado === "error" && (
        <Banner accion={{ etiqueta: "Reintentar", onClick: sincronizar }}>
          {estadoConexion.ultimoError ?? "La última sincronización falló."}
        </Banner>
      )}

      {estadoConexion.conectado && (
        <div className="flex items-center justify-between gap-2 bg-surface border border-line rounded-2xl px-4 py-3 mb-3">
          <div className="text-[13px] text-muted">
            {estadoConexion.emailConectado}
            <br />
            {estadoConexion.ultimoSyncAt
              ? // timeZone explícito: sin esto, el servidor (UTC) y el navegador
                // (hora local) arman textos distintos para el mismo timestamp y
                // React tira un mismatch de hidratación (error #418) al montar.
                `Última sync: ${new Date(estadoConexion.ultimoSyncAt).toLocaleString("es-CO", { timeZone: "America/Bogota" })}`
              : "Todavía no sincroniza"}
          </div>
          <Button className="!flex-none px-4" onClick={sincronizar} disabled={sincronizando}>
            {sincronizando ? "…" : "Sincronizar ahora"}
          </Button>
        </div>
      )}

      {pendientes.length === 0 ? (
        <div className="bg-surface border border-dashed border-line rounded-2xl px-4.5 py-6.5 text-center text-muted text-sm leading-relaxed">
          Nada pendiente por revisar.
        </div>
      ) : (
        <>
          <label className="flex items-center gap-2 text-[13px] text-muted mb-2 px-1">
            <input
              type="checkbox"
              checked={pendientes.every((p) => seleccionados.has(p.id))}
              onChange={(e) =>
                setSeleccionados(e.target.checked ? new Set(pendientes.map((p) => p.id)) : new Set())
              }
              className="w-4 h-4 accent-ink"
            />
            Seleccionar todos ({pendientes.length})
          </label>

          {seleccionados.size > 0 && (
            <div className="flex items-center justify-between gap-2 bg-surface border border-line rounded-2xl px-4 py-3 mb-3 sticky top-2 z-10 shadow-sm">
              <span className="text-[13px] text-muted">{seleccionados.size} seleccionado(s)</span>
              <Button
                variant="primary"
                className="!flex-none px-4"
                onClick={confirmarSeleccionados}
                disabled={confirmandoLote}
              >
                {confirmandoLote ? "…" : `Confirmar ${seleccionados.size}`}
              </Button>
            </div>
          )}

          {pendientes.map((p) => (
            <TarjetaPendiente
              key={p.id}
              pendiente={p}
              categorias={categorias}
              seleccionado={seleccionados.has(p.id)}
              onCambiarSeleccion={(valor) =>
                setSeleccionados((prev) => {
                  const next = new Set(prev);
                  if (valor) next.add(p.id);
                  else next.delete(p.id);
                  return next;
                })
              }
              onConfirmar={(cambios) => confirmar(p, cambios)}
              onDescartar={() => descartar(p)}
            />
          ))}
        </>
      )}

      <Toast mensaje={mensaje} />
    </>
  );
}
