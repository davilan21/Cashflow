"use client";

import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/useToast";
import { hoyISO } from "@/lib/ciclo";
import { calcularPlan } from "@/lib/plan/calculo";
import { guardarAjuste, quitarAjuste, crearRubro, actualizarRubro, eliminarRubro } from "@/lib/plan/queries";
import { etiquetaMes, etiquetaOrigenTC } from "@/lib/plan/etiquetas";
import type { Expense, NuevoRubro, PlanAjuste, PlanPago, PlanRubro, TipoRubro } from "@/lib/types";
import { Banner } from "@/components/ui/Banner";
import { Toast } from "@/components/ui/Toast";
import { SubTabs, type VistaPlan } from "./SubTabs";
import { ResumenMes } from "./ResumenMes";
import { GraficaAhorro } from "./GraficaAhorro";
import { ListaMeses } from "./ListaMeses";
import { AjusteSheet } from "./AjusteSheet";
import { RubrosPanel } from "./RubrosPanel";
import { RubroSheet } from "./RubroSheet";

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function PlanClient({
  cuentaId,
  rubrosIniciales,
  ajustesIniciales,
  gastos,
  pagos,
  lecturaFallida,
}: {
  cuentaId: string;
  rubrosIniciales: PlanRubro[];
  ajustesIniciales: PlanAjuste[];
  gastos: Expense[];
  pagos: PlanPago[];
  lecturaFallida: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { mensaje: toast, mostrar } = useToast();

  const [rubros, setRubros] = useState(rubrosIniciales);
  const [ajustes, setAjustes] = useState(ajustesIniciales);
  const [vista, setVista] = useState<VistaPlan>("meses");
  const hoy = hoyISO();
  const [abierto, setAbierto] = useState<string | null>(hoy.slice(0, 7));

  const plan = useMemo(() => calcularPlan({ rubros, ajustes, gastos, hoy, pagos }), [rubros, ajustes, gastos, hoy, pagos]);
  const actual = plan.find((m) => m.esActual) ?? plan[0];
  const ultimo = plan[plan.length - 1];
  const hayIngresos = rubros.some((r) => r.tipo === "ingreso");

  const [editando, setEditando] = useState<{ mes: string; rubroId: string | null } | null>(null);
  const [hojaRubro, setHojaRubro] = useState<{ rubro: PlanRubro | null; tipo: TipoRubro } | null>(null);

  const guardarRubro = async (datos: NuevoRubro) => {
    if (!hojaRubro) return;
    setHojaRubro(null);
    if (hojaRubro.rubro) {
      const id = hojaRubro.rubro.id;
      const previo = hojaRubro.rubro;
      setRubros((prev) => prev.map((r) => (r.id === id ? { ...r, ...datos } : r)));
      const { data, error } = await actualizarRubro(supabase, id, datos);
      if (error || !data) {
        setRubros((prev) => prev.map((r) => (r.id === id ? previo : r)));
        mostrar("No se pudo guardar el rubro");
        return;
      }
      setRubros((prev) => prev.map((r) => (r.id === id ? data : r)));
      return;
    }
    const idTmp = `tmp-${Date.now()}`;
    const provisional: PlanRubro = { id: idTmp, cuenta_id: cuentaId, orden: 0, created_by: null, created_at: new Date().toISOString(), updated_at: "", ...datos };
    setRubros((prev) => [...prev, provisional]);
    const { data, error } = await crearRubro(supabase, cuentaId, datos);
    if (error || !data) {
      setRubros((prev) => prev.filter((r) => r.id !== idTmp));
      mostrar("No se pudo crear el rubro");
      return;
    }
    setRubros((prev) => prev.map((r) => (r.id === idTmp ? data : r)));
  };

  const borrarRubro = async () => {
    if (!hojaRubro?.rubro) return;
    const id = hojaRubro.rubro.id;
    const rubroBorrado = hojaRubro.rubro;
    const ajustesBorrados = ajustes.filter((a) => a.rubro_id === id);
    setHojaRubro(null);
    setRubros((prev) => prev.filter((r) => r.id !== id));
    setAjustes((prev) => prev.filter((a) => a.rubro_id !== id)); // la base cascadea; el estado también
    const { error } = await eliminarRubro(supabase, id);
    if (error) {
      setRubros((prev) => (prev.some((r) => r.id === id) ? prev : [...prev, rubroBorrado]));
      setAjustes((prev) => [...prev, ...ajustesBorrados.filter((b) => !prev.some((a) => a.id === b.id))]);
      mostrar("No se pudo eliminar el rubro");
    }
  };

  const mismoAjuste = (a: PlanAjuste, mes: string, rubroId: string | null) => a.mes === mes && a.rubro_id === rubroId;

  const claveDe = (mes: string, rubroId: string | null) => `${mes}|${rubroId ?? "tc"}`;

  // Dos guardados/quitados seguidos sobre la misma clave (mes+rubro) llegaban
  // desordenados: la respuesta del primero podía resolver después que la del
  // segundo y pisar el estado más nuevo con el viejo. Encolamos por clave para
  // que cada mutación de una fila espere a que termine la anterior sobre esa
  // misma fila (aunque haya fallado), sin bloquear otras filas. Además cada
  // escritura optimista lleva un número de generación por clave: al resolver,
  // solo la generación más nueva puede decidir el estado final de la fila (crear,
  // reemplazar o revertir); una respuesta vieja que llega tarde no pisa lo que
  // ya escribió una llamada posterior.
  const colaRef = useRef(new Map<string, Promise<void>>());
  const generacionRef = useRef(new Map<string, number>());
  const encolar = (clave: string, tarea: () => Promise<void>): Promise<void> => {
    const previa = colaRef.current.get(clave) ?? Promise.resolve();
    const siguiente = previa.then(tarea, tarea); // corre aunque la anterior haya fallado
    colaRef.current.set(clave, siguiente);
    return siguiente;
  };

  const guardar = (mes: string, rubroId: string | null, monto: number) => {
    const clave = claveDe(mes, rubroId);
    const filaPrevia = ajustes.find((a) => mismoAjuste(a, mes, rubroId));
    const provisional: PlanAjuste = filaPrevia
      ? { ...filaPrevia, monto }
      : { id: `tmp-${mes}-${rubroId ?? "tc"}`, cuenta_id: cuentaId, mes, rubro_id: rubroId, monto, updated_at: "" };
    const miGen = (generacionRef.current.get(clave) ?? 0) + 1;
    generacionRef.current.set(clave, miGen);
    // Optimista: se ve el cambio ya; si falla, vuelve solo esta fila.
    setAjustes((prev) => [...prev.filter((a) => !mismoAjuste(a, mes, rubroId)), provisional]);
    setEditando(null);
    encolar(clave, async () => {
      const esUltima = () => generacionRef.current.get(clave) === miGen;
      const { data, error } = await guardarAjuste(supabase, cuentaId, mes, rubroId, monto);
      if (error || !data) {
        if (esUltima()) {
          setAjustes((prev) =>
            filaPrevia
              ? prev.map((a) => (mismoAjuste(a, mes, rubroId) ? filaPrevia : a))
              : prev.filter((a) => !mismoAjuste(a, mes, rubroId)),
          );
        }
        mostrar("No se pudo guardar el ajuste");
        return;
      }
      setAjustes((prev) => {
        const hay = prev.some((a) => mismoAjuste(a, mes, rubroId));
        if (esUltima()) return hay ? prev.map((a) => (mismoAjuste(a, mes, rubroId) ? data : a)) : [...prev, data];
        return prev.map((a) => (mismoAjuste(a, mes, rubroId) ? { ...a, id: data.id, updated_at: data.updated_at } : a));
      });
    }).catch(() => mostrar("Falló una operación del plan; recargá la página"));
  };

  const quitar = (mes: string, rubroId: string | null) => {
    const clave = claveDe(mes, rubroId);
    const filaPrevia = ajustes.find((a) => mismoAjuste(a, mes, rubroId));
    const miGen = (generacionRef.current.get(clave) ?? 0) + 1;
    generacionRef.current.set(clave, miGen);
    setAjustes((prev) => prev.filter((a) => !mismoAjuste(a, mes, rubroId)));
    setEditando(null);
    encolar(clave, async () => {
      const esUltima = () => generacionRef.current.get(clave) === miGen;
      const { error } = await quitarAjuste(supabase, cuentaId, mes, rubroId);
      if (error) {
        if (esUltima()) {
          setAjustes((prev) => {
            const yaExiste = prev.some((a) => mismoAjuste(a, mes, rubroId));
            if (yaExiste || !filaPrevia) return prev;
            return [...prev, filaPrevia];
          });
        }
        mostrar("No se pudo quitar el ajuste");
      }
    }).catch(() => mostrar("Falló una operación del plan; recargá la página"));
  };

  // Datos que la hoja necesita para el ajuste abierto.
  const hoja = (() => {
    if (!editando) return null;
    const m = plan.find((x) => x.mes === editando.mes);
    if (!m) return null;
    if (editando.rubroId === null) {
      return {
        titulo: `Tarjeta · ${etiquetaMes(m.mes).toLowerCase()}`,
        montoActual: m.tc.monto,
        referencia: { etiqueta: capitalizar(etiquetaOrigenTC(m.tc.origenReferencia)), monto: m.tc.referencia },
        tieneAjuste: m.tc.origen === "manual",
        etiquetaVolver: "Volver al estimado",
      };
    }
    const linea = [...m.ingresos, ...m.fijos].find((l) => l.rubroId === editando.rubroId);
    if (!linea) return null;
    return {
      titulo: `${linea.nombre} · ${etiquetaMes(m.mes).toLowerCase()}`,
      montoActual: linea.monto,
      referencia: { etiqueta: "Por defecto", monto: linea.montoDefault },
      tieneAjuste: linea.ajustado,
      etiquetaVolver: "Volver al valor por defecto",
    };
  })();

  return (
    <>
      {lecturaFallida && <Banner>No se pudo cargar el plan. Recargá la página.</Banner>}

      <SubTabs vista={vista} onCambiar={setVista} />

      {vista === "meses" && (
        <>
          {!lecturaFallida && !hayIngresos && (
            <Banner
              tono="info"
              accion={{
                etiqueta: "Agregar",
                onClick: () => {
                  setVista("rubros");
                  setHojaRubro({ rubro: null, tipo: "ingreso" });
                },
              }}
            >
              Agregá tus ingresos y gastos fijos para ver el ahorro.
            </Banner>
          )}
          <ResumenMes mes={actual} ultimo={ultimo} />
          <GraficaAhorro
            plan={plan}
            onSeleccionar={(mes) => {
              setAbierto(mes);
              document.getElementById(`mes-${mes}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          />
          <ListaMeses plan={plan} abierto={abierto} onAbrir={setAbierto} onEditar={(mes, rubroId) => setEditando({ mes, rubroId })} />
        </>
      )}

      {vista === "rubros" && (
        <RubrosPanel
          rubros={rubros}
          onNuevo={(tipo) => setHojaRubro({ rubro: null, tipo })}
          onEditar={(rubro) => setHojaRubro({ rubro, tipo: rubro.tipo })}
        />
      )}

      {editando && hoja && (
        <AjusteSheet
          {...hoja}
          onGuardar={(monto) => guardar(editando.mes, editando.rubroId, monto)}
          onQuitar={() => quitar(editando.mes, editando.rubroId)}
          onCerrar={() => setEditando(null)}
        />
      )}

      {hojaRubro && (
        <RubroSheet
          inicial={hojaRubro.rubro}
          tipoInicial={hojaRubro.tipo}
          mesActual={hoy.slice(0, 7)}
          ajustesDelRubro={hojaRubro.rubro ? ajustes.filter((a) => a.rubro_id === hojaRubro.rubro!.id).length : 0}
          onGuardar={guardarRubro}
          onEliminar={borrarRubro}
          onCerrar={() => setHojaRubro(null)}
        />
      )}

      <Toast mensaje={toast} />
    </>
  );
}
