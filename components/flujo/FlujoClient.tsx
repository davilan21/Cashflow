"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  actualizarDeuda,
  actualizarInstrumento,
  actualizarRegla,
  confirmarCuotaDeuda,
  crearDeuda,
  crearInstrumento,
  crearRegla,
  crearSaldo,
  eliminarDeuda,
  eliminarInstrumento,
  eliminarRegla,
  guardarConfig,
  marcarPrincipal,
  type Instrumento,
  type NuevaDeuda,
  type NuevaRegla,
  type NuevoInstrumento,
} from "@/lib/flujo/queries";
import { BANCOS, notaMedioPago, resumenRegla, TIPOS_INSTRUMENTO } from "@/lib/flujo/etiquetas";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { Toast } from "@/components/ui/Toast";
import { pesos } from "@/lib/money";
import { ReglaModal } from "./ReglaModal";
import { InstrumentoModal } from "./InstrumentoModal";
import { DeudaModal } from "./DeudaModal";
import { DeudasLista } from "./DeudasLista";
import { Proyeccion } from "./Proyeccion";
import { SaldoModal } from "./SaldoModal";
import type { Category } from "@/lib/types";
import type { Ancla, Deuda, Proyeccion as TipoProyeccion, Regla, TipoRegla } from "@/lib/flujo/tipos";

type Seccion = "proyeccion" | "compromisos" | "deudas" | "cuentas";

const GRUPOS: { tipo: TipoRegla; titulo: string; vacio: string }[] = [
  { tipo: "ingreso", titulo: "Ingresos", vacio: "Sin ingresos todavía. La nómina va acá." },
  { tipo: "gasto_fijo", titulo: "Gastos fijos", vacio: "Sin gastos fijos todavía. Arriendo, servicios, suscripciones." },
  { tipo: "aporte_inversion", titulo: "Aportes", vacio: "Sin aportes a inversión todavía." },
];

