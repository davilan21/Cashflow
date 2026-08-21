"use client";

import { Area, AreaChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { pesos, pesosCorto } from "@/lib/money";
import { CORTOS } from "@/lib/labels";
import { diaDe, mesNum } from "@/lib/ciclo";
import { escalaSaldo, indicesEquiespaciados } from "@/lib/flujo/escala";
import type { EventoCaja, PuntoSaldo } from "@/lib/flujo/tipos";

/**
 * Una sola serie: el saldo. Por eso no hay leyenda ni paleta categórica — el
 * título nombra la serie. El color no codifica identidad:
 *
 *  - la línea va en tinta, que es el dato;
 *  - el colchón es una referencia del usuario, así que va en gris recesivo y
 *    punteado, no en un color de estado;
 *  - el cero sí es un estado, y es lo único en rojo.
 *
 * Gris y rojo se separan en ΔE 15,6 para visión normal (validado), y además se
 * distinguen por posición, trazo y etiqueta directa: nunca por color solo.
 */

const INK = "#211D2B";
const MUTED = "#6E6879";
const ALERTA = "#C4544F";
const OK = "#4E8C5A";

function etiquetaEjeX(fecha: string): string {
  return `${diaDe(fecha)} ${CORTOS[mesNum(fecha) - 1]}`;
}

function TooltipCurva({
  active,
  payload,
  eventosPorDia,
}: {
  active?: boolean;
  payload?: { payload: PuntoSaldo }[];
  eventosPorDia: Map<string, EventoCaja[]>;
}) {
  if (!active || !payload?.length) return null;
  const punto = payload[0].payload;
  const delDia = eventosPorDia.get(punto.fecha) ?? [];

  return (
    <div className="bg-ink text-white text-xs rounded-lg px-2.5 py-2 max-w-[220px]">
      <div className="font-semibold">{etiquetaEjeX(punto.fecha)}</div>
      <div className="num text-[13px]">{pesos(punto.saldo)}</div>
      {delDia.length > 0 && (
        <ul className="mt-1.5 pt-1.5 border-t border-white/20 space-y-0.5">
          {delDia.slice(0, 4).map((e, i) => (
            <li key={i} className="flex gap-2 justify-between">
              <span className="truncate opacity-80">{e.etiqueta}</span>
              <span className="num shrink-0">
                {e.monto > 0 ? "+" : "−"}
                {pesosCorto(Math.abs(e.monto))}
              </span>
            </li>
          ))}
          {delDia.length > 4 && <li className="opacity-60">y {delDia.length - 4} más</li>}
        </ul>
      )}
    </div>
  );
}

export function CurvaSaldo({
  serie,
  eventos,
  colchon,
  minimo,
}: {
  serie: PuntoSaldo[];
  eventos: EventoCaja[];
  colchon: number;
  minimo: PuntoSaldo;
}) {
  const eventosPorDia = new Map<string, EventoCaja[]>();
  eventos.forEach((e) => {
    const previos = eventosPorDia.get(e.fecha) ?? [];
    eventosPorDia.set(e.fecha, [...previos, e]);
  });

  const saldos = serie.map((p) => p.saldo);
  const { dominio, ticks } = escalaSaldo(Math.min(...saldos, 0), Math.max(...saldos, colchon, 0));
  const bajoColchon = minimo.saldo < colchon;

  // Ticks de fecha elegidos a mano: con minTickGap, Recharts descarta el
  // primero y el lector no sabe dónde empieza la curva.
  const ticksFecha = indicesEquiespaciados(serie.length, 4).map((i) => serie[i].fecha);

  return (
    <div className="bg-surface border border-line rounded-2xl px-1 pt-4 pb-2.5">
      <ResponsiveContainer width="100%" height={190}>
        <AreaChart data={serie} margin={{ top: 14, right: 26, left: 6, bottom: 0 }}>
          <defs>
            <linearGradient id="relleno-saldo" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={INK} stopOpacity={0.16} />
              <stop offset="100%" stopColor={INK} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <XAxis
            dataKey="fecha"
            ticks={ticksFecha}
            tickFormatter={etiquetaEjeX}
            tick={{ fontSize: 10, fill: MUTED }}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <YAxis
            domain={dominio}
            ticks={ticks}
            tickFormatter={(v: number) => pesosCorto(v)}
            tick={{ fontSize: 10, fill: MUTED }}
            axisLine={false}
            tickLine={false}
            width={46}
          />

          {/* El cero es lo único en rojo: es el único estado real de la curva. */}
          {dominio[0] < 0 && <ReferenceLine y={0} stroke={ALERTA} strokeWidth={1.5} />}

          {colchon > 0 && (
            <ReferenceLine
              y={colchon}
              stroke={MUTED}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              label={{
                value: `colchón ${pesosCorto(colchon)}`,
                position: "insideTopRight",
                fontSize: 10,
                fill: MUTED,
              }}
            />
          )}

          <Tooltip
            cursor={{ stroke: INK, strokeOpacity: 0.25, strokeWidth: 1 }}
            content={<TooltipCurva eventosPorDia={eventosPorDia} />}
          />

          <Area
            type="monotone"
            dataKey="saldo"
            stroke={INK}
            strokeWidth={2}
            fill="url(#relleno-saldo)"
            isAnimationActive={false}
            activeDot={{ r: 4, fill: INK, stroke: "#FFFFFF", strokeWidth: 2 }}
          />

          {/* El punto más apretado, etiquetado directo: es el número que importa. */}
          <ReferenceDot
            x={minimo.fecha}
            y={minimo.saldo}
            r={5}
            fill={bajoColchon ? ALERTA : OK}
            stroke="#FFFFFF"
            strokeWidth={2}
            isFront
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
