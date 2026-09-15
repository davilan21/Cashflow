"use client";

import { Bar, BarChart, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { etiquetaMes, etiquetaMesCorta } from "@/lib/plan/etiquetas";
import { pesos, pesosCorto } from "@/lib/money";
import type { MesPlan } from "@/lib/plan/calculo";

const OK = "#4E8C5A";
const ALERTA = "#C4544F";

function TooltipAhorro({ active, payload }: { active?: boolean; payload?: { payload: MesPlan }[] }) {
  if (!active || !payload?.length) return null;
  const m = payload[0].payload;
  return (
    <div className="bg-ink text-white text-xs rounded-lg px-2.5 py-1.5">
      <div className="font-semibold">{etiquetaMes(m.mes)}</div>
      <div className="num">{m.ahorro === null ? "—" : pesos(m.ahorro)}</div>
    </div>
  );
}

export function GraficaAhorro({ plan, onSeleccionar }: { plan: MesPlan[]; onSeleccionar: (mes: string) => void }) {
  const datos = plan.map((m) => ({ ...m, valor: m.ahorro ?? 0 }));
  return (
    <div className="bg-surface border border-line rounded-2xl px-1 pt-4 pb-2.5 mb-3.5" style={{ height: 170 }}>
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={datos} margin={{ top: 18, right: 12, left: 12, bottom: 0 }} barCategoryGap="22%">
          <XAxis dataKey="mes" tickFormatter={etiquetaMesCorta} tick={{ fontSize: 10, fill: "#6E6879" }} axisLine={false} tickLine={false} />
          <ReferenceLine y={0} stroke="#211D2B" strokeOpacity={0.25} />
          <Tooltip cursor={{ fill: "rgba(33,29,43,0.06)" }} content={<TooltipAhorro />} />
          <Bar dataKey="valor" radius={[5, 5, 2, 2]} onClick={(d: MesPlan) => onSeleccionar(d.mes)} cursor="pointer" isAnimationActive={false}>
            {/* Estimados (todo lo que no es factura) van translúcidos, como GraficaCiclos hace con el ciclo en curso. */}
            {datos.map((m) => (
              <Cell key={m.mes} fill={m.valor < 0 ? ALERTA : OK} fillOpacity={m.tc.origen === "real" ? 1 : 0.55} />
            ))}
            <LabelList dataKey="valor" position="top" formatter={(v: number) => (v === 0 ? "" : pesosCorto(v))} style={{ fontSize: 10, fill: "#6E6879" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
