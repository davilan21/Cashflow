"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/useToast";
import { hoyISO } from "@/lib/ciclo";
import { resumenPortafolio, aporteVsMeta, serieMensual } from "@/lib/ahorros/calculo";
import { crearInstrumento, actualizarInstrumento, eliminarInstrumento } from "@/lib/ahorros/queries";
import type { AhorroInstrumento, AhorroMovimiento, AhorroValoracion, Miembro, NuevoInstrumento, Trm } from "@/lib/types";
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
  const vsMeta = useMemo(
    () => aporteVsMeta({ instrumentos, movimientos, trms, hoy, plan }),
    [instrumentos, movimientos, trms, hoy, plan]
  );
  const serie = useMemo(
    () => serieMensual({ instrumentos, movimientos, valoraciones, trms, hoy, plan }),
    [instrumentos, movimientos, valoraciones, trms, hoy, plan]
  );
  const hayInstrumentos = instrumentos.length > 0;

  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const detalle = resumen.instrumentos.find((r) => r.instrumento.id === seleccionado) ?? null;

  const [hojaInstrumento, setHojaInstrumento] = useState<{ instrumento: AhorroInstrumento | null } | null>(null);

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

  // setTrms se usa en la Task 16.
  void setTrms;

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
              <ResumenPortafolio resumen={resumen} onEditarTrm={() => {}} />
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
          onAportar={() => {}}
          onRetirar={() => {}}
          onActualizarValor={() => {}}
          onEditar={() => setHojaInstrumento({ instrumento: detalle.instrumento })}
          onEliminarMovimiento={() => {}}
          onEliminarValoracion={() => {}}
          onEliminarInstrumento={borrarInstrumento}
        />
      )}

      {hojaInstrumento && (
        <InstrumentoSheet
          inicial={hojaInstrumento.instrumento}
          miembros={miembros}
          onGuardar={guardarInstrumento}
          onCerrar={() => setHojaInstrumento(null)}
        />
      )}

      <Toast mensaje={toast} />
    </>
  );
}
