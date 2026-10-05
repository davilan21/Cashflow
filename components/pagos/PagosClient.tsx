"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/useToast";
import { useColaPorClave } from "@/hooks/useColaPorClave";
import { hoyISO, mesDe } from "@/lib/ciclo";
import { agruparPagos, itemsPagos, resumenPagos, type ItemPago } from "@/lib/pagos/estado";
import { desmarcarPago, marcarPago } from "@/lib/pagos/queries";
import type { PlanAjuste, PlanPago, PlanRubro } from "@/lib/types";
import { Banner } from "@/components/ui/Banner";
import { Toast } from "@/components/ui/Toast";
import { ResumenPagos } from "./ResumenPagos";
import { FilaPago } from "./FilaPago";
import { PagoSheet } from "./PagoSheet";

const clave = (rubroId: string, mes: string) => `${rubroId}|${mes}`;
const mismo = (p: PlanPago, rubroId: string, mes: string) => p.rubro_id === rubroId && p.mes === mes;

export function PagosClient({
  cuentaId,
  rubros,
  ajustes,
  pagosIniciales,
  lecturaFallida,
}: {
  cuentaId: string;
  rubros: PlanRubro[];
  ajustes: PlanAjuste[];
  pagosIniciales: PlanPago[];
  lecturaFallida: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { mensaje, accion, mostrar } = useToast();
  const { encolar, nuevaGeneracion } = useColaPorClave();
  const [pagos, setPagos] = useState(pagosIniciales);
  // Espejo síncrono de `pagos`: los "Deshacer" capturan closures viejas y deben leer la fila ACTUAL.
  const pagosRef = useRef(pagosIniciales);
  const aplicarPagos = (f: (prev: PlanPago[]) => PlanPago[]) => {
    pagosRef.current = f(pagosRef.current);
    setPagos(pagosRef.current);
  };
  const [abierto, setAbierto] = useState<ItemPago | null>(null);
  const [verPagados, setVerPagados] = useState(false);
  const hoy = hoyISO();
  const mesActual = mesDe(hoy);

  const items = useMemo(() => itemsPagos(rubros, ajustes, pagos, hoy), [rubros, ajustes, pagos, hoy]);
  const grupos = useMemo(() => agruparPagos(items), [items]);
  const resumen = resumenPagos(items, mesActual);
  const hayFijos = rubros.some((r) => r.tipo === "fijo");
  const sinDia = rubros.filter((r) => r.tipo === "fijo" && r.dia_pago === null).length;

  // Escritura optimista de una fila (rubro, mes). `previo` es la fila antes del cambio
  // (o undefined): si la escritura falla y sigue siendo la más nueva, se restaura.
  const escribir = (rubroId: string, mes: string, nuevo: PlanPago | null, previo: PlanPago | undefined, tarea: () => Promise<{ fila?: PlanPago | null; error: unknown }>, textoError: string) => {
    const k = clave(rubroId, mes);
    const esUltima = nuevaGeneracion(k);
    aplicarPagos((prev) => [...prev.filter((p) => !mismo(p, rubroId, mes)), ...(nuevo ? [nuevo] : [])]);
    encolar(k, async () => {
      const { fila, error } = await tarea();
      if (error) {
        if (esUltima()) aplicarPagos((prev) => [...prev.filter((p) => !mismo(p, rubroId, mes)), ...(previo ? [previo] : [])]);
        mostrar(textoError);
        return;
      }
      if (fila && esUltima()) aplicarPagos((prev) => prev.map((p) => (mismo(p, rubroId, mes) ? fila : p)));
      router.refresh(); // actualiza el contador de la pestaña (layout de servidor)
    }).catch((e: unknown) => {
      console.error("pagos: falló la cola", e);
      mostrar("Falló una operación de pagos; recargá la página");
    });
  };

  const marcar = (item: ItemPago, monto: number, pagadoEl: string) => {
    const previo = pagosRef.current.find((p) => mismo(p, item.rubroId, item.mes));
    const provisional: PlanPago = previo
      ? { ...previo, monto, pagado_el: pagadoEl }
      : { id: `tmp-${clave(item.rubroId, item.mes)}`, cuenta_id: cuentaId, rubro_id: item.rubroId, mes: item.mes, monto, pagado_el: pagadoEl, created_by: null, created_at: "", updated_at: "" };
    escribir(item.rubroId, item.mes, provisional, previo, async () => {
      const { data, error } = await marcarPago(supabase, cuentaId, item.rubroId, item.mes, monto, pagadoEl);
      return { fila: data, error: error ?? (data ? null : "sin fila") };
    }, `No se pudo marcar ${item.nombre}`);
    return previo;
  };

  const desmarcar = (item: ItemPago) => {
    const previo = pagosRef.current.find((p) => mismo(p, item.rubroId, item.mes));
    escribir(item.rubroId, item.mes, null, previo, async () => {
      const { error } = await desmarcarPago(supabase, cuentaId, item.rubroId, item.mes);
      return { error };
    }, `No se pudo desmarcar ${item.nombre}`);
    return previo;
  };

  // Deshacer vuelve exactamente a la fila previa (o a "sin pago").
  const restaurar = (item: ItemPago, previo: PlanPago | undefined) => {
    if (previo) marcar(item, previo.monto, previo.pagado_el);
    else desmarcar(item);
  };

  const check = (item: ItemPago) => {
    if (item.pago) {
      const previo = desmarcar(item);
      mostrar(`${item.nombre} desmarcado`, { etiqueta: "Deshacer", onClick: () => { mostrar(""); restaurar(item, previo); } });
    } else {
      const previo = marcar(item, item.montoSugerido, hoy);
      mostrar(`${item.nombre} pagado`, { etiqueta: "Deshacer", onClick: () => { mostrar(""); restaurar(item, previo); } });
    }
  };

  const grupo = (titulo: string, lista: ItemPago[]) =>
    lista.length > 0 && (
      <section className="mt-4">
        <h2 className="text-[11px] tracking-wider uppercase text-muted font-semibold mb-1.5">{titulo}</h2>
        {lista.map((i) => (
          <FilaPago key={clave(i.rubroId, i.mes)} item={i} hoy={hoy} mostrarMes={i.mes !== mesActual} onCheck={() => check(i)} onAbrir={() => setAbierto(i)} />
        ))}
      </section>
    );

  return (
    <>
      {lecturaFallida && <Banner>No se pudieron cargar los pagos. Recargá la página.</Banner>}

      {!lecturaFallida && !hayFijos && (
        <Banner tono="info" accion={{ etiqueta: "Ir a Plan", onClick: () => router.push("/plan") }}>
          Agregá tus gastos fijos en Plan para controlar sus pagos.
        </Banner>
      )}

      {hayFijos && (
        <>
          <ResumenPagos mes={mesActual} {...resumen} />
          {sinDia > 0 && (
            <div className="text-[12px] text-muted mb-2">
              {sinDia === 1 ? "1 fijo sin día de pago" : `${sinDia} fijos sin día de pago`}: agregalo en{" "}
              <Link href="/plan" className="underline">Plan</Link> para ver cuándo vencen.
            </div>
          )}
          {grupo("Vencidos", grupos.vencidos)}
          {grupo("Vencen pronto", grupos.pronto)}
          {grupo("Pendientes", grupos.pendientes)}
          {grupo("Sin día", grupos.sinDia)}
          {grupos.pagados.length > 0 && (
            <section className="mt-4">
              <button type="button" onClick={() => setVerPagados((v) => !v)} className="text-[11px] tracking-wider uppercase text-muted font-semibold mb-1.5 min-h-[44px] cursor-pointer" aria-expanded={verPagados}>
                Pagados ({grupos.pagados.length}) {verPagados ? "▴" : "▾"}
              </button>
              {verPagados &&
                grupos.pagados.map((i) => (
                  <FilaPago key={clave(i.rubroId, i.mes)} item={i} hoy={hoy} mostrarMes={i.mes !== mesActual} onCheck={() => check(i)} onAbrir={() => setAbierto(i)} />
                ))}
            </section>
          )}
        </>
      )}

      {abierto && (
        <PagoSheet
          item={abierto}
          hoy={hoy}
          onGuardar={(monto, fecha) => {
            marcar(abierto, monto, fecha);
            setAbierto(null);
          }}
          onDesmarcar={() => {
            const previo = desmarcar(abierto);
            const item = abierto;
            mostrar(`${item.nombre} desmarcado`, { etiqueta: "Deshacer", onClick: () => { mostrar(""); restaurar(item, previo); } });
            setAbierto(null);
          }}
          onCerrar={() => setAbierto(null)}
        />
      )}

      <Toast mensaje={mensaje} accion={accion} />
    </>
  );
}
