"use client";

import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { etiquetaCiclo, etiquetaCorta } from "@/lib/labels";
import { pesos, pesosCorto } from "@/lib/money";
import type { ResumenCiclo } from "@/lib/historial";

const colorPorTotal = (total: number, tope: number) =>
  total > tope ? "#C4544F" : total > tope * 0.8 ? "#C08A2E" : "#4E8C5A";

function TooltipGrafica({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ResumenCiclo }[];
}) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="bg-ink text-white text-xs rounded-lg px-2.5 py-1.5">
      <div className="font-semibold">{etiquetaCiclo(r.ciclo)}</div>
      <div className="num">{pesos(r.total)}</div>
    </div>
  );
}

export function GraficaCiclos({
  ventana,
  tope,
  onSeleccionar,
}: {
  ventana: ResumenCiclo[];
  tope: number;
  onSeleccionar: (ciclo: string) => void;
}) {
  return (
    <div className="bg-surface border border-line rounded-2xl px-1 pt-4 pb-2.5">
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={ventana} margin={{ top: 16, right: 12, left: 12, bottom: 0 }} barCategoryGap="20%">
          <XAxis
            dataKey="ciclo"
            tickFormatter={(ciclo: string) => etiquetaCorta(ciclo)}
            tick={{ fontSize: 10, fill: "#6E6879" }}
            axisLine={false}
            tickLine={false}
          />
          <ReferenceLine
            y={tope}
            stroke="#211D2B"
            strokeOpacity={0.35}
            strokeWidth={2}
            strokeDasharray="4 4"
            label={{ value: `tope ${pesosCorto(tope)}`, position: "insideTopRight", fontSize: 10, fill: "#6E6879" }}
          />
          <Tooltip cursor={{ fill: "rgba(33,29,43,0.06)" }} content={<TooltipGrafica />} />
          <Bar
            dataKey="total"
            radius={[5, 5, 2, 2]}
            onClick={(data: ResumenCiclo) => onSeleccionar(data.ciclo)}
            cursor="pointer"
            isAnimationActive={false}
          >
            {ventana.map((r) => (
              <Cell key={r.ciclo} fill={colorPorTotal(r.total, tope)} fillOpacity={r.enCurso ? 0.55 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
