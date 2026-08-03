"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { listarGastos, listarCategorias, obtenerSettings, actualizarTopes } from "@/lib/supabase/queries";
import { useGastos } from "@/hooks/useGastos";
import { useToast } from "@/hooks/useToast";
import { cicloDe, cicloInicio, cicloFin, mitadDe, desplazarMes, diasEnMes, diasEntre, mesNum, hoyISO } from "@/lib/ciclo";
import { pesos } from "@/lib/money";
import type { Category, Expense, NuevoGasto, Settings } from "@/lib/types";

import { CicloHeader } from "./CicloHeader";
import { TopeCard } from "./TopeCard";
import { EntradaTexto } from "./EntradaTexto";
import { ConfirmarGastos } from "./ConfirmarGastos";
import { Tabs, type Vista } from "./Tabs";
import { DesgloseCategoria } from "./DesgloseCategoria";
import { ListaMovimientos } from "./ListaMovimientos";
import { EditarGastoModal } from "./EditarGastoModal";
import { TopesModal } from "./TopesModal";
import { TopeQuincena } from "./TopeQuincena";
import { Banner } from "@/components/ui/Banner";
import { Toast } from "@/components/ui/Toast";

const CATEGORIA_VACIA: Category = { id: "otros", nombre: "Otros", color: "#6B6F76", orden: 99, user_id: null };
const CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function RegistroClient({
  userId,
  gastosIniciales,
  categorias: categoriasIniciales,
  settingsIniciales,
  lecturaFallida,
}: {
  userId: string;
  gastosIniciales: Expense[];
  categorias: Category[];
  settingsIniciales: Settings;
  lecturaFallida: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const {
    gastos,
    bloqueado,
    guardadoError,
    agregar,
    editar,
    eliminar,
    reemplazarGastos,
    pendientesIds,
    hayPendientes,
    online,
  } = useGastos({ supabase, userId, iniciales: gastosIniciales, lecturaFallida });
  const { mensaje, mostrar } = useToast();

  const [categorias, setCategorias] = useState(categoriasIniciales);
  const [settings, setSettings] = useState(settingsIniciales);
  const [cargandoReintento, setCargandoReintento] = useState(false);

  const [ciclo, setCiclo] = useState(cicloDe(hoyISO()));
  const [vista, setVista] = useState<Vista>(mitadDe(hoyISO()) === 1 ? "m1" : "m2");
  const [texto, setTexto] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [propuestos, setPropuestos] = useState<NuevoGasto[] | null>(null);
  const [editando, setEditando] = useState<Expense | null>(null);
  const [editandoTopes, setEditandoTopes] = useState(false);

  const catById = (id: string) => categorias.find((c) => c.id === id) ?? CATEGORIA_VACIA;

  const reintentar = async () => {
    setCargandoReintento(true);
    const [gastosRes, categoriasRes, settingsRes] = await Promise.all([
      listarGastos(supabase, userId),
      listarCategorias(supabase),
      obtenerSettings(supabase, userId),
    ]);
    setCargandoReintento(false);
    if (gastosRes.error || categoriasRes.error || settingsRes.error) return;
    reemplazarGastos(gastosRes.data ?? []);
    setCategorias(categoriasRes.data ?? []);
    if (settingsRes.data) setSettings(settingsRes.data);
  };

  const hoy = hoyISO();
  const cicloHoy = cicloDe(hoy);
  const esCicloActual = cicloHoy === ciclo;
  const haySiguiente = ciclo < cicloHoy;
  const mesPrev = desplazarMes(ciclo, -1);

  const delCiclo = useMemo(
    () => gastos.filter((g) => cicloDe(g.fecha) === ciclo).sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [gastos, ciclo]
  );
  const total = delCiclo.reduce((s, g) => s + g.monto, 0);
  const m1 = delCiclo.filter((g) => mitadDe(g.fecha) === 1);
  const m2 = delCiclo.filter((g) => mitadDe(g.fecha) === 2);
  const totalM1 = m1.reduce((s, g) => s + g.monto, 0);
  const totalM2 = m2.reduce((s, g) => s + g.monto, 0);
  const visibles = vista === "ciclo" ? delCiclo : vista === "m1" ? m1 : m2;
  const totalVisible = vista === "ciclo" ? total : vista === "m1" ? totalM1 : totalM2;

  const largo = diasEntre(cicloInicio(ciclo), cicloFin(ciclo)) + 1;
  const corridos = esCicloActual ? diasEntre(cicloInicio(ciclo), hoy) + 1 : largo;
  const restantes = Math.max(0, largo - corridos);
  const proyeccion = corridos > 0 ? (total / corridos) * largo : 0;

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, number>();
    visibles.forEach((g) => mapa.set(g.categoria, (mapa.get(g.categoria) ?? 0) + g.monto));
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  }, [visibles]);

  const registrar = async () => {
    const t = texto.trim();
    if (!t || procesando || bloqueado) return;
    setProcesando(true);
    setError("");
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: t }),
      });
      if (!res.ok) throw new Error("parse falló");
      const data = await res.json();
      const nuevos: NuevoGasto[] = data.gastos ?? [];
      if (nuevos.length === 0) {
        setError('No encontré un monto ahí. Prueba con algo como "200k en almuerzo".');
        return;
      }
      setPropuestos(nuevos);
    } catch {
      setError("No pude interpretar eso. Intenta de nuevo.");
    } finally {
      setProcesando(false);
    }
  };

  const confirmarPropuestos = async (confirmados: NuevoGasto[]) => {
    setPropuestos(null);
    setTexto("");
    for (const g of confirmados) await agregar(g);
    if (confirmados[0]) {
      setCiclo(cicloDe(confirmados[0].fecha));
      setVista(mitadDe(confirmados[0].fecha) === 1 ? "m1" : "m2");
    }
  };

  const guardarTopes = async (topeCiclo: number, topeQuincena: number) => {
    const anterior = settings;
    setSettings((s) => ({ ...s, tope_ciclo: topeCiclo, tope_quincena: topeQuincena }));
    setEditandoTopes(false);
    const { data, error: err } = await actualizarTopes(supabase, userId, {
      tope_ciclo: topeCiclo,
      tope_quincena: topeQuincena,
    });
    if (err || !data) {
      setSettings(anterior);
      mostrar("No se pudieron guardar los topes");
    }
  };

  const guardarEdicion = async (cambios: { monto: number; categoria: string; nota: string; fecha: string }) => {
    if (!editando) return;
    await editar(editando.id, cambios);
    setEditando(null);
  };

  return (
    <>
      {bloqueado && (
        <Banner accion={{ etiqueta: cargandoReintento ? "Reintentando…" : "Reintentar", onClick: reintentar }}>
          No pude leer tus datos guardados. No voy a escribir nada para no borrarlos por encima.
        </Banner>
      )}
      {!bloqueado && guardadoError && (
        <Banner>No se pudo guardar en el servidor. Lo que ves sigue acá, pero podría perderse al recargar.</Banner>
      )}
      {!bloqueado && !online && (
        <Banner>Sin conexión: los cambios se guardan cuando vuelva la señal.</Banner>
      )}
      {!bloqueado && online && hayPendientes && (
        <Banner>Hay movimientos pendientes por sincronizar.</Banner>
      )}

      <CicloHeader
        ciclo={ciclo}
        haySiguiente={haySiguiente}
        onAnterior={() => setCiclo(desplazarMes(ciclo, -1))}
        onSiguiente={() => setCiclo(desplazarMes(ciclo, 1))}
      />

      <TopeCard
        total={total}
        tope={settings.tope_ciclo}
        topeQuincena={settings.tope_quincena}
        onEditarTopes={() => setEditandoTopes(true)}
        esCicloActual={esCicloActual}
        restantes={restantes}
        proyeccion={proyeccion}
      />

      <EntradaTexto
        texto={texto}
        onChange={setTexto}
        onEnviar={registrar}
        procesando={procesando}
        deshabilitado={bloqueado}
        error={error}
      />

      <Tabs
        vista={vista}
        onCambiar={setVista}
        etiquetaM1={`16–${diasEnMes(mesPrev)} ${CORTOS[mesNum(mesPrev) - 1]}`}
        etiquetaM2={`1–15 ${CORTOS[mesNum(ciclo) - 1]}`}
        totalM1={totalM1}
        totalM2={totalM2}
        total={total}
      />

      {vista !== "ciclo" && <TopeQuincena totalVisible={totalVisible} topeQuincena={settings.tope_quincena} />}

      {visibles.length === 0 ? (
        <div className="bg-surface border border-dashed border-line rounded-2xl px-4.5 py-6.5 text-center text-muted text-sm leading-relaxed">
          Nada registrado en este corte.
          <br />
          Escribe arriba tu primer consumo.
        </div>
      ) : (
        <>
          <div className="flex justify-between items-baseline gap-2.5 text-[11px] tracking-wider uppercase text-muted font-semibold my-6 mb-2.5">
            <span>Desglose</span>
            <span className="num">{pesos(totalVisible)}</span>
          </div>
          <DesgloseCategoria porCategoria={porCategoria} totalVisible={totalVisible} catById={catById} />

          <div className="flex justify-between items-baseline gap-2.5 text-[11px] tracking-wider uppercase text-muted font-semibold my-6 mb-2.5">
            <span>Movimientos</span>
          </div>
          <ListaMovimientos
            visibles={visibles}
            vista={vista}
            catById={catById}
            pendientesIds={pendientesIds}
            onEditar={setEditando}
            onEliminar={eliminar}
          />
        </>
      )}

      {propuestos && (
        <ConfirmarGastos
          propuestos={propuestos}
          categorias={categorias}
          onConfirmar={confirmarPropuestos}
          onCancelar={() => setPropuestos(null)}
        />
      )}

      {editando && (
        <EditarGastoModal
          gasto={editando}
          categorias={categorias}
          onGuardar={guardarEdicion}
          onEliminar={() => {
            eliminar(editando.id);
            setEditando(null);
          }}
          onCerrar={() => setEditando(null)}
        />
      )}

      {editandoTopes && (
        <TopesModal
          topeCiclo={settings.tope_ciclo}
          topeQuincena={settings.tope_quincena}
          onGuardar={guardarTopes}
          onCerrar={() => setEditandoTopes(false)}
        />
      )}

      <Toast mensaje={mensaje} />
    </>
  );
}
