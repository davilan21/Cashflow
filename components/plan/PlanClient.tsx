"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/useToast";
import { hoyISO } from "@/lib/ciclo";
import { calcularPlan } from "@/lib/plan/calculo";
import type { Expense, PlanAjuste, PlanRubro } from "@/lib/types";
import { Banner } from "@/components/ui/Banner";
import { Toast } from "@/components/ui/Toast";
import { SubTabs, type VistaPlan } from "./SubTabs";
import { ResumenMes } from "./ResumenMes";
import { ListaMeses } from "./ListaMeses";

export function PlanClient({
  cuentaId,
  rubrosIniciales,
  ajustesIniciales,
  gastos,
  lecturaFallida,
}: {
  cuentaId: string;
  rubrosIniciales: PlanRubro[];
  ajustesIniciales: PlanAjuste[];
  gastos: Expense[];
  lecturaFallida: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { mensaje: toast, mostrar } = useToast();

  const [rubros, setRubros] = useState(rubrosIniciales);
  const [ajustes, setAjustes] = useState(ajustesIniciales);
  const [vista, setVista] = useState<VistaPlan>("meses");
  const hoy = hoyISO();
  const [abierto, setAbierto] = useState<string | null>(hoy.slice(0, 7));

  const plan = useMemo(() => calcularPlan({ rubros, ajustes, gastos, hoy }), [rubros, ajustes, gastos, hoy]);
  const actual = plan.find((m) => m.esActual) ?? plan[0];
  const ultimo = plan[plan.length - 1];
  const hayIngresos = rubros.some((r) => r.tipo === "ingreso");

  // supabase, cuentaId, setRubros, setAjustes y mostrar se usan en las Tasks 11 y 12.
  void supabase;
  void cuentaId;
  void setRubros;
  void setAjustes;
  void mostrar;

  return (
    <>
      {lecturaFallida && <Banner>No se pudo cargar el plan. Recargá la página.</Banner>}

      <SubTabs vista={vista} onCambiar={setVista} />

      {vista === "meses" && (
        <>
          {!lecturaFallida && !hayIngresos && (
            <Banner tono="info" accion={{ etiqueta: "Agregar", onClick: () => setVista("rubros") }}>
              Agregá tus ingresos y gastos fijos para ver el ahorro.
            </Banner>
          )}
          <ResumenMes mes={actual} ultimo={ultimo} />
          <ListaMeses plan={plan} abierto={abierto} onAbrir={setAbierto} onEditar={() => {}} />
        </>
      )}

      {vista === "rubros" && <div className="text-[13px] text-muted">Próximamente.</div>}

      <Toast mensaje={toast} />
    </>
  );
}
