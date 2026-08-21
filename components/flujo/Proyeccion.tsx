"use client";

import { useState } from "react";
import { CurvaSaldo } from "./CurvaSaldo";
import { Button } from "@/components/ui/Button";
import { pesos } from "@/lib/money";
import { CORTOS, etiquetaPago, MESES } from "@/lib/labels";
import { diaDe, diasEntre, mesNum, sumarDias } from "@/lib/ciclo";
import type { EventoCaja, Proyeccion as TipoProyeccion } from "@/lib/flujo/tipos";

const SIGNOS: Record<EventoCaja["tipo"], string> = {
  ingreso: "Ingreso",
  gasto_fijo: "Gasto fijo",
  gasto: "Gasto",
  pago_tc: "Tarjeta",
  cuota_deuda: "Cuota",
  aporte: "Aporte",
  otro: "Otro",
};

function fechaLarga(fecha: string): string {
  return `${diaDe(fecha)} de ${MESES[mesNum(fecha) - 1]}`;
}

function fechaCorta(fecha: string): string {
  return `${diaDe(fecha)} ${CORTOS[mesNum(fecha) - 1]}`;
}

/** Agrupa los eventos en semanas de siete días desde hoy. */
function porSemana(eventos: EventoCaja[], hoy: string): { inicio: string; fin: string; eventos: EventoCaja[] }[] {
  const semanas = new Map<number, EventoCaja[]>();
  eventos.forEach((e) => {
    const n = Math.floor(diasEntre(hoy, e.fecha) / 7);
    semanas.set(n, [...(semanas.get(n) ?? []), e]);
  });
  return [...semanas.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([n, lista]) => ({
      inicio: sumarDias(hoy, n * 7),
      fin: sumarDias(hoy, n * 7 + 6),
      eventos: lista,
    }));
}

