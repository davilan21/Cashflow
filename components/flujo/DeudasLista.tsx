"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { pesos } from "@/lib/money";
import { hoyISO } from "@/lib/ciclo";
import { tablaAmortizacion } from "@/lib/flujo/deuda";
import { TIPOS_DEUDA } from "@/lib/flujo/etiquetas";
import type { Deuda } from "@/lib/flujo/tipos";

export function DeudasLista({
  deudas,
  soloLectura,
  onEditar,
  onEliminar,
  onNueva,
  onConfirmarCuota,
}: {
  deudas: Deuda[];
  soloLectura: boolean;
  onEditar: (d: Deuda) => void;
  onEliminar: (d: Deuda) => void;
  onNueva: () => void;
  onConfirmarCuota: (d: Deuda, fecha: string, monto: number, saldoDespues: number) => void;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const hoy = hoyISO();

  return (
    <>
      <p className="text-[13px] text-muted mb-3 leading-relaxed">
        Las cuotas futuras se proyectan solas. Confirmar que una salió es manual: estas no se leen del correo.
      </p>

      {deudas.length === 0 ? (
        <p className="text-[13px] text-muted bg-surface border border-line rounded-xl px-3 py-3 mb-3">
          Sin deudas registradas.
        </p>
      ) : (
        deudas.map((d) => {
          const tabla = tablaAmortizacion(d);
          const siguiente = tabla[0];
          const vencida = Boolean(siguiente && siguiente.fecha < hoy);
          const expandida = abierta === d.id;

          return (
            <div
              key={d.id}
              className={`bg-surface border border-line rounded-xl px-3 py-2.5 mb-1.5 ${d.activa ? "" : "opacity-50"}`}
            >
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => !soloLectura && onEditar(d)}
                  className="flex-1 min-w-0 bg-none border-none p-0 m-0 text-left cursor-pointer text-ink"
                  aria-label={`Editar ${d.nombre}`}
                >
                  <span className="block text-sm truncate">{d.nombre}</span>
                  <span className="block text-[11px] text-muted mt-0.5">
                    {TIPOS_DEUDA.find((t) => t.id === d.tipo)?.etiqueta} · {d.cuotas_pagadas}/{d.n_cuotas} cuotas
                    {tabla.length > 0 && ` · termina ${tabla[tabla.length - 1].fecha}`}
                  </span>
                </button>
                <span className="text-[15px] font-medium num shrink-0">{pesos(d.saldo_actual)}</span>
                <button
                  onClick={() => onEliminar(d)}
                  disabled={soloLectura}
                  aria-label={`Eliminar ${d.nombre}`}
                  className="border-none bg-none text-[#B9B2C6] cursor-pointer text-lg px-1 leading-none disabled:opacity-40"
                >
                  ×
                </button>
              </div>

              {tabla.length === 0 ? (
                <p className="text-[11px] text-ok mt-2">Pagada.</p>
              ) : (
                <>
                  <div className="flex items-center gap-2 mt-2.5">
                    <div className="flex-1 text-[12px]">
                      <span className={vencida ? "text-alerta" : "text-muted"}>
                        {vencida ? "Cuota vencida" : "Siguiente cuota"} · {siguiente.fecha}
                      </span>
                      <b className="block num text-[13px] text-ink">{pesos(siguiente.cuota)}</b>
                    </div>
                    <button
                      onClick={() =>
                        onConfirmarCuota(d, siguiente.fecha, siguiente.cuota, siguiente.saldoDespues)
                      }
                      disabled={soloLectura}
                      className="shrink-0 border border-line bg-surface text-ink rounded-lg px-2.5 py-1.5 text-xs cursor-pointer disabled:opacity-40"
                    >
                      Ya la pagué
                    </button>
                  </div>

                  <button
                    onClick={() => setAbierta(expandida ? null : d.id)}
                    className="text-[11px] text-muted underline decoration-dotted underline-offset-[3px] bg-none border-none p-0 mt-2 cursor-pointer"
                  >
                    {expandida ? "Ocultar" : "Ver"} las {tabla.length} cuotas que faltan
                  </button>

                  {expandida && (
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-[11px] num">
                        <thead>
                          <tr className="text-muted text-left">
                            <th className="font-normal py-1 pr-2">#</th>
                            <th className="font-normal py-1 pr-2">Fecha</th>
                            <th className="font-normal py-1 pr-2 text-right">Cuota</th>
                            <th className="font-normal py-1 pr-2 text-right">Interés</th>
                            <th className="font-normal py-1 text-right">Saldo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tabla.map((c) => (
                            <tr key={c.numero} className="border-t border-line">
                              <td className="py-1 pr-2 text-muted">{c.numero}</td>
                              <td className="py-1 pr-2">{c.fecha}</td>
                              <td className="py-1 pr-2 text-right">{pesos(c.cuota)}</td>
                              <td className="py-1 pr-2 text-right text-muted">{pesos(c.interes)}</td>
                              <td className="py-1 text-right">{pesos(c.saldoDespues)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })
      )}

      <Button variant="primary" disabled={soloLectura} onClick={onNueva} className="w-full mt-3">
        Agregar deuda
      </Button>
    </>
  );
}
