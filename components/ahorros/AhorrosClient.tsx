"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/useToast";
import { hoyISO } from "@/lib/ciclo";
import { resumenPortafolio, aporteVsMeta, serieMensual } from "@/lib/ahorros/calculo";
import {
  crearInstrumento,
  actualizarInstrumento,
  eliminarInstrumento,
  crearMovimiento,
  eliminarMovimiento,
  guardarValoracion,
  eliminarValoracion,
  guardarTrm,
} from "@/lib/ahorros/queries";
import type {
  AhorroInstrumento,
  AhorroMovimiento,
  AhorroValoracion,
  Miembro,
  NuevoInstrumento,
  NuevoMovimiento,
  TipoMovimiento,
  Trm,
} from "@/lib/types";
import type { MesPlan } from "@/lib/plan/calculo";
import { Banner } from "@/components/ui/Banner";
import { Toast } from "@/components/ui/Toast";
import { FiltroTitular, type ValorFiltro } from "./FiltroTitular";
import { ResumenPortafolio } from "./ResumenPortafolio";
import { AporteVsMeta } from "./AporteVsMeta";
import { GraficaEvolucion } from "./GraficaEvolucion";
import { ListaInstrumentos } from "./ListaInstrumentos";
import { DetalleInstrumentoSheet } from "./DetalleInstrumentoSheet";
import { InstrumentoSheet } from "./InstrumentoSheet";
import { MovimientoSheet } from "./MovimientoSheet";
import { ValoracionSheet } from "./ValoracionSheet";
import { TrmSheet } from "./TrmSheet";

const claveValoracion = (instrumentoId: string, fecha: string) => `${instrumentoId}|${fecha}`;

