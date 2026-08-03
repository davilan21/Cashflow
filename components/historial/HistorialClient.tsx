"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/useToast";
import {
  listarGastos,
  listarCategorias,
  obtenerSettings,
  crearGastosMasivo,
  eliminarTodosLosGastos,
  actualizarTopes,
} from "@/lib/supabase/queries";
import { calcularResumenCiclos, calcularRubros } from "@/lib/historial";
import { cicloDe, hoyISO } from "@/lib/ciclo";
import { pesos } from "@/lib/money";
import type { Category, Expense, Settings } from "@/lib/types";
import type { ImportacionParseada } from "@/lib/import";
import { filtrarNuevos } from "@/lib/import";

import { RangoSelector } from "./RangoSelector";
import { GraficaCiclos } from "./GraficaCiclos";
import { AnalisisPorRubro } from "./AnalisisPorRubro";
import { TablaCiclos } from "./TablaCiclos";
import { ExportarPanel } from "@/components/export/ExportarPanel";
import { ImportarModal } from "@/components/export/ImportarModal";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";

const CATEGORIA_VACIA: Category = { id: "otros", nombre: "Otros", color: "#6B6F76", orden: 99, user_id: null };

export function HistorialClient({
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
  const router = useRouter();

  const [gastos, setGastos] = useState(gastosIniciales);
  const [categorias, setCategorias] = useState(categoriasIniciales);
  const [settings, setSettings] = useState(settingsIniciales);
  const [bloqueado, setBloqueado] = useState(lecturaFallida);
  const [cargandoReintento, setCargandoReintento] = useState(false);
  const [rango, setRango] = useState(6);
  const [importando, setImportando] = useState(false);
  const { mensaje: toast, mostrar: mostrarToast } = useToast();

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
    setGastos(gastosRes.data ?? []);
    setCategorias(categoriasRes.data ?? []);
    if (settingsRes.data) setSettings(settingsRes.data);
    setBloqueado(false);
  };

  const cicloHoy = cicloDe(hoyISO());
  const resumen = useMemo(() => calcularResumenCiclos(gastos, cicloHoy), [gastos, cicloHoy]);
  const ventana = useMemo(() => resumen.slice(-rango), [resumen, rango]);
  const ventanaPrevia = useMemo(
    () => resumen.slice(Math.max(0, resumen.length - rango * 2), Math.max(0, resumen.length - rango)),
    [resumen, rango]
  );
  const rubros = useMemo(() => calcularRubros(ventana, ventanaPrevia), [ventana, ventanaPrevia]);
  const cerrados = ventana.filter((r) => !r.enCurso);
  const promedio = cerrados.length ? cerrados.reduce((s, r) => s + r.total, 0) / cerrados.length : 0;

  const irAlCiclo = (ciclo: string) => router.push(`/registro?ciclo=${ciclo}&vista=ciclo`);

  const importar = async (datos: ImportacionParseada, modo: "combinar" | "reemplazar") => {
    const candidatos = modo === "combinar" ? filtrarNuevos(gastos, datos.gastos) : datos.gastos;

    if (modo === "reemplazar") {
      const { error: errBorrar } = await eliminarTodosLosGastos(supabase, userId);
      if (errBorrar) {
        setImportando(false);
        mostrarToast("No se pudo reemplazar el registro");
        return;
      }
    }

    const { data: nuevos, error } = candidatos.length
      ? await crearGastosMasivo(supabase, userId, candidatos)
      : { data: [] as Expense[], error: null };

    if (error) {
      mostrarToast("No se pudo importar. Vuelve a intentar.");
      setImportando(false);
      return;
    }

    const nt = datos.tope ?? settings.tope_ciclo;
    const ntq = datos.topeQ ?? settings.tope_quincena;
    if (datos.tope || datos.topeQ) {
      await actualizarTopes(supabase, userId, { tope_ciclo: nt, tope_quincena: ntq });
    }

    setGastos((prev) => (modo === "reemplazar" ? nuevos ?? [] : [...prev, ...(nuevos ?? [])]));
    setSettings((s) => ({ ...s, tope_ciclo: nt, tope_quincena: ntq }));
    setBloqueado(false);
    setImportando(false);
    mostrarToast(`${(nuevos ?? []).length} consumos cargados`);
  };

  return (
    <>
      {bloqueado && (
        <Banner accion={{ etiqueta: cargandoReintento ? "Reintentando…" : "Reintentar", onClick: reintentar }}>
          No pude leer tus datos guardados. No voy a escribir nada para no borrarlos por encima.
        </Banner>
      )}

      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-[11px] tracking-wider uppercase text-muted font-semibold">Historial</div>
          <h1 className="text-2xl font-extrabold text-ink">
            {resumen.length} {resumen.length === 1 ? "ciclo" : "ciclos"}
          </h1>
          <div className="text-xs text-muted mt-0.5">
            {cerrados.length > 0 ? `Promedio de los cerrados: ${pesos(promedio)}` : "Aún sin ciclos cerrados"}
          </div>
        </div>
        <RangoSelector rango={rango} onCambiar={setRango} />
      </div>

      {resumen.length === 0 ? (
        <>
          <div className="bg-surface border border-dashed border-line rounded-2xl px-4.5 py-6.5 text-center text-muted text-sm leading-relaxed">
            Todavía no hay nada que graficar.
            <br />
            Si vienes de una versión anterior, pega acá tu respaldo.
          </div>
          <div className="flex gap-2 mt-2.5">
            <Button variant="primary" onClick={() => setImportando(true)}>
              Importar JSON
            </Button>
          </div>
        </>
      ) : (
        <>
          <GraficaCiclos ventana={ventana} tope={settings.tope_ciclo} onSeleccionar={irAlCiclo} />

          <div className="flex justify-between items-baseline gap-2.5 text-[11px] tracking-wider uppercase text-muted font-semibold my-6 mb-2.5">
            <span>Por rubro · últimos {ventana.length}</span>
            <span>{ventanaPrevia.length > 0 ? "vs. período anterior" : ""}</span>
          </div>
          <AnalisisPorRubro rubros={rubros} catById={catById} />

          <div className="text-[11px] tracking-wider uppercase text-muted font-semibold my-6 mb-2.5">Ciclos</div>
          <TablaCiclos resumen={resumen} tope={settings.tope_ciclo} catById={catById} onSeleccionar={irAlCiclo} />

          <div className="text-[11px] tracking-wider uppercase text-muted font-semibold my-6 mb-2.5">Respaldo</div>
          <p className="text-[13px] text-muted mb-2.5 leading-relaxed">
            Copia tu JSON de vez en cuando. Sirve para llevar tus datos a otra cuenta o recuperarlos si algo sale mal.
          </p>
          <ExportarPanel gastos={gastos} settings={settings} catById={catById} onCopiado={mostrarToast} />
          <div className="flex gap-2 mt-2.5">
            <Button variant="primary" onClick={() => setImportando(true)}>
              Importar JSON
            </Button>
          </div>
        </>
      )}

      {importando && (
        <ImportarModal
          categoriasValidas={new Set(categorias.map((c) => c.id))}
          onImportar={importar}
          onCerrar={() => setImportando(false)}
        />
      )}

      <Toast mensaje={toast} />
    </>
  );
}