export function FlujoClient({
  cuentaId,
  proyeccion,
  hoy,
  ancla,
  colchon,
  diasRecordatorio,
  reglasIniciales,
  deudasIniciales,
  instrumentosIniciales,
  categorias,
  lecturaFallida,
}: {
  cuentaId: string | null;
  proyeccion: TipoProyeccion;
  hoy: string;
  ancla: Ancla | null;
  colchon: number;
  diasRecordatorio: number;
  reglasIniciales: Regla[];
  deudasIniciales: Deuda[];
  instrumentosIniciales: Instrumento[];
  categorias: Category[];
  lecturaFallida: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { mensaje, mostrar } = useToast();

  const [seccion, setSeccion] = useState<Seccion>("proyeccion");
  const [reglas, setReglas] = useState(reglasIniciales);
  const [deudas, setDeudas] = useState(deudasIniciales);
  const [instrumentos, setInstrumentos] = useState(instrumentosIniciales);

  const [modalRegla, setModalRegla] = useState<{ abierto: boolean; regla: Regla | null }>({
    abierto: false,
    regla: null,
  });
  const [modalInstrumento, setModalInstrumento] = useState<{ abierto: boolean; instrumento: Instrumento | null }>({
    abierto: false,
    instrumento: null,
  });
  const [modalDeuda, setModalDeuda] = useState<{ abierto: boolean; deuda: Deuda | null }>({
    abierto: false,
    deuda: null,
  });
  const [modalSaldo, setModalSaldo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // Si la carga inicial falló, la pantalla queda de solo lectura: escribir
  // encima de datos que no se pudieron leer es cómo se pierde información.
  const soloLectura = lecturaFallida || !cuentaId;

  const guardarRegla = async (datos: NuevaRegla) => {
    if (guardando || !cuentaId) return;
    setGuardando(true);
    const editando = modalRegla.regla;

    if (editando) {
      const { error } = await actualizarRegla(supabase, editando.id, datos);
      setGuardando(false);
      if (error) {
        mostrar("No se pudo guardar el compromiso");
        return;
      }
      setReglas((prev) => prev.map((r) => (r.id === editando.id ? { ...r, ...datos } : r)));
    } else {
      const { data, error } = await crearRegla(supabase, cuentaId, datos);
      setGuardando(false);
      if (error || !data) {
        mostrar("No se pudo crear el compromiso");
        return;
      }
      setReglas((prev) => [...prev, data]);
    }

    setModalRegla({ abierto: false, regla: null });
    mostrar("Compromiso guardado");
    router.refresh();
  };

  const borrarRegla = async (regla: Regla) => {
    if (!confirm(`¿Eliminar "${regla.nombre}"?`)) return;
    const previas = reglas;
    setReglas((prev) => prev.filter((r) => r.id !== regla.id));
    const { error } = await eliminarRegla(supabase, regla.id);
    if (error) {
      setReglas(previas);
      mostrar("No se pudo eliminar");
      return;
    }
    mostrar("Compromiso eliminado");
    router.refresh();
  };

  const alternarActiva = async (regla: Regla) => {
    const previas = reglas;
    setReglas((prev) => prev.map((r) => (r.id === regla.id ? { ...r, activa: !r.activa } : r)));
    const { error } = await actualizarRegla(supabase, regla.id, { activa: !regla.activa });
    if (error) {
      setReglas(previas);
      mostrar("No se pudo cambiar el estado");
    }
  };

  /**
   * Anclar el saldo: se inserta un snapshot nuevo, nunca se edita el anterior,
   * para conservar el historial de la deriva. El colchón va en la misma
   * operación porque se editan juntos.
   */
  const anclarSaldo = async (fecha: string, monto: number, nuevoColchon: number) => {
    if (guardando || !cuentaId) return;
    setGuardando(true);
    const { error } = await crearSaldo(supabase, cuentaId, fecha, monto);
    if (error) {
      setGuardando(false);
      mostrar("No se pudo guardar el saldo");
      return;
    }
    if (nuevoColchon !== colchon) {
      const { error: errorConfig } = await guardarConfig(supabase, cuentaId, { colchon: nuevoColchon });
      // El saldo ya quedó, que es lo importante; si el colchón falla se avisa
      // pero no se revierte el ancla.
      if (errorConfig) mostrar("El saldo quedó, pero no se pudo guardar el colchón");
    }
    setGuardando(false);
    setModalSaldo(false);
    mostrar("Saldo actualizado");
    router.refresh();
  };

  const guardarDeuda = async (datos: NuevaDeuda) => {
    if (guardando || !cuentaId) return;
    setGuardando(true);
    const editando = modalDeuda.deuda;

    if (editando) {
      const { error } = await actualizarDeuda(supabase, editando.id, datos);
      setGuardando(false);
      if (error) {
        mostrar("No se pudo guardar la deuda");
        return;
      }
      setDeudas((prev) => prev.map((d) => (d.id === editando.id ? { ...d, ...datos } : d)));
    } else {
      const { data, error } = await crearDeuda(supabase, cuentaId, datos);
      setGuardando(false);
      if (error || !data) {
        mostrar("No se pudo crear la deuda");
        return;
      }
      setDeudas((prev) => [...prev, data]);
    }

    setModalDeuda({ abierto: false, deuda: null });
    mostrar("Deuda guardada");
    router.refresh();
  };

  const borrarDeuda = async (deuda: Deuda) => {
    if (!confirm(`¿Eliminar "${deuda.nombre}"?`)) return;
    const previas = deudas;
    setDeudas((prev) => prev.filter((d) => d.id !== deuda.id));
    const { error } = await eliminarDeuda(supabase, deuda.id);
    if (error) {
      setDeudas(previas);
      mostrar("No se pudo eliminar");
      return;
    }
    mostrar("Deuda eliminada");
    router.refresh();
  };

  /**
   * Registrar una cuota avanza la deuda y escribe el movimiento. Va por RPC
   * porque las dos cosas tienen que pasar juntas — y por eso acá NO se hace
   * actualización optimista: si se pintara el avance antes de confirmar y el
   * servidor rechazara, la pantalla mostraría una cuota pagada que no existe.
   */
  const registrarCuota = async (deuda: Deuda, fecha: string, monto: number, saldoDespues: number) => {
    if (guardando) return;
    setGuardando(true);
    const { error } = await confirmarCuotaDeuda(supabase, deuda.id, fecha, monto, saldoDespues);
    setGuardando(false);
    if (error) {
      // 23505 = el índice único (cuenta, ref_id, ref_periodo): esta cuota ya
      // se había confirmado, probablemente desde otra pestaña.
      mostrar(error.code === "23505" ? "Esa cuota ya estaba registrada" : "No se pudo registrar la cuota");
      return;
    }
    setDeudas((prev) =>
      prev.map((d) =>
        d.id === deuda.id
          ? { ...d, saldo_actual: saldoDespues, saldo_a_fecha: fecha, cuotas_pagadas: d.cuotas_pagadas + 1 }
          : d
      )
    );
    mostrar("Cuota registrada");
    router.refresh();
  };

  const guardarInstrumento = async (datos: NuevoInstrumento) => {
    if (guardando || !cuentaId) return;
    setGuardando(true);
    const editando = modalInstrumento.instrumento;

    if (editando) {
      const { error } = await actualizarInstrumento(supabase, editando.id, datos);
      setGuardando(false);
      if (error) {
        mostrar("No se pudo guardar la cuenta");
        return;
      }
      setInstrumentos((prev) => prev.map((i) => (i.id === editando.id ? { ...i, ...datos } : i)));
    } else {
      const { data, error } = await crearInstrumento(supabase, cuentaId, datos);
      setGuardando(false);
      if (error || !data) {
        // El índice único de ruteo (cuenta, banco, últimos4) es el rechazo más
        // probable acá, y merece un mensaje que se entienda.
        mostrar(error?.code === "23505" ? "Ya tienes una cuenta de ese banco con esos dígitos" : "No se pudo crear la cuenta");
        return;
      }
      setInstrumentos((prev) => [...prev, data]);
    }

    setModalInstrumento({ abierto: false, instrumento: null });
    mostrar("Cuenta guardada");
    router.refresh();
  };

  const borrarInstrumento = async (instrumento: Instrumento) => {
    if (!confirm(`¿Eliminar "${instrumento.nombre}"?`)) return;
    const previos = instrumentos;
    setInstrumentos((prev) => prev.filter((i) => i.id !== instrumento.id));
    const { error } = await eliminarInstrumento(supabase, instrumento.id);
    if (error) {
      setInstrumentos(previos);
      mostrar("No se pudo eliminar");
      return;
    }
    mostrar("Cuenta eliminada");
    router.refresh();
  };

  const hacerPrincipal = async (instrumento: Instrumento) => {
    const previos = instrumentos;
    setInstrumentos((prev) => prev.map((i) => ({ ...i, principal: i.id === instrumento.id })));
    const { error } = await marcarPrincipal(supabase, instrumento.id);
    if (error) {
      setInstrumentos(previos);
      mostrar("No se pudo cambiar la cuenta principal");
    }
  };

  return (
    <>
      {soloLectura && (
        <Banner accion={{ etiqueta: "Reintentar", onClick: () => router.refresh() }}>
          No se pudieron cargar tus compromisos. La pantalla queda de solo lectura para no escribir encima de lo que
          no se pudo leer.
        </Banner>
      )}

      <div className="flex gap-1.5 mb-4">
        {(
          [
            ["proyeccion", "Proyección"],
            ["compromisos", "Compromisos"],
            ["deudas", "Deudas"],
            ["cuentas", "Cuentas"],
          ] as [Seccion, string][]
        ).map(([id, texto]) => (
          <button
            key={id}
            onClick={() => setSeccion(id)}
            className={`flex-1 px-1 py-2.5 rounded-xl border text-xs sm:text-sm truncate ${
              seccion === id ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted"
            }`}
          >
            {texto}
          </button>
        ))}
      </div>

      {seccion === "proyeccion" ? (
        <Proyeccion
          proyeccion={proyeccion}
          colchon={colchon}
          hoy={hoy}
          ancla={ancla}
          diasRecordatorio={diasRecordatorio}
          soloLectura={soloLectura}
          onAjustarSaldo={() => setModalSaldo(true)}
        />
      ) : seccion === "deudas" ? (
        <DeudasLista
          deudas={deudas}
          soloLectura={soloLectura}
          onEditar={(d) => setModalDeuda({ abierto: true, deuda: d })}
          onEliminar={borrarDeuda}
          onNueva={() => setModalDeuda({ abierto: true, deuda: null })}
          onConfirmarCuota={registrarCuota}
        />
      ) : seccion === "compromisos" ? (
        <>
          {GRUPOS.map((grupo) => {
            const delGrupo = reglas.filter((r) => r.tipo === grupo.tipo);
            return (
              <section key={grupo.tipo} className="mb-5">
                <h2 className="text-[11px] tracking-wider uppercase text-muted font-semibold mb-2">{grupo.titulo}</h2>
                {delGrupo.length === 0 ? (
                  <p className="text-[13px] text-muted bg-surface border border-line rounded-xl px-3 py-3">
                    {grupo.vacio}
                  </p>
                ) : (
                  delGrupo.map((regla) => {
                    const nota = notaMedioPago(regla);
                    return (
                      <div
                        key={regla.id}
                        className={`flex items-center gap-2.5 bg-surface border border-line rounded-xl px-3 py-2.5 mb-1.5 ${
                          regla.activa ? "" : "opacity-50"
                        }`}
                      >
                        <button
                          onClick={() => !soloLectura && setModalRegla({ abierto: true, regla })}
                          className="flex-1 min-w-0 bg-none border-none p-0 m-0 text-left cursor-pointer text-ink"
                          aria-label={`Editar ${regla.nombre}`}
                        >
                          <span className="block text-sm truncate">{regla.nombre}</span>
                          <span className="block text-[11px] text-muted mt-0.5">
                            {resumenRegla(regla)}
                            {regla.monto_tipo === "estimado" && " · estimado"}
                          </span>
                          {nota && <span className="block text-[11px] text-[#8A7FA6] mt-0.5">{nota}</span>}
                        </button>
                        <span
                          className={`text-[15px] font-medium num shrink-0 ${
                            regla.tipo === "ingreso" ? "text-ok" : "text-ink"
                          }`}
                        >
                          {regla.tipo === "ingreso" ? "+" : "−"}
                          {pesos(regla.monto)}
                        </span>
                        <button
                          onClick={() => alternarActiva(regla)}
                          disabled={soloLectura}
                          aria-label={regla.activa ? "Pausar" : "Reactivar"}
                          title={regla.activa ? "Pausar" : "Reactivar"}
                          className="border-none bg-none text-[#B9B2C6] cursor-pointer text-sm px-1 leading-none disabled:opacity-40"
                        >
                          {regla.activa ? "❙❙" : "▶"}
                        </button>
                        <button
                          onClick={() => borrarRegla(regla)}
                          disabled={soloLectura}
                          aria-label={`Eliminar ${regla.nombre}`}
                          className="border-none bg-none text-[#B9B2C6] cursor-pointer text-lg px-1 leading-none disabled:opacity-40"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })
                )}
              </section>
            );
          })}

          <Button
            variant="primary"
            disabled={soloLectura}
            onClick={() => setModalRegla({ abierto: true, regla: null })}
            className="w-full"
          >
            Agregar compromiso
          </Button>
        </>
      ) : (
        <>
          <p className="text-[13px] text-muted mb-3 leading-relaxed">
            Tus cuentas y tarjetas. Los últimos cuatro dígitos son la llave con la que los correos sabrán de dónde
            salió cada movimiento.
          </p>

          {instrumentos.length === 0 ? (
            <p className="text-[13px] text-muted bg-surface border border-line rounded-xl px-3 py-3 mb-3">
              Sin cuentas todavía.
            </p>
          ) : (
            instrumentos.map((i) => (
              <div
                key={i.id}
                className={`flex items-center gap-2.5 bg-surface border border-line rounded-xl px-3 py-2.5 mb-1.5 ${
                  i.activo ? "" : "opacity-50"
                }`}
              >
                <button
                  onClick={() => !soloLectura && setModalInstrumento({ abierto: true, instrumento: i })}
                  className="flex-1 min-w-0 bg-none border-none p-0 m-0 text-left cursor-pointer text-ink"
                  aria-label={`Editar ${i.nombre}`}
                >
                  <span className="block text-sm truncate">
                    {i.nombre}
                    {i.ultimos4 && <span className="text-muted num"> ·{i.ultimos4}</span>}
                  </span>
                  <span className="block text-[11px] text-muted mt-0.5">
                    {BANCOS.find((b) => b.id === i.banco)?.etiqueta} ·{" "}
                    {TIPOS_INSTRUMENTO.find((t) => t.id === i.tipo)?.etiqueta}
                  </span>
                </button>
                {i.principal ? (
                  <span className="text-[10px] text-muted border border-line rounded-full px-1.5 py-0.5 shrink-0">
                    principal
                  </span>
                ) : (
                  <button
                    onClick={() => hacerPrincipal(i)}
                    disabled={soloLectura}
                    className="text-[10px] text-muted border border-line rounded-full px-1.5 py-0.5 shrink-0 cursor-pointer disabled:opacity-40"
                  >
                    hacer principal
                  </button>
                )}
                <button
                  onClick={() => borrarInstrumento(i)}
                  disabled={soloLectura}
                  aria-label={`Eliminar ${i.nombre}`}
                  className="border-none bg-none text-[#B9B2C6] cursor-pointer text-lg px-1 leading-none disabled:opacity-40"
                >
                  ×
                </button>
              </div>
            ))
          )}

          <Button
            variant="primary"
            disabled={soloLectura}
            onClick={() => setModalInstrumento({ abierto: true, instrumento: null })}
            className="w-full mt-3"
          >
            Agregar cuenta
          </Button>
        </>
      )}

      {modalRegla.abierto && (
        <ReglaModal
          regla={modalRegla.regla}
          instrumentos={instrumentos.filter((i) => i.activo)}
          categorias={categorias}
          guardando={guardando}
          onGuardar={guardarRegla}
          onCerrar={() => setModalRegla({ abierto: false, regla: null })}
        />
      )}

      {modalSaldo && (
        <SaldoModal
          ancla={ancla}
          saldoProyectado={proyeccion.saldoHoy}
          colchon={colchon}
          guardando={guardando}
          onGuardar={anclarSaldo}
          onCerrar={() => setModalSaldo(false)}
        />
      )}

      {modalDeuda.abierto && (
        <DeudaModal
          deuda={modalDeuda.deuda}
          instrumentos={instrumentos.filter((i) => i.activo)}
          guardando={guardando}
          onGuardar={guardarDeuda}
          onCerrar={() => setModalDeuda({ abierto: false, deuda: null })}
        />
      )}

      {modalInstrumento.abierto && (
        <InstrumentoModal
          instrumento={modalInstrumento.instrumento}
          guardando={guardando}
          onGuardar={guardarInstrumento}
          onCerrar={() => setModalInstrumento({ abierto: false, instrumento: null })}
        />
      )}

      <Toast mensaje={mensaje} />
    </>
  );
}
