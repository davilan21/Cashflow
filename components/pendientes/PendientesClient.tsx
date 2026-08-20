"use client";

import { useMemo, useState } from "react";
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

  const confirmar = async (p: GastoPendiente, cambios: { monto: number; categoria: string; nota: string; fecha: string }) => {
    setPendientes((prev) => prev.filter((x) => x.id !== p.id));
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
    const { error } = await actualizarGastoPendiente(supabase, p.id, { estado: "descartado" });
    if (error) {
      setPendientes((prev) => [p, ...prev]);
      mostrar("No se pudo descartar");
    }
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
              ? `Última sync: ${new Date(estadoConexion.ultimoSyncAt).toLocaleString("es-CO")}`
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
        pendientes.map((p) => (
          <TarjetaPendiente
            key={p.id}
            pendiente={p}
            categorias={categorias}
            onConfirmar={(cambios) => confirmar(p, cambios)}
            onDescartar={() => descartar(p)}
          />
        ))
      )}

      <Toast mensaje={mensaje} />
    </>
  );
}
