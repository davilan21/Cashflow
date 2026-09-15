"use client";

import { Area, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { etiquetaMes, etiquetaMesCorta } from "@/lib/plan/etiquetas";
import { pesos } from "@/lib/money";
import type { PuntoSerie } from "@/lib/ahorros/calculo";

function TooltipEvolucion({ active, payload }: { active?: boolean; payload?: { payload: PuntoSerie }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-ink text-white text-xs rounded-lg px-2.5 py-1.5">
      <div className="font-semibold">{etiquetaMes(p.mes)}</div>
      <div className="num">valor: {pesos(p.valorCOP)}</div>
      <div className="num">aportado: {pesos(p.aportadoCOP)}</div>
      <div className="num">rendimiento: {pesos(p.valorCOP - p.aportadoCOP)}</div>
      {p.trmAproximada && <div className="text-[10px] text-white/70 mt-1">TRM aproximada</div>}
    </div>
  );
}

export function GraficaEvolucion({ puntos }: { puntos: PuntoSerie[] }) {
  if (puntos.length < 2) return null; // una gráfica de un solo punto no dice nada
  return (
    <div
      aria-hidden="true"
      className="bg-surface border border-line rounded-2xl px-1 pt-4 pb-2.5 mb-3.5 min-h-[178px]"
    >
      <ResponsiveContainer width="100%" height={150}>
        <ComposedChart data={puntos} margin={{ top: 12, right: 12, left: 12, bottom: 0 }}>
          <XAxis dataKey="mes" tickFormatter={etiquetaMesCorta} tick={{ fontSize: 10, fill: "#6E6879" }} axisLine={false} tickLine={false} />
          <Tooltip content={<TooltipEvolucion />} />
          <Area type="monotone" dataKey="valorCOP" stroke="#4E8C5A" fill="#4E8C5A" fillOpacity={0.25} strokeWidth={2} isAnimationActive={false} />
          <Line type="monotone" dataKey="aportadoCOP" stroke="#211D2B" strokeDasharray="4 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
