"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/useToast";
import { hoyISO } from "@/lib/ciclo";
import { resumenPortafolio, aporteVsMeta, serieMensual } from "@/lib/ahorros/calculo";
import type { AhorroInstrumento, AhorroMovimiento, AhorroValoracion, Miembro, Trm } from "@/lib/types";
import type { MesPlan } from "@/lib/plan/calculo";
import { Banner } from "@/components/ui/Banner";
import { Toast } from "@/components/ui/Toast";
import { FiltroTitular, type ValorFiltro } from "./FiltroTitular";
import { ResumenPortafolio } from "./ResumenPortafolio";
import { AporteVsMeta } from "./AporteVsMeta";
import { GraficaEvolucion } from "./GraficaEvolucion";

export function AhorrosClient({
  cuentaId,
  userId,
  instrumentosIniciales,
  movimientosIniciales,
  valoracionesIniciales,
  trmIniciales,
  miembros,
  plan,
  lecturaFallida,
}: {
  cuentaId: string;
  userId: string;
  instrumentosIniciales: AhorroInstrumento[];
  movimientosIniciales: AhorroMovimiento[];
  valoracionesIniciales: AhorroValoracion[];
  trmIniciales: Trm[];
  miembros: Miembro[];
  plan: MesPlan[];
  lecturaFallida: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { mensaje: toast, mostrar } = useToast();

  const [instrumentos, setInstrumentos] = useState(instrumentosIniciales);
  const [movimientos, setMovimientos] = useState(movimientosIniciales);
  const [valoraciones, setValoraciones] = useState(valoracionesIniciales);
  const [trms, setTrms] = useState(trmIniciales);
  const [filtroTitular, setFiltroTitular] = useState<ValorFiltro>(undefined);
  const hoy = hoyISO();

  const resumen = useMemo(
    () => resumenPortafolio({ instrumentos, movimientos, valoraciones, trms, hoy, filtro: { titular: filtroTitular } }),
    [instrumentos, movimientos, valoraciones, trms, hoy, filtroTitular]
  );
  const vsMeta = useMemo(
    () => aporteVsMeta({ instrumentos, movimientos, trms, hoy, plan }),
    [instrumentos, movimientos, trms, hoy, plan]
  );
  const serie = useMemo(
    () => serieMensual({ instrumentos, movimientos, valoraciones, trms, hoy, plan }),
    [instrumentos, movimientos, valoraciones, trms, hoy, plan]
  );
  const hayInstrumentos = instrumentos.length > 0;

  // cuentaId, userId, supabase, setInstrumentos, setMovimientos, setValoraciones,
  // setTrms, mostrar y miembros se usan en las Tasks 13, 14, 15 y 16.
  void cuentaId; void userId; void supabase;
  void setInstrumentos; void setMovimientos; void setValoraciones; void setTrms; void mostrar; void miembros;

  return (
    <>
      {lecturaFallida && <Banner>No se pudo cargar el portafolio. Recargá la página.</Banner>}

      {!lecturaFallida && !hayInstrumentos && (
        <Banner tono="info">Agregá tu primer ahorro para ver el portafolio.</Banner>
      )}

      {hayInstrumentos && (
        <>
          <FiltroTitular miembros={miembros} valor={filtroTitular} onCambiar={setFiltroTitular} />
          <ResumenPortafolio resumen={resumen} onEditarTrm={() => {}} />
          <AporteVsMeta datos={vsMeta} />
          <GraficaEvolucion puntos={serie} />
        </>
      )}

      <Toast mensaje={toast} />
    </>
  );
}