export function AhorrosClient({
  cuentaId,
  userId,
  instrumentosIniciales,
  movimientosIniciales,
  valoracionesIniciales,
  trmIniciales,
  miembros,
  plan,
  lecturaFallida,
}: {
  cuentaId: string;
  userId: string;
  instrumentosIniciales: AhorroInstrumento[];
  movimientosIniciales: AhorroMovimiento[];
  valoracionesIniciales: AhorroValoracion[];
  trmIniciales: Trm[];
  miembros: Miembro[];
  plan: MesPlan[];
  lecturaFallida: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { mensaje: toast, mostrar } = useToast();

  const [instrumentos, setInstrumentos] = useState(instrumentosIniciales);
  const [movimientos, setMovimientos] = useState(movimientosIniciales);
  const [valoraciones, setValoraciones] = useState(valoracionesIniciales);
  const [trms, setTrms] = useState(trmIniciales);
  const [filtroTitular, setFiltroTitular] = useState<ValorFiltro>(undefined);
  const hoy = hoyISO();

  const resumen = useMemo(
    () => resumenPortafolio({ instrumentos, movimientos, valoraciones, trms, hoy, filtro: { titular: filtroTitular } }),
    [instrumentos, movimientos, valoraciones, trms, hoy, filtroTitular]
  );
  // Sin filtro de titular a propósito: la meta de ahorro del Plan es una cifra
  // del hogar, no por persona, así que el aporte contra esa meta también debe serlo.
  const vsMeta = useMemo(
    () => aporteVsMeta({ instrumentos, movimientos, trms, hoy, plan }),
    [instrumentos, movimientos, trms, hoy, plan]
  );
  const serie = useMemo(() => {
    const instrumentosFiltrados = resumen.instrumentos.map((r) => r.instrumento);
    const idsFiltrados = new Set(instrumentosFiltrados.map((i) => i.id));
    const movimientosFiltrados = movimientos.filter((m) => idsFiltrados.has(m.instrumento_id));
    const valoracionesFiltradas = valoraciones.filter((v) => idsFiltrados.has(v.instrumento_id));
    return serieMensual({
      instrumentos: instrumentosFiltrados,
      movimientos: movimientosFiltrados,
      valoraciones: valoracionesFiltradas,
      trms,
      hoy,
      plan,
    });
  }, [resumen, movimientos, valoraciones, trms, hoy, plan]);
  const hayInstrumentos = instrumentos.length > 0;

  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const detalle = resumen.instrumentos.find((r) => r.instrumento.id === seleccionado) ?? null;

  const [hojaInstrumento, setHojaInstrumento] = useState<{ instrumento: AhorroInstrumento | null } | null>(null);
  const tieneMovimientosInstrumento = Boolean(
    hojaInstrumento?.instrumento &&
      (movimientos.some((m) => m.instrumento_id === hojaInstrumento.instrumento!.id) ||
        valoraciones.some((v) => v.instrumento_id === hojaInstrumento.instrumento!.id))
  );

  const guardarInstrumento = async (datos: NuevoInstrumento) => {
    if (hojaInstrumento?.instrumento) {
      const id = hojaInstrumento.instrumento.id;
      const anterior = hojaInstrumento.instrumento;
      setInstrumentos((prev) => prev.map((i) => (i.id === id ? { ...i, ...datos } : i)));
      setHojaInstrumento(null);
      const { data, error } = await actualizarInstrumento(supabase, id, datos);
      if (error || !data) {
        setInstrumentos((prev) => prev.map((i) => (i.id === id ? anterior : i)));
        mostrar("No se pudo guardar el ahorro");
        return;
      }
      setInstrumentos((prev) => prev.map((i) => (i.id === id ? data : i)));
      return;
    }
    const idTmp = `tmp-${Date.now()}`;
    const provisional: AhorroInstrumento = {
      id: idTmp, cuenta_id: cuentaId, activo: true, created_by: userId, created_at: new Date().toISOString(), updated_at: "", ...datos,
    };
    setInstrumentos((prev) => [...prev, provisional]);
    setHojaInstrumento(null);
    const { data, error } = await crearInstrumento(supabase, cuentaId, datos);
    if (error || !data) {
      setInstrumentos((prev) => prev.filter((i) => i.id !== idTmp));
      mostrar("No se pudo crear el ahorro");
      return;
    }
    setInstrumentos((prev) => prev.map((i) => (i.id === idTmp ? data : i)));
    // Recién creado: abrimos "Valorar" directo para que registre cuánto tiene
    // ahorrado ahí ahora — si no, el ahorro queda en $0 sin que nada lo lleve
    // a ponerle valor.
    setHojaValoracion(data);
  };

  const borrarInstrumento = async () => {
    if (!detalle) return;
    const id = detalle.instrumento.id;
    const instrumentoBorrado = detalle.instrumento;
    const movsBorrados = movimientos.filter((m) => m.instrumento_id === id);
    const valsBorradas = valoraciones.filter((v) => v.instrumento_id === id);
    setInstrumentos((prev) => prev.filter((i) => i.id !== id));
    setMovimientos((prev) => prev.filter((m) => m.instrumento_id !== id));
    setValoraciones((prev) => prev.filter((v) => v.instrumento_id !== id));
    setSeleccionado(null);
    if (id.startsWith("tmp-")) return;
    const { error } = await eliminarInstrumento(supabase, id);
    if (error) {
      setInstrumentos((prev) => (prev.some((i) => i.id === id) ? prev : [...prev, instrumentoBorrado]));
      setMovimientos((prev) => [...prev, ...movsBorrados.filter((m) => !prev.some((x) => x.id === m.id))]);
      setValoraciones((prev) => [...prev, ...valsBorradas.filter((v) => !prev.some((x) => x.id === v.id))]);
      mostrar("No se pudo eliminar el ahorro");
    }
  };

  const colaRef = useRef(new Map<string, Promise<void>>());
  const generacionRef = useRef(new Map<string, number>());
  const encolar = (clave: string, tarea: () => Promise<void>): Promise<void> => {
    const previa = colaRef.current.get(clave) ?? Promise.resolve();
    const siguiente = previa.then(tarea, tarea);
    colaRef.current.set(clave, siguiente);
    return siguiente;
  };

  const [hojaMovimiento, setHojaMovimiento] = useState<{ instrumento: AhorroInstrumento; tipo: TipoMovimiento } | null>(null);

  const guardarMovimiento = async (datos: NuevoMovimiento) => {
    const idTmp = `tmp-${Date.now()}`;
    const provisional: AhorroMovimiento = { id: idTmp, cuenta_id: cuentaId, created_by: userId, created_at: new Date().toISOString(), ...datos };
    setMovimientos((prev) => [provisional, ...prev]);
    setHojaMovimiento(null);
    const { data, error } = await crearMovimiento(supabase, cuentaId, datos);
    if (error || !data) {
      setMovimientos((prev) => prev.filter((m) => m.id !== idTmp));
      mostrar("No se pudo guardar el movimiento");
      return;
    }
    setMovimientos((prev) => prev.map((m) => (m.id === idTmp ? data : m)));
  };

  const borrarMovimiento = async (id: string) => {
    const anterior = movimientos.find((m) => m.id === id) ?? null;
    setMovimientos((prev) => prev.filter((m) => m.id !== id));
    const { error } = await eliminarMovimiento(supabase, id);
    if (error) {
      if (anterior) setMovimientos((prev) => (prev.some((m) => m.id === id) ? prev : [...prev, anterior]));
      mostrar("No se pudo eliminar el movimiento");
    }
  };

  const [hojaValoracion, setHojaValoracion] = useState<AhorroInstrumento | null>(null);

  const guardarValoracionUI = (instrumentoId: string, valor: number, fecha: string) => {
    const clave = claveValoracion(instrumentoId, fecha);
    const miGen = (generacionRef.current.get(clave) ?? 0) + 1;
    generacionRef.current.set(clave, miGen);
    const existente = valoraciones.find((v) => v.instrumento_id === instrumentoId && v.fecha === fecha);
    const provisional: AhorroValoracion = existente
      ? { ...existente, valor }
      : { id: `tmp-${clave}`, cuenta_id: cuentaId, instrumento_id: instrumentoId, fecha, valor, nota: null, created_by: userId, created_at: "" };
    setValoraciones((prev) => [...prev.filter((v) => !(v.instrumento_id === instrumentoId && v.fecha === fecha)), provisional]);
    setHojaValoracion(null);

    const esUltima = () => generacionRef.current.get(clave) === miGen;
    void encolar(clave, async () => {
      const { data, error } = await guardarValoracion(supabase, cuentaId, instrumentoId, fecha, valor, null);
      if (error || !data) {
        if (esUltima()) {
          setValoraciones((prev) =>
            existente
              ? prev.map((v) => (v.instrumento_id === instrumentoId && v.fecha === fecha ? existente : v))
              : prev.filter((v) => !(v.instrumento_id === instrumentoId && v.fecha === fecha))
          );
        }
        mostrar("No se pudo guardar la valoración");
        return;
      }
      setValoraciones((prev) => {
        const hay = prev.some((v) => v.instrumento_id === instrumentoId && v.fecha === fecha);
        if (esUltima()) return hay ? prev.map((v) => (v.instrumento_id === instrumentoId && v.fecha === fecha ? data : v)) : [...prev, data];
        return prev.map((v) => (v.instrumento_id === instrumentoId && v.fecha === fecha ? { ...v, id: data.id } : v));
      });
    }).catch(() => mostrar("Falló una operación de valoración; recargá la página"));
  };

  const borrarValoracion = async (id: string) => {
    const anterior = valoraciones.find((v) => v.id === id) ?? null;
    setValoraciones((prev) => prev.filter((v) => v.id !== id));
    const { error } = await eliminarValoracion(supabase, id);
    if (error) {
      if (anterior) setValoraciones((prev) => (prev.some((v) => v.id === id) ? prev : [...prev, anterior]));
      mostrar("No se pudo eliminar la valoración");
    }
  };

  const [hojaTrm, setHojaTrm] = useState(false);
  const [actualizandoTrm, setActualizandoTrm] = useState(false);
  const [errorTrm, setErrorTrm] = useState<string | null>(null);

  const guardarTrmUI = (valor: number, fuente: "manual" | "datos.gov.co") => {
    const clave = `trm|${hoy}`;
    const miGen = (generacionRef.current.get(clave) ?? 0) + 1;
    generacionRef.current.set(clave, miGen);
    const existente = trms.find((t) => t.fecha === hoy);
    const provisional: Trm = { cuenta_id: cuentaId, fecha: hoy, valor, fuente, created_at: "" };
    setTrms((prev) => [...prev.filter((t) => t.fecha !== hoy), provisional]);
    if (fuente === "manual") setHojaTrm(false);

    const esUltima = () => generacionRef.current.get(clave) === miGen;
    void encolar(clave, async () => {
      const { data, error } = await guardarTrm(supabase, cuentaId, hoy, valor, fuente);
      if (error || !data) {
        if (esUltima()) {
          setTrms((prev) => (existente ? prev.map((t) => (t.fecha === hoy ? existente : t)) : prev.filter((t) => t.fecha !== hoy)));
        }
        mostrar("No se pudo guardar la TRM");
        return;
      }
      if (esUltima()) setTrms((prev) => prev.map((t) => (t.fecha === hoy ? data : t)));
    }).catch(() => mostrar("Falló al guardar la TRM"));
  };

  const actualizarTrmAutomatica = async () => {
    setActualizandoTrm(true);
    setErrorTrm(null);
    try {
      const res = await fetch("/api/trm");
      const body = await res.json();
      if (!res.ok) {
        setErrorTrm(body.error ?? `error ${res.status}`);
        return;
      }
      guardarTrmUI(body.valor, body.fuente);
    } catch {
      setErrorTrm("no se pudo conectar");
    } finally {
      setActualizandoTrm(false);
    }
  };

  useEffect(() => {
    const hayUSD = instrumentos.some((i) => i.moneda === "USD");
    const hayTrmHoy = trms.some((t) => t.fecha === hoy);
    if (hayUSD && !hayTrmHoy) actualizarTrmAutomatica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {lecturaFallida && <Banner>No se pudo cargar el portafolio. Recargá la página.</Banner>}

      {!lecturaFallida && !hayInstrumentos && (
        <Banner tono="info" accion={{ etiqueta: "Agregar", onClick: () => setHojaInstrumento({ instrumento: null }) }}>
          Agregá tu primer ahorro para ver el portafolio.
        </Banner>
      )}

      {hayInstrumentos && (
        <>
          <FiltroTitular miembros={miembros} valor={filtroTitular} onCambiar={setFiltroTitular} />
          <div className="lg:grid lg:grid-cols-12 lg:gap-4">
            <div className="lg:col-span-5">
              <ResumenPortafolio
                resumen={resumen}
                onEditarTrm={() => setHojaTrm(true)}
                actualizando={actualizandoTrm}
                error={errorTrm}
              />
              <AporteVsMeta datos={vsMeta} />
              <GraficaEvolucion puntos={serie} />
            </div>
            <div className="lg:col-span-7">
              <ListaInstrumentos
                resumenes={resumen.instrumentos}
                miembros={miembros}
                onSeleccionar={setSeleccionado}
                onNuevo={() => setHojaInstrumento({ instrumento: null })}
              />
            </div>
          </div>
        </>
      )}

      {detalle && (
        <DetalleInstrumentoSheet
          resumen={detalle}
          movimientos={movimientos.filter((m) => m.instrumento_id === detalle.instrumento.id)}
          valoraciones={valoraciones.filter((v) => v.instrumento_id === detalle.instrumento.id)}
          miembros={miembros}
          onCerrar={() => setSeleccionado(null)}
          onAportar={() => setHojaMovimiento({ instrumento: detalle.instrumento, tipo: "aporte" })}
          onRetirar={() => setHojaMovimiento({ instrumento: detalle.instrumento, tipo: "retiro" })}
          onActualizarValor={() => setHojaValoracion(detalle.instrumento)}
          onEditar={() => setHojaInstrumento({ instrumento: detalle.instrumento })}
          onEliminarMovimiento={borrarMovimiento}
          onEliminarValoracion={borrarValoracion}
          onEliminarInstrumento={borrarInstrumento}
        />
      )}

      {hojaInstrumento && (
        <InstrumentoSheet
          inicial={hojaInstrumento.instrumento}
          miembros={miembros}
          tieneMovimientos={tieneMovimientosInstrumento}
          onGuardar={guardarInstrumento}
          onCerrar={() => setHojaInstrumento(null)}
        />
      )}

      {hojaMovimiento && (
        <MovimientoSheet
          instrumento={hojaMovimiento.instrumento}
          tipo={hojaMovimiento.tipo}
          onGuardar={guardarMovimiento}
          onCerrar={() => setHojaMovimiento(null)}
        />
      )}
      {hojaValoracion && (
        <ValoracionSheet
          instrumento={hojaValoracion}
          movimientos={movimientos}
          onGuardar={(valor, fecha) => guardarValoracionUI(hojaValoracion.id, valor, fecha)}
          onCerrar={() => setHojaValoracion(null)}
        />
      )}

      {hojaTrm && (
        <TrmSheet
          trmActual={trms.find((t) => t.fecha === hoy) ?? trms[0] ?? null}
          actualizando={actualizandoTrm}
          errorActualizar={errorTrm}
          onActualizarAutomatica={actualizarTrmAutomatica}
          onGuardarManual={(v) => guardarTrmUI(v, "manual")}
          onCerrar={() => setHojaTrm(false)}
        />
      )}

      <Toast mensaje={toast} />
    </>
  );
}