export function Proyeccion({
  proyeccion,
  colchon,
  hoy,
  ancla,
  diasRecordatorio,
  soloLectura,
  onAjustarSaldo,
}: {
  proyeccion: TipoProyeccion;
  colchon: number;
  hoy: string;
  ancla: { fecha: string; monto: number } | null;
  diasRecordatorio: number;
  soloLectura: boolean;
  onAjustarSaldo: () => void;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const { saldoHoy, serie, eventos, minimo, bajoColchon, ciclosSinPagar } = proyeccion;

  if (!ancla) {
    return (
      <div className="bg-surface border border-line rounded-2xl p-5 text-center">
        <h2 className="font-display text-lg mb-1.5">Falta el punto de partida</h2>
        <p className="text-[13px] text-muted leading-relaxed mb-4">
          Los correos del banco cuentan movimientos, no saldos. Dinos cuánto tienes hoy y desde ahí se proyecta todo.
        </p>
        <Button variant="primary" onClick={onAjustarSaldo} disabled={soloLectura} className="w-full">
          Poner mi saldo
        </Button>
      </div>
    );
  }

  const diasDesdeAncla = diasEntre(ancla.fecha, hoy);
  const tocaReanclar = diasDesdeAncla >= diasRecordatorio;
  const semanas = porSemana(eventos, hoy);

  return (
    <>
      {ciclosSinPagar.length > 0 && (
        <div className="flex items-start gap-2.5 bg-[#FBEEED] text-[#8E3733] rounded-xl px-3 py-2.5 text-[13px] leading-relaxed mb-3">
          <span className="flex-1">
            {ciclosSinPagar.length === 1
              ? `El ciclo ${ciclosSinPagar[0]} se pagaba el ${etiquetaPago(ciclosSinPagar[0])} y todavía no registro el pago.`
              : `Hay ${ciclosSinPagar.length} ciclos de tarjeta con el pago sin registrar.`}
          </span>
        </div>
      )}

      <div className="bg-surface border border-line rounded-2xl p-4 mb-3">
        <div className="flex justify-between items-start gap-2.5">
          <div>
            <div className="text-[11px] tracking-wider uppercase text-muted font-semibold mb-1">Tienes hoy</div>
            <div className="text-[32px] font-semibold leading-none num">{pesos(saldoHoy)}</div>
          </div>
          <button
            onClick={onAjustarSaldo}
            disabled={soloLectura}
            className="text-right text-muted text-xs bg-transparent border-none cursor-pointer disabled:opacity-40"
          >
            ajustar
            <u className="block decoration-dotted underline-offset-[3px]">
              {diasDesdeAncla === 0 ? "hoy" : `hace ${diasDesdeAncla} d`}
            </u>
          </button>
        </div>

        <p className={`text-[13px] mt-3 leading-relaxed ${bajoColchon ? "text-[#8E3733]" : "text-muted"}`}>
          Tu punto más apretado: <b className="num">{pesos(minimo.saldo)}</b> el {fechaLarga(minimo.fecha)}.
          {bajoColchon && colchon > 0 && ` Cruzas el colchón el ${fechaCorta(bajoColchon.fecha)}.`}
        </p>
      </div>

      {tocaReanclar && (
        <div className="flex items-center gap-2.5 bg-[#FAF3E6] text-[#7A5A1E] rounded-xl px-3 py-2.5 text-[13px] leading-relaxed mb-3">
          <span className="flex-1">
            Van {diasDesdeAncla} días desde el último ajuste. Compara con tu banco para que la curva no se desvíe.
          </span>
          <button
            onClick={onAjustarSaldo}
            disabled={soloLectura}
            className="shrink-0 border border-[#E0CDA6] bg-white text-[#7A5A1E] rounded-lg px-2.5 py-1.5 text-xs disabled:opacity-40"
          >
            Ajustar
          </button>
        </div>
      )}

      <CurvaSaldo serie={serie} eventos={eventos} colchon={colchon} minimo={minimo} />

      <h2 className="text-[11px] tracking-wider uppercase text-muted font-semibold mt-5 mb-2">Lo que viene</h2>

      {semanas.length === 0 ? (
        <p className="text-[13px] text-muted bg-surface border border-line rounded-xl px-3 py-3">
          No hay nada proyectado en los próximos {serie.length - 1} días. Agrega tus ingresos y gastos fijos en
          Compromisos.
        </p>
      ) : (
        semanas.map((semana) => {
          const neto = semana.eventos.reduce((s, e) => s + e.monto, 0);
          const expandida = abierta === semana.inicio;
          return (
            <div key={semana.inicio} className="bg-surface border border-line rounded-xl px-3 py-2.5 mb-1.5">
              <button
                onClick={() => setAbierta(expandida ? null : semana.inicio)}
                className="w-full flex items-center gap-2.5 bg-none border-none p-0 text-left cursor-pointer text-ink"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-sm">
                    {fechaCorta(semana.inicio)} – {fechaCorta(semana.fin)}
                  </span>
                  <span className="block text-[11px] text-muted mt-0.5">
                    {semana.eventos.length} {semana.eventos.length === 1 ? "movimiento" : "movimientos"}
                  </span>
                </span>
                <span className={`text-[15px] font-medium num ${neto >= 0 ? "text-ok" : "text-ink"}`}>
                  {neto > 0 ? "+" : "−"}
                  {pesos(Math.abs(neto))}
                </span>
                <span className="text-[#B9B2C6] text-xs">{expandida ? "▲" : "▼"}</span>
              </button>

              {expandida && (
                <ul className="mt-2 pt-2 border-t border-line space-y-1.5">
                  {semana.eventos.map((e, i) => (
                    <li key={i} className="flex items-center gap-2.5 text-[13px]">
                      <span className="flex-1 min-w-0">
                        <span className="block truncate">{e.etiqueta}</span>
                        <span className="block text-[11px] text-muted">
                          {fechaCorta(e.fecha)} · {SIGNOS[e.tipo]}
                          {e.origen === "estimado" && " · estimado"}
                          {e.origen === "real" && " · confirmado"}
                        </span>
                      </span>
                      <span className={`num shrink-0 ${e.monto > 0 ? "text-ok" : "text-ink"}`}>
                        {e.monto > 0 ? "+" : "−"}
                        {pesos(Math.abs(e.monto))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })
      )}
    </>
  );
}
