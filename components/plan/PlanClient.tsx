"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/useToast";
import { hoyISO } from "@/lib/ciclo";
import { calcularPlan } from "@/lib/plan/calculo";
import { guardarAjuste, quitarAjuste } from "@/lib/plan/queries";
import { etiquetaMes, etiquetaOrigenTC } from "@/lib/plan/etiquetas";
import type { Expense, PlanAjuste, PlanRubro } from "@/lib/types";
import { Banner } from "@/components/ui/Banner";
import { Toast } from "@/components/ui/Toast";
import { SubTabs, type VistaPlan } from "./SubTabs";
import { ResumenMes } from "./ResumenMes";
import { ListaMeses } from "./ListaMeses";
import { AjusteSheet } from "./AjusteSheet";

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

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

  // setRubros se usa en la vista Rubros (Task 12).
  void setRubros;

  const [editando, setEditando] = useState<{ mes: string; rubroId: string | null } | null>(null);

  const mismoAjuste = (a: PlanAjuste, mes: string, rubroId: string | null) => a.mes === mes && a.rubro_id === rubroId;

  const guardar = async (mes: string, rubroId: string | null, monto: number) => {
    const anterior = ajustes;
    const existente = ajustes.find((a) => mismoAjuste(a, mes, rubroId));
    const provisional: PlanAjuste = existente
      ? { ...existente, monto }
      : { id: `tmp-${mes}-${rubroId ?? "tc"}`, cuenta_id: cuentaId, mes, rubro_id: rubroId, monto, updated_at: "" };
    // Optimista: se ve el cambio ya; si falla, vuelve lo anterior.
    setAjustes((prev) => [...prev.filter((a) => !mismoAjuste(a, mes, rubroId)), provisional]);
    setEditando(null);
    const { data, error } = await guardarAjuste(supabase, cuentaId, mes, rubroId, monto);
    if (error || !data) {
      setAjustes(anterior);
      mostrar("No se pudo guardar el ajuste");
      return;
    }
    setAjustes((prev) => prev.map((a) => (a.id === provisional.id ? data : a)));
  };

  const quitar = async (mes: string, rubroId: string | null) => {
    const anterior = ajustes;
    setAjustes((prev) => prev.filter((a) => !mismoAjuste(a, mes, rubroId)));
    setEditando(null);
    const { error } = await quitarAjuste(supabase, cuentaId, mes, rubroId);
    if (error) {
      setAjustes(anterior);
      mostrar("No se pudo quitar el ajuste");
    }
  };

  // Datos que la hoja necesita para el ajuste abierto.
  const hoja = (() => {
    if (!editando) return null;
    const m = plan.find((x) => x.mes === editando.mes);
    if (!m) return null;
    if (editando.rubroId === null) {
      return {
        titulo: `Tarjeta · ${etiquetaMes(m.mes).toLowerCase()}`,
        montoActual: m.tc.monto,
        referencia: { etiqueta: capitalizar(etiquetaOrigenTC(m.tc.origenReferencia)), monto: m.tc.referencia },
        tieneAjuste: m.tc.origen === "manual",
      };
    }
    const linea = [...m.ingresos, ...m.fijos].find((l) => l.rubroId === editando.rubroId);
    if (!linea) return null;
    return {
      titulo: `${linea.nombre} · ${etiquetaMes(m.mes).toLowerCase()}`,
      montoActual: linea.monto,
      referencia: { etiqueta: "Por defecto", monto: linea.montoDefault },
      tieneAjuste: linea.ajustado,
    };
  })();

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
          <ListaMeses plan={plan} abierto={abierto} onAbrir={setAbierto} onEditar={(mes, rubroId) => setEditando({ mes, rubroId })} />
        </>
      )}

      {vista === "rubros" && <div className="text-[13px] text-muted">Próximamente.</div>}

      {editando && hoja && (
        <AjusteSheet
          {...hoja}
          onGuardar={(monto) => guardar(editando.mes, editando.rubroId, monto)}
          onQuitar={() => quitar(editando.mes, editando.rubroId)}
          onCerrar={() => setEditando(null)}
        />
      )}

      <Toast mensaje={toast} />
    </>
  );
}
