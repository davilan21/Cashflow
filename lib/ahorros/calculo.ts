import { diasEntre } from "@/lib/ciclo";
import type { AhorroInstrumento, AhorroMovimiento, AhorroValoracion, Moneda, Trm } from "@/lib/types";
import type { EstadoCdt, OrigenValor } from "./etiquetas";

export interface InfoCdt {
  diasAlVencimiento: number;
  estado: EstadoCdt;
}

export interface ResumenInstrumento {
  instrumento: AhorroInstrumento;
  /** En la moneda del instrumento. */
  aportado: number;
  valor: number;
  origenValor: OrigenValor;
  rendimiento: number;
  /** null si aportado <= 0: no hay base para un porcentaje. */
  rendimientoPct: number | null;
  /** En COP. null si es USD y no hay TRM — nunca 0. */
  aportadoCOP: number | null;
  valorCOP: number | null;
  rendimientoCOP: number | null;
  cdt: InfoCdt | null;
}

/** La TRM más reciente con fecha <= `fecha`. Una TRM futura no vale para hoy. */
export function trmVigente(trms: Trm[], fecha: string): Trm | null {
  return trms.filter((t) => t.fecha <= fecha).sort((a, b) => b.fecha.localeCompare(a.fecha))[0] ?? null;
}

/** Convierte a COP. COP pasa igual; USD multiplica por la TRM y redondea al peso; sin TRM → null. */
export function aCOP(monto: number, moneda: Moneda, trm: Trm | null): number | null {
  if (moneda === "COP") return monto;
  if (!trm) return null;
  return Math.round(monto * trm.valor);
}

const signo = (m: AhorroMovimiento) => (m.tipo === "aporte" ? m.monto : -m.monto);

/** Aportes − retiros de un instrumento hasta `hasta` inclusive. */
export function aportadoHasta(movimientos: AhorroMovimiento[], instrumentoId: string, hasta: string): number {
  return movimientos
    .filter((m) => m.instrumento_id === instrumentoId && m.fecha <= hasta)
    .reduce((s, m) => s + signo(m), 0);
}

/** La valoración más reciente de un instrumento con fecha <= `hasta`, o null. */
export function valoracionHasta(valoraciones: AhorroValoracion[], instrumentoId: string, hasta: string): AhorroValoracion | null {
  return (
    valoraciones
      .filter((v) => v.instrumento_id === instrumentoId && v.fecha <= hasta)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))[0] ?? null
  );
}

function infoCdt(inst: AhorroInstrumento, hoy: string): InfoCdt | null {
  if (inst.tipo !== "cdt" || !inst.vencimiento) return null;
  const dias = diasEntre(hoy, inst.vencimiento);
  const estado: EstadoCdt = dias < 0 ? "vencido" : dias <= 30 ? "por_vencer" : "vigente";
  return { diasAlVencimiento: dias, estado };
}

export function resumenInstrumento(
  inst: AhorroInstrumento,
  movimientos: AhorroMovimiento[],
  valoraciones: AhorroValoracion[],
  trm: Trm | null,
  hoy: string
): ResumenInstrumento {
  const aportado = aportadoHasta(movimientos, inst.id, hoy);
  const ultima = valoracionHasta(valoraciones, inst.id, hoy);
  const valor = ultima ? ultima.valor : aportado;
  const origenValor: OrigenValor = ultima ? { tipo: "valoracion", fecha: ultima.fecha } : { tipo: "aportado" };
  const rendimiento = valor - aportado;
  const aportadoCOP = aCOP(aportado, inst.moneda, trm);
  const valorCOP = aCOP(valor, inst.moneda, trm);
  return {
    instrumento: inst,
    aportado,
    valor,
    origenValor,
    rendimiento,
    rendimientoPct: aportado > 0 ? (rendimiento / aportado) * 100 : null,
    aportadoCOP,
    valorCOP,
    rendimientoCOP: aportadoCOP === null || valorCOP === null ? null : valorCOP - aportadoCOP,
    cdt: infoCdt(inst, hoy),
  };
}
